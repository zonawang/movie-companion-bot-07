import { get } from 'node:https';

// 只讀公開頁面；不跟隨轉址、不帶登入 cookie、不處理驗證挑戰。
export function fetchSchedulePage(url, { headers, signal }) {
  return new Promise((resolve, reject) => {
    const request = get(url, { headers, signal }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        resolve(new Response(null, { status: response.statusCode || 502 }));
        return;
      }
      const chunks = []; let length = 0;
      response.on('data', chunk => {
        length += chunk.length;
        if (length > 2_000_000) { request.destroy(new Error('Page too large')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: 200 })));
    });
    request.on('error', reject);
  });
}
