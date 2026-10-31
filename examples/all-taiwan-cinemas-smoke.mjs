// 逐館驗證已登錄來源。不呼叫 Gemini、不發 LINE、不讀寫票根。
import assert from 'node:assert/strict';
import { CinemaSource, taipeiDateTime } from '../src/cinema.mjs';
import { cinemas } from '../src/cinema-registry.mjs';
const source = new CinemaSource(), queue = [...cinemas], results = [], date = taipeiDateTime().date;
async function worker() {
  while (queue.length) {
    const cinema = queue.shift(), result = await source.schedule({ cinema: cinema.id });
    const row = { id: cinema.id, name: cinema.name, county: cinema.county, status: result.status, date: result.date, versions: result.movies?.length || 0 };
    results.push(row); console.log(JSON.stringify(row));
  }
}
await Promise.all([worker(), worker()]);
const issues = results.filter(row => row.status !== 'links_only' && !(row.status === 'ok' && row.date === date && row.versions > 0));
console.log('SUMMARY',JSON.stringify({ total: results.length, structured: results.filter(row => row.status === 'ok').length, linksOnly: results.filter(row => row.status === 'links_only').length, issues }));
assert.equal(results.length,108); assert.equal(issues.length,0,'有來源未通過驗證，請查看 SUMMARY；勿宣稱全部有可讀場次');
console.log('PASS：全台已登錄來源逐館驗證完成；圖片入口與可解析場次分開標示。');
