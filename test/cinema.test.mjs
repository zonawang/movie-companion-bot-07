import test from 'node:test';
import assert from 'node:assert/strict';
import { CinemaSource, parseEsliteSchedule, formatCinemaSchedule, taipeiDateTime } from '../src/cinema.mjs';

// 自製測試資料，僅模擬官網結構；片名與場次不代表真實公告。
const box = (title, dates) => `<div class="box"><div class="intro"><div class="left"><p>${title}</p><a class="btn-detail-intro" href="/tw/tc/artshow/test">電影介紹</a></div></div><div class="time-swiper">${dates.map(([date, times]) => `<div class="swiper-slide"><p>${date}</p><ul>${times.map(time => `<li>${time}</li>`).join('')}</ul></div>`).join('')}</div></div>`;
const page = (updated = '2026-10-25 00:00', boxes = [
  box('測試片 A &amp; B', [['10/25(日)', ['10:00', '18:00', '21:30']], ['10/26(一)', ['13:00']]]),
  box('測試片 C', [['10/25(日)', ['17:00']], ['10/27(二)', ['20:00']]]),
]) => `<div class="film_waring"><span>最後更新時間：${updated}</span></div><div class="film_list">${boxes.join('')}</div>`;
const current = () => new Date('2026-10-25T10:30:00Z'); // 台灣 18:30
const source = (html = page(), now = current) => new CinemaSource({ now, fetcher: async () => new Response(html) });

test('解析片名、HTML entity、日期與同一天多場，僅保留官方域名的介紹連結', () => {
  const result = parseEsliteSchedule(page());
  assert.equal(result.movies[0].title, '測試片 A & B');
  assert.deepEqual(result.movies[0].days[0], { date: '2026-10-25', times: ['10:00', '18:00', '21:30'] });
  assert.match(result.movies[0].detailUrl, /^https:\/\/meet.eslite.com\//);
  const bad = page().replaceAll('/tw/tc/artshow/test', 'https://evil.test/redirect');
  assert.equal(parseEsliteSchedule(bad).movies[0].detailUrl, null);
});
test('以台灣時間篩選尚未開演與使用者指定時段，不把別天的時間混進來', async () => {
  const cinema = source();
  assert.deepEqual(taipeiDateTime(current()), { date: '2026-10-25', time: '18:30' });
  const today = await cinema.schedule({ onlyUpcoming: true, afterTime: '18:00' });
  assert.equal(today.status, 'ok');
  assert.equal(today.movies.length, 1);
  assert.deepEqual(today.movies[0].times, ['21:30']);
  const tomorrow = await cinema.schedule({ date: '2026-10-26', onlyUpcoming: true });
  assert.deepEqual(tomorrow.movies[0].times, ['13:00']);
  assert.match(formatCinemaSchedule(today), /18:30 起/);
});
test('跨年用官方更新日期辨識年份，不把明年一月的場次當成今年', async () => {
  const cinema = source(page('2026-12-31 00:00', [box('跨年測試片', [['1/1(五)', ['13:00']]])]), () => new Date('2026-12-31T00:00:00Z'));
  const result = await cinema.schedule({ date: '2027-01-01' });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.publishedDates, ['2027-01-01']);
});
test('區分未公告與目前時段無場次，不宣稱影城停映或售完', async () => {
  const cinema = source();
  const late = await cinema.schedule({ afterTime: '23:00' });
  assert.equal(late.status, 'no_upcoming');
  const unknown = await cinema.schedule({ date: '2026-11-02' });
  assert.equal(unknown.status, 'not_published');
  assert.match(formatCinemaSchedule(unknown), /不能判定當天沒有電影/);
});
test('不支援影城、錯誤日期、歷史日期皆不發出網路請求', async () => {
  const cinema = new CinemaSource({ now: current, fetcher: () => { throw new Error('不應呼叫'); } });
  assert.equal((await cinema.schedule({ cinema: '不存在的影城' })).status, 'unsupported_cinema');
  assert.equal((await cinema.schedule({ date: '2026-02-30' })).status, 'invalid');
  assert.equal((await cinema.schedule({ date: '2026-10-24' })).status, 'past_date');
});
test('合併同時請求並快取 5 分鐘，更新失敗時不把過期快取當即時資料', async () => {
  let now = current(), calls = 0, fail = false;
  const cinema = new CinemaSource({ now: () => now, fetcher: async () => { calls++; return new Response(fail ? 'error' : page(), { status: fail ? 503 : 200 }); } });
  await Promise.all([cinema.schedule(), cinema.schedule(), cinema.schedule()]);
  assert.equal(calls, 1);
  fail = true; now = new Date(now.valueOf() + 301_000);
  assert.equal((await cinema.schedule()).status, 'unavailable');
  assert.equal((await cinema.schedule()).status, 'unavailable');
  assert.equal(calls, 2);
});
test('官網格式變更與不合法時間，回覆無法讀取並保留官方入口', async () => {
  const changed = await source('<html>maintenance</html>').schedule();
  assert.equal(changed.status, 'unavailable');
  assert.match(formatCinemaSchedule(changed), /官方時刻表：https:/);
  assert.throws(() => parseEsliteSchedule(page().replace('21:30', '99:99')));
});
