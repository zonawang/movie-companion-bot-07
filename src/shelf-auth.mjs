import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const fingerprint = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class AuthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export class ShelfAuth {
  constructor({ channelId = '', baseUrl, fetcher = fetch, now = () => Date.now(), secureCookies = true } = {}) {
    this.channelId = channelId; this.origin = new URL(baseUrl).origin; this.fetcher = fetcher; this.now = now;
    this.secureCookies = secureCookies; this.cookieName = secureCookies ? '__Host-movie_shelf' : 'movie_shelf';
    this.sessions = new Map(); this.entries = new Map(); this.attempts = new Map();
  }
  cleanup() {
    const now = this.now();
    for (const collection of [this.sessions, this.entries, this.attempts]) for (const [key, value] of collection) if (value.expires <= now) collection.delete(key);
  }
  requireOrigin(request) {
    if (request.headers.origin !== this.origin) throw new AuthError(403, '這個操作無法從目前頁面執行，請重新開啟票匣。');
  }
  limitLogin(request) {
    this.cleanup();
    const key = request.socket.remoteAddress || 'unknown';
    let value = this.attempts.get(key);
    if (!value) { if (this.attempts.size >= 2000) throw new AuthError(429, '登入請求較多，請稍後再試。'); value = { count: 0, expires: this.now() + 60_000 }; this.attempts.set(key, value); }
    if (++value.count > 40) throw new AuthError(429, '登入請求較多，請稍後再試。');
  }
  cookieToken(request) {
    const raw = request.headers.cookie || '';
    const token = raw.split(';').map(value => value.trim()).find(value => value.startsWith(this.cookieName + '='))?.slice(this.cookieName.length + 1);
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
  }
  session(request) {
    this.cleanup(); const token = this.cookieToken(request);
    const session = token ? this.sessions.get(fingerprint(token)) : null;
    if (!session) throw new AuthError(401, '登入已過期，請從 LINE 重新開啟票匣。');
    return session;
  }
  requireWrite(request) {
    this.requireOrigin(request);
    const session = this.session(request);
    if (!equal(request.headers['x-csrf-token'], session.csrf)) throw new AuthError(403, '這個頁面已失效，請重新開啟票匣。');
    return session;
  }
  createSession(request, response, { actor, name = '電影旅人', expires = this.now() + 60 * 60_000 }) {
    this.cleanup();
    if (this.sessions.size >= 1000) throw new AuthError(503, '目前使用人數較多，請稍後再試。');
    const previous = this.cookieToken(request); if (previous) this.sessions.delete(fingerprint(previous));
    const token = random(), csrf = random();
    const session = { actor, name: name.slice(0, 100), csrf, expires: Math.min(expires, this.now() + 60 * 60_000) };
    this.sessions.set(fingerprint(token), session);
    response.setHeader('Set-Cookie', `${this.cookieName}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.max(1, Math.floor((session.expires - this.now()) / 1000))}${this.secureCookies ? '; Secure' : ''}`);
    return { user: { displayName: session.name }, csrfToken: csrf };
  }
  logout(request, response) {
    const token = this.cookieToken(request); if (token) this.sessions.delete(fingerprint(token));
    response.setHeader('Set-Cookie', `${this.cookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${this.secureCookies ? '; Secure' : ''}`);
  }
  createEntry(actor) {
    this.cleanup();
    if (this.entries.size >= 1000) throw new AuthError(503, '目前使用人數較多，請稍後再試。');
    // Replace unused links for this user; a new entry does not invalidate an already open session.
    for (const [key, value] of this.entries) if (value.actor === actor) this.entries.delete(key);
    const token = random(); this.entries.set(fingerprint(token), { actor, expires: this.now() + 120_000 });
    return `${this.origin}/tickets/#entry=${token}`;
  }
  redeemEntry(request, response, token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthError(401, '入口已失效，請回 LINE 再輸入「我的票匣」。');
    this.cleanup(); const key = fingerprint(token), entry = this.entries.get(key);
    if (!entry) throw new AuthError(401, '入口已失效，請回 LINE 再輸入「我的票匣」。');
    this.entries.delete(key);
    return this.createSession(request, response, { actor: entry.actor });
  }
  async loginLine(request, response, idToken) {
    if (!this.channelId) throw new AuthError(503, 'LINE 登入準備中，請先從聊天室輸入「我的票匣」開啟。');
    if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 10000) throw new AuthError(401, '無法確認 LINE 身分，請重新登入。');
    let result;
    try {
      result = await this.fetcher('https://api.line.me/oauth2/v2.1/verify', { method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id_token: idToken, client_id: this.channelId }),
        signal: AbortSignal.timeout(5000) });
    } catch { throw new AuthError(503, 'LINE 登入暫時無法連線，請稍後再試。'); }
    if (result.status === 429 || result.status >= 500) throw new AuthError(503, 'LINE 登入暫時無法使用，請稍後再試。');
    if (!result.ok) throw new AuthError(401, 'LINE 登入已失效，請重新登入。');
    let profile; try { profile = await result.json(); } catch { throw new AuthError(503, 'LINE 登入暫時無法使用。'); }
    if (profile.iss !== 'https://access.line.me' || String(profile.aud) !== this.channelId || !/^U[0-9a-f]{32}$/.test(profile.sub || '')
      || !Number.isFinite(profile.exp) || profile.exp * 1000 <= this.now()) throw new AuthError(401, '無法確認 LINE 身分，請重新登入。');
    return this.createSession(request, response, { actor: profile.sub, name: typeof profile.name === 'string' ? profile.name : '電影旅人', expires: profile.exp * 1000 });
  }
  async loginAccessToken(request, response, accessToken) {
    if (!this.channelId) throw new AuthError(503, 'LINE 登入準備中，請稍後再試。');
    if (typeof accessToken !== 'string' || !/^[\x21-\x7e]{20,10000}$/.test(accessToken)) throw new AuthError(401, '無法確認 LINE 身分，請重新登入。');
    const verifiedAt = this.now();
    const verifyUrl = new URL('https://api.line.me/oauth2/v2.1/verify');
    verifyUrl.searchParams.set('access_token', accessToken);
    const call = async (url, options = {}) => {
      let result;
      try { result = await this.fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) }); }
      catch { throw new AuthError(503, 'LINE 登入暫時無法連線，請稍後再試。'); }
      if (result.status === 429 || result.status >= 500) throw new AuthError(503, 'LINE 登入暫時無法使用，請稍後再試。');
      if (!result.ok) throw new AuthError(401, 'LINE 登入已失效，請重新開啟票匣。');
      try { return await result.json(); } catch { throw new AuthError(503, 'LINE 登入暫時無法使用。'); }
    };
    const verified = await call(verifyUrl);
    if (String(verified.client_id) !== this.channelId || !Number.isFinite(verified.expires_in) || verified.expires_in <= 0) throw new AuthError(401, '無法確認 LINE 身分，請重新登入。');
    if (typeof verified.scope !== 'string' || !verified.scope.split(/\s+/).includes('profile')) throw new AuthError(403, 'LINE 尚未提供登入所需的個人資料授權，請重新授權後再試。');
    // Only LINE's server may supply the actor. Never trust profile/userId values posted by the browser.
    const profile = await call('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${accessToken}` } });
    const expires = verifiedAt + verified.expires_in * 1000;
    if (typeof profile.userId !== 'string' || !/^U[0-9a-f]{32}$/.test(profile.userId) || expires <= this.now()) throw new AuthError(401, '無法確認 LINE 身分，請重新登入。');
    return this.createSession(request, response, { actor: profile.userId, name: typeof profile.displayName === 'string' ? profile.displayName : '電影旅人', expires });
  }
}
