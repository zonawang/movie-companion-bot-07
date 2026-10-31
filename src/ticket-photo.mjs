export const MAX_IMAGE_BYTES = 5_000_000;
export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const ticketPhotoPrompt = [
  '我傳了一張電影票根或購票證明圖片。',
  '請只根據圖片上清楚可見的文字，辨識電影名稱（movieTitle）、觀影日期（watchedOn，轉為 YYYY-MM-DD）與影院名稱（cinema）。',
  '若片名與完整觀影日期都清楚，請呼叫 prepare_ticket 建立票根草稿；companions 與 note 必須填空字串，不可將票面印刷字樣、廳別、座位、票種、價格或宣傳標語當成個人心得或同伴。',
  '若圖片模糊、缺少片名、缺少西元年份或日期，或不是電影票根，請勿猜測也不要呼叫 prepare_ticket，直接說明看得到哪些資訊、還缺少什麼。',
].join('');

export function detectImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return 'image/png';
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp';
  return null;
}

export function validImagePart(image) {
  if (!image || typeof image !== 'object') return false;
  if (!ALLOWED_IMAGE_TYPES.has(image.mimeType)) return false;
  if (typeof image.data !== 'string' || !image.data.trim()) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data) || image.data.length % 4 !== 0) return false;
  const buffer = Buffer.from(image.data, 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return false;
  return detectImageMimeType(buffer) === image.mimeType;
}

export async function fetchLineImage(token, messageId, fetcher = fetch) {
  if (!token || !/^[A-Za-z0-9_-]{1,120}$/.test(String(messageId || ''))) {
    return { status: 'invalid', message: '無法識別這張圖片訊息，請重新傳送票根照片。' };
  }
  try {
    const response = await fetcher(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
      headers: { Authorization: `Bearer ${token}`, accept: 'image/jpeg, image/png, image/webp' },
      signal: AbortSignal.timeout(8_000),
      redirect: 'error',
    });
    if (!response.ok) {
      return { status: 'unavailable', message: '暫時無法從 LINE 讀取這張照片，請稍後再試，或直接輸入片名與觀影日期。' };
    }
    const declaredLength = Number(response.headers?.get?.('content-length') || 0);
    if (declaredLength > MAX_IMAGE_BYTES) {
      return { status: 'too_large', message: '這張照片超過 5 MB 上限，請壓縮或裁切票根區域後再傳送。' };
    }
    const chunks = [];
    let length = 0;
    if (response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
      for await (const chunk of response.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += buf.length;
        if (length > MAX_IMAGE_BYTES) {
          return { status: 'too_large', message: '這張照片超過 5 MB 上限，請壓縮或裁切票根區域後再傳送。' };
        }
        chunks.push(buf);
      }
    } else {
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) {
        return { status: 'too_large', message: '這張照片超過 5 MB 上限，請壓縮或裁切票根區域後再傳送。' };
      }
      chunks.push(buf);
    }
    const buffer = Buffer.concat(chunks);
    const detectedMime = detectImageMimeType(buffer);
    const headerMime = (response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!detectedMime || !ALLOWED_IMAGE_TYPES.has(detectedMime) || (headerMime && headerMime !== 'application/octet-stream' && headerMime !== detectedMime)) {
      return { status: 'unsupported_type', message: '只支援 JPG、PNG 或 WebP 格式的電影票根照片，請換一張照片或改用文字輸入。' };
    }
    return {
      status: 'ok',
      image: { mimeType: detectedMime, data: buffer.toString('base64'), byteLength: buffer.length },
    };
  } catch {
    return { status: 'unavailable', message: '讀取票根照片逾時或連線失敗，請稍後再試，或直接用文字輸入片名與觀影日期。' };
  }
}

export function scrubSessionImages(session, actor) {
  const events = session?.runner?.sessionService?.sessions?.[session.runner.appName]?.[actor]?.[session.id]?.events;
  if (!Array.isArray(events)) return;
  for (const event of events) {
    const parts = event?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]?.inlineData) {
        parts[i] = { text: '[已讀取使用者傳送的電影票根圖片；原始圖片不保留於對話記憶體]' };
      }
    }
  }
}
