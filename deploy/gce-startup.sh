#!/bin/bash
set -euo pipefail
umask 077
export DEBIAN_FRONTEND=noninteractive
metadata() { curl -fsS --retry 3 -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"; }
app_project="$(metadata app-project)"
app_release="$(metadata app-release)"
app_repository="$(metadata app-repository || printf zonawang/movie-companion-bot-06-flex-message)"
[[ "$app_repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]
[[ "$app_release" =~ ^[0-9a-f]{40}$ ]]
app_domain="$(metadata app-domain)"
app_secret="$(metadata app-secret)"
node_version="$(metadata node-version)"

if ! command -v caddy >/dev/null || ! test -x /usr/local/bin/node; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl xz-utils caddy python3 sqlite3
fi
if ! test -f /swapfile; then
  fallocate -l 512M /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi
if ! test -x /usr/local/bin/node || test "$(/usr/local/bin/node --version)" != "$node_version"; then
  install -d -m 700 /tmp/movie-bot-node
  cd /tmp/movie-bot-node
  node_archive="node-${node_version}-linux-x64.tar.xz"
  curl -fsS --retry 3 -O "https://nodejs.org/dist/${node_version}/${node_archive}"
  curl -fsS --retry 3 -o SHASUMS256.txt "https://nodejs.org/dist/${node_version}/SHASUMS256.txt"
  awk -v file="$node_archive" '$2==file { print }' SHASUMS256.txt > selected.sha256
  test -s selected.sha256
  sha256sum -c selected.sha256
  tar -xJf "$node_archive" --strip-components=1 -C /usr/local
fi
id moviebot >/dev/null 2>&1 || useradd --system --home-dir /var/lib/movie-bot --shell /usr/sbin/nologin moviebot
install -d -m 700 -o moviebot -g moviebot /var/lib/movie-bot
install -d -m 700 /etc/movie-bot
install -d -m 755 /opt/movie-bot/releases
if ! test -f "/opt/movie-bot/releases/${app_release}/package.json"; then
  install -d -m 755 "/opt/movie-bot/releases/${app_release}"
  curl -fsS --retry 3 "https://codeload.github.com/${app_repository}/tar.gz/${app_release}" | tar -xz --strip-components=1 -C "/opt/movie-bot/releases/${app_release}"
  cd "/opt/movie-bot/releases/${app_release}"
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund
  chmod -R a+rX "/opt/movie-bot/releases/${app_release}"
fi
ln -sfn "/opt/movie-bot/releases/${app_release}" /opt/movie-bot/app

# Read runtime credentials from Secret Manager through the VM identity, never metadata.
python3 - "$app_project" "$app_secret" <<'PY'
import base64,json,os,sys,urllib.request
project,secret=sys.argv[1:]
request=urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',headers={'Metadata-Flavor':'Google'})
with urllib.request.urlopen(request,timeout=15) as response:token=json.load(response)['access_token']
request=urllib.request.Request(f'https://secretmanager.googleapis.com/v1/projects/{project}/secrets/{secret}/versions/latest:access',headers={'Authorization':'Bearer '+token})
with urllib.request.urlopen(request,timeout=15) as response:content=base64.b64decode(json.load(response)['payload']['data'])
path='/etc/movie-bot/environment'
with open(path,'wb') as stream:stream.write(content)
os.chmod(path,0o600)
PY
cat > /etc/systemd/system/movie-bot.service <<'UNIT'
[Unit]
Description=Movie Companion Bot 06 Flex Message
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=moviebot
Group=moviebot
WorkingDirectory=/opt/movie-bot/app
EnvironmentFile=/etc/movie-bot/environment
ExecStart=/usr/local/bin/node --max-old-space-size=384 src/server.mjs
Restart=always
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/movie-bot
MemoryMax=640M

[Install]
WantedBy=multi-user.target
UNIT
cat > /opt/movie-bot/backup.py <<'BACKUP'
from pathlib import Path
import sqlite3,datetime,os
root=Path('/var/lib/movie-bot')
destination=root/'backups'
destination.mkdir(exist_ok=True,mode=0o700)
path=destination/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.sqlite')
with sqlite3.connect('file:'+str(root/'movie-bot.sqlite')+'?mode=ro',uri=True) as source,sqlite3.connect(path) as target:
    source.backup(target)
os.chmod(path,0o600)
for old in sorted(destination.glob('*.sqlite'),reverse=True)[7:]:
    old.unlink()
BACKUP
chmod 644 /opt/movie-bot/backup.py
cat > /etc/systemd/system/movie-bot-backup.service <<'BACKUP_SERVICE'
[Unit]
Description=Back up movie bot tickets
[Service]
Type=oneshot
User=moviebot
Group=moviebot
UMask=0077
ExecStart=/usr/bin/python3 /opt/movie-bot/backup.py
BACKUP_SERVICE
cat > /etc/systemd/system/movie-bot-backup.timer <<'BACKUP_TIMER'
[Unit]
Description=Daily movie bot SQLite backup
[Timer]
OnCalendar=daily
Persistent=true
[Install]
WantedBy=timers.target
BACKUP_TIMER
chmod 644 /etc/systemd/system/movie-bot-backup.service /etc/systemd/system/movie-bot-backup.timer
cat > /etc/caddy/Caddyfile <<CADDY
${app_domain} {
    encode gzip
    header X-Movie-Bot-Version "06"
    @api path /health /webhook /tickets /tickets/* /api/*
    handle @api {
        reverse_proxy 127.0.0.1:3002
    }
    handle /privacy {
        redir https://github.com/${app_repository}/blob/main/docs/privacy.md 302
    }
    handle /terms {
        redir https://github.com/${app_repository}/blob/main/docs/terms.md 302
    }
    handle {
        respond "Movie Companion Bot 06 Flex Message" 200
    }
}
CADDY
chmod 644 /etc/caddy/Caddyfile /etc/systemd/system/movie-bot.service
caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable movie-bot caddy movie-bot-backup.timer
systemctl restart movie-bot caddy movie-bot-backup.timer
printf 'Movie Bot 06 provisioning completed.\n'
