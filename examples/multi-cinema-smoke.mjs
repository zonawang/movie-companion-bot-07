// 只讀公開場次，不呼叫 Gemini、不傳送 LINE 訊息、不讀寫票根。
import assert from 'node:assert/strict';
import { CinemaSource, formatCinemaSchedules, taipeiDateTime } from '../src/cinema.mjs';
const source = new CinemaSource();
const today = taipeiDateTime().date;
const results = await source.compare({ cinemas: ['信義威秀', '西門威秀'], afterTime: '18:00', onlyUpcoming: false });
for (const result of results) {
  assert.ok(['ok', 'no_upcoming'].includes(result.status), `${result.cinema}: ${result.status}`);
  assert.equal(result.date, today);
  assert.equal(result.provider, 'atmovies');
  assert.ok(result.fetchedAt);
}
console.log(formatCinemaSchedules(results));
console.log(`PASS：讀到 ${results.length} 間分館 ${today} 的第三方時刻表；無 Gemini／LINE／資料庫寫入。`);
