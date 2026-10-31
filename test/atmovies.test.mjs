import test from 'node:test';
import assert from 'node:assert/strict';
import { AtmoviesSource, parseAtmoviesSchedule } from '../src/atmovies.mjs';
import { cinemas, findCinema, listCinemas } from '../src/cinema-registry.mjs';
import { CinemaSource, formatCinemaSchedule, formatCinemaSchedules, formatCinemaList } from '../src/cinema.mjs';

// 自製片名與時間，只模擬實際檢查過的 DOM 結構，不複製官網片單。
export const entry = (title, version, times, href = '/movie/test123/') => `<ul id="theaterShowtimeTable"><li class="filmTitle"><a href="${href}">${title}</a></li><li><ul><li>片長：99分</li></ul><ul>${version ? `<li class="filmVersion">${version}</li>` : ''}${times.map(time => `<li>${time}</li>`).join('')}<li class="theaterElse"><a href="/showtime/other/a02/">其他戲院(2)</a></li></ul></li></ul>`;
export const page = ({ name = '台北信義威秀', date = '2026/10/26', entries = [entry('測試片 A &amp; B', '國語版', ['18：00', '21：30']), entry('測試片 A &amp; B', '日語版', ['20：00']), entry('測試片 C', '', ['17：00'])] } = {}) => `<h2>${name}</h2><a href="/showtime/t02a01/a02/20261027/">明天</a><a href="/showtime/t02b08/a02/20261028/">別館日期</a><h3>${date} (一)</h3><div id="theaterShowtimeBlock">${entries.join('')}</div>`;
const xinyi = findCinema('信義威秀');
const now = () => new Date('2026-10-26T10:30:00Z');
const cinemaWith = (fetcher, clock = now) => new CinemaSource({ now: clock, atmovies: new AtmoviesSource({ fetcher, now: clock }) });

test('分館別名與台／臺一致；只給品牌列出已支援選項，不假裝完整據點', async () => {
  assert.equal(findCinema(' 臺北 信義 威秀影城 ').id, xinyi.id);
  assert.equal(findCinema('威秀西門').id, 'vieshow-ximen');
  assert.equal(findCinema('威秀'), undefined);
  assert.equal(cinemas.length, 108);
  const list = listCinemas({ brand: '威秀影城', city: '臺北市' });
  assert.equal(list.cinemas.length, 5);
  assert.ok(list.cinemas.some(cinema => cinema.id === 'vieshow-qsquare'));
  assert.ok(list.cinemas.every(cinema => cinema.city === '台北'));
  assert.match(formatCinemaList(list), /2026-10-26 開眼目錄/);
  const cinema = cinemaWith(() => { throw new Error('不應讀網頁'); });
  assert.equal((await cinema.schedule({ cinema: '威秀' })).status, 'choose_cinema');
  assert.equal((await cinema.schedule({ cinema: '不存在的影城' })).status, 'unsupported_cinema');
});

test('解析重複 id 區塊、全形時間、HTML entity，保留相同片名不同版本', () => {
  const result = parseAtmoviesSchedule(page(), xinyi);
  assert.equal(result.date, '2026-10-26');
  assert.deepEqual(result.publishedDates, ['2026-10-26', '2026-10-27']);
  assert.equal(result.movies.length, 3);
  assert.equal(result.movies[0].title, '測試片 A & B');
  assert.equal(result.movies[0].version, '國語版');
  assert.deepEqual(result.movies[0].times, ['18:00', '21:30']);
  assert.equal(result.movies[1].version, '日語版');
  assert.equal(result.movies[2].version, '來源未標示版本');
});

test('分館身分或 DOM 改變拒絕使用；不能用另一館或壞掉的時間充數', () => {
  assert.throws(() => parseAtmoviesSchedule(page({ name: '台北西門威秀影城' }), xinyi), /Wrong cinema/);
  for (const bad of [page().replace('18：00', '25：00'), page().replace('18：00', '18：99'), page().replace('2026/10/26', '2026/02/30'), '<html>維護中</html>', page({ entries: [] })]) {
    assert.throws(() => parseAtmoviesSchedule(bad, xinyi));
  }
  assert.equal(parseAtmoviesSchedule(page({ entries: [entry('測試片', '', ['18：00'], 'https://evil.test/movie/test/')] }), xinyi).movies[0].detailUrl, null);
});

test('相同作品與版本去重，但國語與日語場次不合併', () => {
  const result = parseAtmoviesSchedule(page({ entries: [entry('測試片', '4DX版', ['21：30', '18：00']), entry('測試片', '4DX版', ['21：30']), entry('測試片', '國語版', ['20：00'])] }), xinyi);
  assert.equal(result.movies.length, 2);
  assert.deepEqual(result.movies[0].times, ['18:00', '21:30']);
  assert.deepEqual(result.movies[1].times, ['20:00']);
});

test('今天依台灣現在時間篩選，明天不沿用今天的現在時間；片名可縮小查詢', async () => {
  const calls = [];
  const cinema = cinemaWith(async url => { calls.push(url); return new Response(page({ date: url.includes('20261027') ? '2026/10/27' : '2026/10/26' })); });
  const today = await cinema.schedule({ cinema: '信義威秀', afterTime: '18:00', onlyUpcoming: true, movieTitle: '測試片 A&B' });
  assert.equal(today.afterTime, '18:30');
  assert.deepEqual(today.movies.flatMap(movie => movie.times).sort(), ['20:00', '21:30']);
  const tomorrow = await cinema.schedule({ cinema: '信義威秀', date: '2026-10-27', onlyUpcoming: true });
  assert.ok(tomorrow.movies.some(movie => movie.times.includes('17:00')));
  assert.match(calls[1], /\/20261027\/$/);
  assert.equal((await cinema.schedule({ cinema: '信義威秀', movieTitle: '不存在的片' })).status, 'no_match');
  assert.equal((await cinema.schedule({ cinema: '信義威秀', afterTime: '23:00' })).status, 'no_upcoming');
});

