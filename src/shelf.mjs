import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { ticketSchema } from './store.mjs';
import { AuthError } from './shelf-auth.mjs';

const inputSchema = ticketSchema.extend({ movieId: z.number().int().positive().nullable().default(null) }).strict();
const revisionSchema = z.number().int().positive();
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
const assets = new Map([
  ['/tickets/', ['index.html', 'text/html; charset=utf-8']],
  ['/tickets/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/tickets/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/tickets/assets/poster-fallback-v1.jpg', ['assets/poster-fallback-v1.jpg', 'image/jpeg']],
]);
async function body(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 24_000) throw new AuthError(413, '內容太長，請縮短後再儲存。');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AuthError(400, '無法讀取資料，請重新操作。'); }
}
function checked(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new AuthError(400, '請檢查片名、日期與欄位長度。');
  return result.data;
}
export class TicketShelf {
  constructor({ store, auth, catalog, liffId = '', liffAppType = 'liff' }) { Object.assign(this, { store, auth, catalog, liffId, liffAppType }); }
  get liffUrl() { return this.liffId && this.auth.channelId ? `https://${this.liffAppType === 'miniapp' ? 'miniapp' : 'liff'}.line.me/${this.liffId}` : ''; }
  entry(actor) {
    return { text: '你的私人票匣在這裡。可查看已看過的電影，也能新增、編輯心得。' + (this.liffId && this.auth.channelId ? '請使用 LINE 登入後開啟。' : '專屬入口限本人使用，請勿轉傳；兩分鐘內開啟，使用一次後失效。'),
      actions: [{ label: '開啟我的票匣', uri: this.liffUrl || this.auth.createEntry(actor) }] };
  }
  async ticketInput(raw) {
    const value = checked(inputSchema, raw);
    if (value.watchedOn > today()) throw new AuthError(400, '觀影日期不能晚於今天。');
    let posterPath = null;
    if (value.movieId) {
      const movie = await this.catalog.details(value.movieId);
      if (!movie) throw new AuthError(503, '暫時無法取得電影資料，請稍後再試，或清除電影選擇後手動填寫。');
      value.movieTitle = movie.title; posterPath = movie.posterPath;
    }
    return { ...value, posterPath };
  }
  async handle(request, response) {
    let url;
    try { url = new URL(request.url, this.auth.origin); }
    catch { response.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify({ error: '無法辨識這個網址。' })); return true; }
    if (url.pathname !== '/tickets' && !url.pathname.startsWith('/tickets/') && !url.pathname.startsWith('/api/')) return false;
    const send = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(value));
    };
    try {
      if (url.pathname === '/tickets' && request.method === 'GET') {
        response.writeHead(302, { Location: '/tickets/' + url.search, 'Cache-Control': 'no-store' }); response.end(); return true;
      }
      const asset = assets.get(url.pathname);
      if (asset && ['GET', 'HEAD'].includes(request.method)) {
        const contents = await readFile(new URL('../public/' + asset[0], import.meta.url));
        response.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': contents.length, 'Cache-Control': asset[1] === 'image/jpeg' ? 'public, max-age=31536000, immutable' : 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
          'Content-Security-Policy': "default-src 'self'; script-src 'self' https://static.line-scdn.net; style-src 'self'; img-src 'self' https://image.tmdb.org; connect-src 'self' https://*.line.me https://*.line-scdn.net; frame-src https://*.line.me; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
        response.end(request.method === 'HEAD' ? undefined : contents); return true;
      }
      if (!url.pathname.startsWith('/api/')) throw new AuthError(404, '找不到這個頁面。');
      if (url.pathname === '/api/config' && request.method === 'GET') {
        send(200, { liffId: this.liffId, lineLoginReady: !!this.liffUrl, liffUrl: this.liffUrl }); return true;
      }
      if (['/api/auth/line', '/api/auth/entry'].includes(url.pathname) && request.method === 'POST') {
        this.auth.requireOrigin(request); this.auth.limitLogin(request);
        const value = await body(request);
        let result;
        if (url.pathname.endsWith('/line')) {
          const credential = checked(z.union([z.object({ idToken: z.string() }).strict(), z.object({ accessToken: z.string() }).strict()]), value);
          result = 'idToken' in credential ? await this.auth.loginLine(request, response, credential.idToken) : await this.auth.loginAccessToken(request, response, credential.accessToken);
        } else result = this.auth.redeemEntry(request, response, checked(z.object({ token: z.string() }).strict(), value).token);
        send(200, result); return true;
      }
      const session = request.method === 'GET' ? this.auth.session(request) : this.auth.requireWrite(request);
      if (url.pathname === '/api/session' && request.method === 'GET') { send(200, { user: { displayName: session.name }, csrfToken: session.csrf }); return true; }
      if (url.pathname === '/api/logout' && request.method === 'POST') { this.auth.logout(request, response); send(200, { ok: true }); return true; }
      if (url.pathname === '/api/movies' && request.method === 'GET') {
        const query = checked(z.string().trim().min(1).max(150), url.searchParams.get('query'));
        send(200, await this.catalog.search(query)); return true;
      }
      if (url.pathname === '/api/tickets' && request.method === 'GET') {
        const query = checked(z.string().trim().max(150), url.searchParams.get('query') || '');
        const year = checked(z.string().regex(/^(?:\d{4})?$/), url.searchParams.get('year') || '');
        const page = checked(z.coerce.number().int().min(1).max(1_000_000), url.searchParams.get('page') || 1);
        send(200, this.store.shelfList(session.actor, { query, year, page })); return true;
      }
      if (url.pathname === '/api/tickets' && request.method === 'POST') {
        const key = checked(z.string().uuid(), request.headers['idempotency-key']);
        const result = this.store.shelfCreate(session.actor, key, await this.ticketInput(await body(request)));
        if (result.status === 'conflict') throw new AuthError(409, '這個儲存請求已使用或票根已刪除。請保留心得文字，關閉表單並確認收藏後再操作。');
        send(result.repeated ? 200 : 201, { ticket: result.ticket }); return true;
      }
      const match = /^\/api\/tickets\/([0-9a-f-]{36})$/.exec(url.pathname);
      if (match && request.method === 'GET') {
        const ticket = this.store.shelfTicket(session.actor, match[1]);
        if (!ticket) throw new AuthError(404, '找不到這張票根。');
        send(200, { ticket }); return true;
      }
      if (match && ['PATCH', 'DELETE'].includes(request.method)) {
        const raw = await body(request);
        const parsed = checked(request.method === 'PATCH' ? inputSchema.extend({ revision: revisionSchema }).strict() : z.object({ revision: revisionSchema }).strict(), raw);
        if (!this.store.shelfTicket(session.actor, match[1])) throw new AuthError(404, '找不到這張票根。');
        const { revision, ...value } = parsed;
        const result = request.method === 'PATCH' ? this.store.shelfUpdate(session.actor, match[1], revision, await this.ticketInput(value)) : this.store.shelfDelete(session.actor, match[1], revision);
        if (result.status !== 'ok') throw new AuthError(result.status === 'conflict' ? 409 : 404, result.status === 'conflict' ? '這張票根已在其他頁面修改，請關閉表單並重新開啟最新內容。' : '找不到這張票根。');
        send(200, result.ticket ? { ticket: result.ticket } : { ok: true }); return true;
      }
      throw new AuthError(404, '找不到這個功能。');
    } catch (error) { send(error instanceof AuthError ? error.status : 500, { error: error instanceof AuthError ? error.message : '暫時無法完成操作，請稍後再試。' }); }
    return true;
  }
}
