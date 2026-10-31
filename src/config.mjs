import 'dotenv/config';

export function config(env = process.env, { line = false } = {}) {
  const mode = env.MOVIE_DATA_MODE || 'demo';
  if (!['demo', 'tmdb'].includes(mode)) throw new Error('MOVIE_DATA_MODE 請設為 demo 或 tmdb');
  const required = ['GEMINI_API_KEY'];
  if (line) required.push('LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN');
  if (mode === 'tmdb') required.push('TMDB_READ_ACCESS_TOKEN');
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`請在本機 .env 填入：${missing.join(', ')}`);
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必須介於 1～65535');
  const publicBaseUrl = env.PUBLIC_BASE_URL?.trim() || `http://127.0.0.1:${port}`;
  let base; try { base = new URL(publicBaseUrl); } catch { throw new Error('PUBLIC_BASE_URL 請填入完整 HTTPS 網址'); }
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))) throw new Error('PUBLIC_BASE_URL 必須是 HTTPS origin；本機可用 http://127.0.0.1:PORT');
  const liffId = env.LIFF_ID?.trim() || '', loginChannelId = env.LINE_LOGIN_CHANNEL_ID?.trim() || '';
  if (liffId && !/^\d+-[A-Za-z0-9]+$/.test(liffId)) throw new Error('LIFF_ID 格式不正確');
  if (loginChannelId && !/^\d+$/.test(loginChannelId)) throw new Error('LINE_LOGIN_CHANNEL_ID 必須是數字');
  const liffAppType = env.LIFF_APP_TYPE?.trim() || 'liff';
  if (!['liff', 'miniapp'].includes(liffAppType)) throw new Error('LIFF_APP_TYPE 請設為 liff 或 miniapp');
  if (!!liffId !== !!loginChannelId || (liffId && liffId.split('-')[0] !== loginChannelId)) throw new Error('LIFF_ID 與 LINE_LOGIN_CHANNEL_ID 必須成對設定為同一個環境');
  return {
    mode, port, model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    database: env.SQLITE_PATH || './data/movie-bot.sqlite',
    channelSecret: env.LINE_CHANNEL_SECRET,
    channelToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    tmdbToken: env.TMDB_READ_ACCESS_TOKEN?.trim(),
    mapsApiKey: env.GOOGLE_MAPS_API_KEY?.trim(),
    publicBaseUrl: base.origin, liffId, loginChannelId, liffAppType,
  };
}