test('未公告日期回傳今天頁面時不錯配；午夜刷新也不沿用昨天場次', async () => {
  let current = new Date('2026-10-26T15:59:00Z'), calls = 0;
  const cinema = cinemaWith(async () => { calls++; return new Response(page()); }, () => current);
  assert.equal((await cinema.schedule({ cinema: '信義威秀', date: '2026-11-01' })).status, 'not_published');
  assert.equal((await cinema.schedule({ cinema: '信義威秀' })).status, 'ok');
  current = new Date('2026-10-26T16:01:00Z'); // 台灣隔日 00:01，快取內仍為 10/26
  const stale = await cinema.schedule({ cinema: '信義威秀' });
  assert.equal(stale.status, 'stale_source'); assert.equal(stale.sourceDate, '2026-10-26');
  assert.equal(calls, 3);
});

test('來源完整年份處理跨年，凌晨時間保留原日期並提示核對，不猜成隔日', async () => {
  const clock = () => new Date('2026-12-31T12:00:00Z');
  const cinema = cinemaWith(async () => new Response(page({ date: '2027/01/01', entries: [entry('跨年片', '4DX版', ['00：30', '20：00'])] })), clock);
  const result = await cinema.schedule({ cinema: '信義威秀', date: '2027-01-01' });
  assert.equal(result.date, '2027-01-01');
  assert.deepEqual(result.movies[0].times, ['00:30', '20:00']);
  assert.match(formatCinemaSchedule(result), /凌晨場依來源日期/);
});

test('錯誤日期、時間、歷史日期與無效比較輸入不讀網路', async () => {
  const cinema = cinemaWith(() => { throw new Error('不應讀網頁'); });
  for (const query of [{ date: '2026-02-30' }, { afterTime: '25:00' }, { onlyUpcoming: 'true' }, { movieTitle: '!!!' }]) {
    assert.equal((await cinema.schedule({ cinema: '信義威秀', ...query })).status, 'invalid');
  }
  assert.equal((await cinema.schedule({ cinema: '信義威秀', date: '2026-10-25' })).status, 'past_date');
  assert.equal((await cinema.compare({ cinemas: ['信義威秀'] }))[0].status, 'invalid');
});

test('兩館快取隔離、相同查詢合併，過期失敗不回舊資料且短期不重打', async () => {
  let current = now(), calls = 0, fail = false;
  const cinema = cinemaWith(async url => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return new Response(fail ? '' : page({ name: url.includes('t02b08') ? '台北西門威秀影城' : '台北信義威秀' }), { status: fail ? 503 : 200 }); }, () => current);
  await Promise.all([cinema.schedule({ cinema: '信義威秀' }), cinema.schedule({ cinema: '威秀信義' }), cinema.schedule({ cinema: '西門威秀' })]);
  assert.equal(calls, 2);
  fail = true; current = new Date(current.valueOf() + 301_000);
  assert.equal((await cinema.schedule({ cinema: '信義威秀' })).status, 'unavailable');
  assert.equal((await cinema.schedule({ cinema: '信義威秀' })).status, 'unavailable');
  assert.equal(calls, 4); // 首頁與指定日期頁各失敗一次，冷卻期間不重打
});

test('比較時一館失敗保留另一館成功；來源和官方連結都保留，不偽稱官方更新', async () => {
  const cinema = cinemaWith(async url => new Response(url.includes('t02b08') ? '' : page(), { status: url.includes('t02b08') ? 403 : 200 }));
  const results = await cinema.compare({ cinemas: ['信義威秀', '西門威秀'], afterTime: '18:00' });
  assert.deepEqual(results.map(result => result.status), ['ok', 'unavailable']);
  const text = formatCinemaSchedules(results);
  assert.match(text, /台北信義威秀影城/); assert.match(text, /台北西門威秀影城/);
  assert.match(text, /21:30/); assert.match(text, /來源連線失敗（HTTP 403）/);
  assert.match(text, /開眼電影網（第三方/); assert.match(text, /vscinemas.com.tw/);
  assert.doesNotMatch(text, /官方更新：|官方時刻表：https:\/\/www.atmovies/);
});

test('長片單限制訊息長度，三館仍各自保留名稱、來源與官方入口', () => {
  const movies = Array.from({ length: 80 }, (_, i) => ({ title: '很長的片名'.repeat(20) + i, version: '國語版', times: Array(20).fill('21:30') }));
  const selected = [cinemas[0], findCinema('信義威秀'), findCinema('花蓮威秀')];
  const results = selected.map(cinema => ({ cinemaId: cinema.id, cinema: cinema.name, status: 'ok', source: '測試資料', sourceUrl: cinema.sourceUrl, bookingUrl: cinema.bookingUrl, date: '2026-10-26', movies }));
  const text = formatCinemaSchedules(results);
  assert.ok(text.length < 3600, text.length);
  for (const cinema of selected) { assert.ok(text.includes(cinema.name)); assert.ok(text.includes(cinema.sourceUrl)); assert.ok(text.includes(cinema.bookingUrl)); }
  assert.match(text, /其餘請見來源/);
});
