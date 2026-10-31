// 真實逐館讀取公開資料：不呼叫模型、不傳 LINE、不讀寫個人票根。
import assert from 'node:assert/strict';
import { CinemaSource, taipeiDateTime } from '../src/cinema.mjs';
import { listCinemas } from '../src/cinema-registry.mjs';
const source = new CinemaSource(), queue = [...listCinemas({ brand: '威秀' }).cinemas];
const results = [], date = taipeiDateTime().date;
async function worker() {
  while (queue.length) {
    const cinema = queue.shift();
    const result = await source.schedule({ cinema: cinema.id });
    const summary = { id: cinema.id, cinema: result.cinema, date: result.date, status: result.status, versions: result.movies?.length || 0, fetchedAt: result.fetchedAt };
    console.log(JSON.stringify(summary)); results.push(summary);
  }
}
await Promise.all([worker(), worker()]);
assert.equal(results.length, 22);
assert.ok(results.every(result => result.date === date && result.status === 'ok' && result.versions > 0), '部分分館未取得可驗證的今日場次，請查看上方逐館結果');
console.log(`PASS：${results.length} 間威秀／MUVIE 的 ${date} 分館身分、日期與場次均已驗證。`);
