import test from 'node:test';
import assert from 'node:assert/strict';
import { matchMapCinema, NearbyCinemaSource, formatNearby } from '../src/nearby.mjs';
import { lineMessages } from '../src/line.mjs';

const point = { latitude: 25.0478, longitude: 121.5170 };
const now = () => new Date('2026-10-26T04:00:00Z');
const place = (extra = {}) => ({ placeId: 'test-qsquare', name: '京站威秀影城', address: '台灣台北市大同區市民大道一段',
  location: point, distanceMeters: 120, mapsUrl: 'https://www.google.com/maps/search/?api=1&query_place_id=test-qsquare', ...extra });
const mapsWith = places => ({ nearby: async () => ({ status: 'ok', places }) });
test('已登錄分館可用精確別名與縣市配對，不接受錯縣市或只有品牌', () => {
  assert.equal(matchMapCinema(place()).id, 'vieshow-qsquare');
  assert.equal(matchMapCinema(place({ address: '高雄市苓雅區' })), undefined);
  assert.equal(matchMapCinema(place({ name: '威秀影城' })), undefined);
  assert.equal(matchMapCinema(place({ name: '京站威秀新分館' })), undefined);
  assert.equal(matchMapCinema(place({ name: '誠品電影院', address: '台北市信義區菸廠路' })).id, 'eslite-songyan');
  assert.equal(matchMapCinema(place({ name: '誠品電影院', address: '台北市中山區' })), undefined);
});
test('真實 Maps 的光點台北地點已按官網地址核對，對應正確分館', () => {
  assert.equal(matchMapCinema(place({ placeId: 'ChIJQaZzI2mpQjQRk9MTQahdDr0', name: '光點台北（台北之家）', address: '台北市中山區中山北路二段18號' })).id, 'atmovies-t02d20');
});
test('相同名稱多候選不擅選；可用人工驗證過的 Place ID 對應', () => {
  const registry = ['a', 'b'].map(id => ({ id, county: '台北市', name: '京站威秀影城', aliases: [] }));
  assert.equal(matchMapCinema(place(), registry, {}), undefined);
  assert.equal(matchMapCinema(place(), registry, { 'test-qsquare': 'b' }).id, 'b');
});
test('定位查詢預設今天未開演場次，日期時間與片名傳給既有工具，座標不回傳模型', async () => {
  const calls = [];
  const cinema = { schedule: async input => { calls.push(input); return { status: 'ok', cinema: '台北京站威秀影城', movies: [{ title: '測試電影', version: '字幕版', times: ['19:30'] }] }; } };
  const source = new NearbyCinemaSource({ maps: mapsWith([place()]), cinema, now });
  const result = await source.search({ afterTime: '18:00', movieTitle: '測試電影' }, point);
  assert.deepEqual(calls[0], { cinema: 'vieshow-qsquare', date: '', afterTime: '18:00', movieTitle: '測試電影', onlyUpcoming: true });
  assert.equal(result.date, '2026-10-26');
  assert.doesNotMatch(JSON.stringify(result), /latitude|longitude/);
  const output = formatNearby(result);
  assert.match(output, /直線估算/); assert.match(output, /19:30/); assert.match(output, /Google Maps/);
});
test('文字地標解析後才找附近；多候選不查影院且不回傳候選座標', async () => {
  let nearbyCalls = 0;
  const maps = {
    resolve: async query => { assert.equal(query, '中山站'); return { status: 'choose_location', message: '請補城市', choices: [place()] }; },
    nearby: async () => { nearbyCalls++; },
  };
  const result = await new NearbyCinemaSource({ maps, now }).search({ locationQuery: '中山站' });
  assert.equal(nearbyCalls, 0); assert.equal(result.status, 'choose_location');
  assert.doesNotMatch(JSON.stringify(result), /latitude|longitude/);
  assert.match(formatNearby(result), /請補城市/);
});
test('未配對的影院不猜場次，查單館失敗不影響其他館', async () => {
  const calls = [];
  const maps = mapsWith([place(), place({ placeId: 'other', name: '新開的影院' }), place({ placeId: 'ximen', name: '西門威秀影城', address: '台北市萬華區' })]);
  const cinema = { schedule: async input => { calls.push(input); if (input.cinema === 'vieshow-ximen') throw new Error('timeout'); return { status: 'ok', cinema: '京站威秀', movies: [{ title: '測試片', times: ['21:30'] }] }; } };
  const result = await new NearbyCinemaSource({ maps, cinema, now }).search({}, point);
  assert.equal(calls.length, 2); assert.equal(result.places[1].scheduleStatus, 'unmatched');
  assert.equal(result.places[2].scheduleStatus, 'unavailable');
  const output = formatNearby(result);
  assert.match(output, /21:30/); assert.match(output, /尚未可靠對應/); assert.match(output, /暫時無法讀取/);
});
test('只查影院不讀場次；最多自動查三間，其餘提供追問', async () => {
  let calls = 0;
  const places = Array.from({ length: 5 }, (_, index) => place({ placeId: 'id-' + index }));
  const source = new NearbyCinemaSource({ maps: mapsWith(places), cinema: { schedule: async () => { calls++; return { status: 'links_only', message: '圖片入口' }; } }, now });
  assert.equal((await source.search({ includeShowtimes: false }, point)).places.length, 3);
  assert.equal(calls, 0);
  const result = await source.search({ limit: 5 }, point);
  assert.equal(calls, 3); assert.equal(result.places[4].scheduleStatus, 'limit');
});
test('無定位、過去日期、錯誤時間與查無影院為不同狀態', async () => {
  let calls = 0;
  const maps = { nearby: async () => { calls++; return { status: 'ok', places: [] }; } };
  const source = new NearbyCinemaSource({ maps, now });
  assert.equal((await source.search()).status, 'needs_location');
  assert.equal((await source.search({ date: '2026-10-25' }, point)).status, 'past_date');
  assert.equal((await source.search({ afterTime: '99:99' }, point)).status, 'invalid');
  assert.equal((await source.search({ limit: 6 }, point)).status, 'invalid');
  assert.equal(calls, 0);
  const result = await source.search({}, point);
  assert.equal(result.status, 'no_results'); assert.match(formatNearby(result), /Google Maps/);
});
test('長回覆拆成 LINE 訊息，保留最後影院的地圖與第三方來源', async () => {
  const places = Array.from({ length: 5 }, (_, index) => place({ placeId: 'long-' + index, name: '影院' + index + '甲'.repeat(120), address: '地址'.repeat(80),
    mapsUrl: 'https://www.google.com/maps/search/?query=' + 'a'.repeat(650) + index,
    attributions: [{ name: '地圖提供者', url: 'https://provider.example/' + index }] }));
  const result = await new NearbyCinemaSource({ maps: mapsWith(places), now }).search({ limit: 5, includeShowtimes: false }, point);
  const output = formatNearby(result), messages = lineMessages({ text: output });
  assert.ok(messages.length > 1); assert.ok(messages.length <= 5);
  assert.ok(messages.every(message => message.text.length <= 4000));
  assert.match(messages.map(message => message.text).join('\n'), /https:\/\/provider.example\/4/);
});
