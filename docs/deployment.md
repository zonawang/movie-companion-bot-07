# Bot 04 LIFF 雲端部署

本版使用 Google Compute Engine 常駐執行，保留 SQLite 與非同步 webhook 工作佇列，不依賴個人電腦或 Quick Tunnel。

## 資源

| 項目 | 設定 |
| --- | --- |
| 專案 | `free-9000` |
| 主機 | `movie-bot-03`，`us-west1-b`，`e2-micro` |
| 磁碟 | 30 GB `pd-standard`，刪除主機時不自動刪除此磁碟 |
| 公開 IP | `136.67.154.252`（保留的固定 IPv4） |
| HTTPS | `https://movie-bot-03.136-67-154-252.sslip.io` |
| Webhook | 上述網址的 `/webhook` |
| LINE | Zona Movie，`@796qcwyz` |
| 程式來源 | `/opt/movie-bot/releases/<commit>`，`/opt/movie-bot/app` 為目前版本連結 |
| 票根與事件 | `/var/lib/movie-bot/movie-bot.sqlite` |
| 金鑰 | Secret Manager 的 `movie-bot-03-env`；不在 GitHub 或 VM metadata |
| 執行身分 | 獨立 service account，只授權讀取這一份 Secret Manager secret |
| 管理 | IAP SSH；對外只開 HTTP/HTTPS，SSH 不對網際網路開放 |

Google Maps key 限定 `places.googleapis.com` 且限定本機固定 IP 使用。Gemini、LINE 與 TMDB 設定沿用既有電影 Bot，Map key 為獨立建立。

HTTPS 由 Caddy 管理，使用 sslip.io 公開 DNS 與自動更新憑證。網域依賴第三方 DNS；日後可換成自己的網域，更新 VM 的 `app-domain` metadata、Caddy 設定與 LINE webhook。沒有再使用短期 tunnel。

## 啟動與管理

`deploy/gce-startup.sh` 為可重複執行的 VM startup script，從下列非機密 metadata 讀取設定：`app-project`、`app-repository`、`app-release`、`app-domain`、`app-secret`、`node-version`。應用程式來源固定到完整 commit，Node.js 官方套件經 SHA-256 驗證。

```bash
gcloud compute ssh movie-bot-03 --project=free-9000 --zone=us-west1-b --tunnel-through-iap
sudo systemctl status movie-bot caddy
sudo journalctl -u movie-bot --since '30 minutes ago'
sudo systemctl restart movie-bot
```

程序由 systemd 在開機自動啟動、失敗自動重啟，以獨立使用者執行。應用程式只監聽 loopback 的 3002，Caddy 處理外部 HTTPS。Secret Manager 內容由 VM 身分在 startup 時讀入 root-only 的 `/etc/movie-bot/environment`。

變更 Secret Manager 後，需要重跑 startup script 取得新內容，再重啟服務；不要把金鑰放入命令參數、聊天或版本控制。

```bash
sudo google_metadata_script_runner startup
```

更新版本時，先完成測試、備份資料，再將 `app-release` 設為已提交的完整 commit，更新 startup script metadata 並重跑。依賴不完整的版本不要切入；需回復時將 release 指回上一個已驗證的 commit。

## 備份與還原

票根在持久磁碟上。另有每日 SQLite 線上備份 timer，保留最近 7 份於 `/var/lib/movie-bot/backups/`；備份和主資料位於同一磁碟，不能取代異地災難備援。

```bash
sudo systemctl start movie-bot-backup.service
sudo systemctl status movie-bot-backup.timer
```

還原時先停止 `movie-bot`，備份現況，再將選定 SQLite 複本還原為主資料庫，確認擁有者 `moviebot:moviebot`、權限 600，最後啟動並核對票根。不要直接複製正在寫入的 SQLite；請使用 SQLite backup API。

## 費用

Google Free Tier 提供符合資格地區的每月一台 e2-micro 使用時數與 30 GB-month 標準磁碟，額度以帳戶合計，不保證此專案永遠免費。[官方免費額度](https://docs.cloud.google.com/free/docs/free-cloud-features)

使用中的一般 VM 外部 IPv4 定價為 US$0.005／小時，持續 730 小時約 US$3.65／月，另計超額傳輸與 Maps／Gemini API 費用。[官方網路費率](https://cloud.google.com/vpc/network-pricing)

若停止使用，應先備份票根，再停用服務、刪除不需要的 VM／磁碟／IP 並撤銷專用 Maps key。單純停止 VM 仍可能產生磁碟及保留 IP 費用。

## 本次切換紀錄

2026-10-26 15:42（Asia/Taipei）已將原有 Zona Movie 的 webhook 切到本主機，Use webhook 為啟用，LINE 官方驗證 200 OK。原有 1 筆票根的 ID、使用者、完整 payload 與建立時間以 SHA-256 核對一致。

本機執行環境禁止對舊程序傳送停止訊號，因此改用 `deploy/maintenance.mjs` 暫時接收已簽章事件並寫入雲端 SQLite，等待舊事件完成後，以交易合併原有 tickets／drafts／jobs，保留切換期間的雲端事件，再啟動正常 worker。維護 receiver 已停止，Caddy 已回到正常服務。

舊本機程序未被強制終止，但 LINE 不再指向它；新的票根以雲端資料庫為準。舊資料庫及本次私有遷移備份保留，沒有提交到 GitHub。

真實 Maps 已查到京站威秀與光點台北並取得對應場次；誠品南西不在既有場次來源中，維持提供入口而不猜片單。真實 Gemini／ADK 已驗證 LINE 定位與文字地標工具選擇；台北車站有多個地圖候選時會要求補充或傳定位。

75 項測試與 [GitHub CI](https://github.com/zonawang/movie-companion-bot-03/actions/runs/40286635062) 通過。HTTPS 健康檢查 200，未簽章 webhook 回傳 401，systemd 開機啟動與每日備份 timer 已啟用。

## Bot 04 票匣更新

沿用同一台 VM、同一網域、同一份 SQLite 與每日備份，不另外建立主機。`app-repository` 設為 `zonawang/movie-companion-bot-04-liff`，`app-release` 固定到此 repo 已通過測試的完整 commit；startup script 改為本 repo 的版本。Caddy 另將 `/tickets`、`/tickets/*`、`/api/*` 代理到同一服務，原 `/webhook` 不需更改。

新增環境設定 `PUBLIC_BASE_URL=https://movie-bot-03.136-67-154-252.sslip.io`。`LIFF_ID` 與 `LINE_LOGIN_CHANNEL_ID` 尚未建立時留空，使用聊天室「我的票匣」的短效入口。正式 LIFF 註冊步驟見 [LIFF 設定](liff-setup.md)。

資料庫只新增 `ticket_meta` 與 `ticket_requests`，原 `tickets` 四欄結構維持相容；既有票根預設 revision 1，初次編輯建立 metadata。更新前先建立 SQLite 線上備份；不要拿舊本機資料庫覆蓋雲端資料。

登入與專屬入口暫存在單一程序記憶體，重啟會失效。此版本適用目前單 VM、單程序；若改成多台或多 worker，應先導入共用 session／入口儲存，再擴展服務。公開網頁與 API 都不快取私人回應；不要在反向代理開啟私人 API 快取或記錄 cookie／入口內容。

票匣 CRUD 不呼叫 Gemini；電影選擇會使用既有 TMDB token。地圖與聊天功能仍沿用原服務和用量設定。


## 2026-10-27 MINI App Developing 設定

目前已取得 Developing LIFF ID `2012222030-OFWyoaEd`，配對 Channel ID `2012222030`，`LIFF_APP_TYPE=miniapp`。Bot 入口使用 `https://miniapp.line.me/`，後端驗證仍固定檢查該 Channel ID 的 audience。Review／Published 尚未啟用。

LINE Console 的 Endpoint URL 與測試者邀請需另行確認，與 Google Cloud Secret Manager 設定是不同的操作。更新前會建立 `pre-miniapp-20261027.sqlite` 線上備份，保留既有票根；設定更新後需重新載入服務。


## 2026-10-27 切換 Published

正式 LIFF ID 改為 `2012222034-AVyO2nk3`，配對 Channel ID `2012222034`；`LIFF_APP_TYPE=miniapp` 與原 HTTPS origin 維持一致。Published 公開入口頁中的 Endpoint URL 已核對為票匣網址。此變更只更新 Secret Manager 並重新載入既有服務，程式執行版本維持 `afcb7ccf69ab7bd742b612eddd1e98aa642672f5`。

更新前另建 SQLite 線上備份 `pre-published-20261027.sqlite`，原 Developing 備份繼續保留。Developing 的公開 ID 保留在設定文件，正式 Bot 不再指向它。目前是未認證 MINI App；切換 Published 不代表取得 LINE 認證標章。


## Bot 05 Rich Menu

更新 `app-repository` 為 `zonawang/movie-companion-bot-05-richmenu`，`app-release` 指向此 repo 已驗證的完整版本，startup script 使用 Bot 05。其餘 GCP 資源、Secret Manager、Published MINI App 與 SQLite 路徑沿用，原 LINE webhook 與 Endpoint URL 不更改。

先備份並部署 Bot 05，完成真實 ADK 功能入口測試，再從主機以既有環境檔執行 `scripts/richmenu.mjs apply --state-file /var/lib/movie-bot/richmenu-install-05.json`。LINE token 只透過環境檔載入，不放在 shell 參數或 Git。不要在服務尚不支援新 postback 時先啟用新選單。完整流程見 [Rich Menu 設計](richmenu.md)。
