import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseLlm } from '@google/adk';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { MovieCompanion } from '../src/agent.mjs';
import { GoogleMapsSource } from '../src/maps.mjs';

const location = { latitude: 25.0478, longitude: 121.517 };
class MapModel extends BaseLlm {
  constructor({ args = { locationQuery: '' }, failAfterTool = false, parallel = false } = {}) {
    super({ model: 'test-maps' }); this.calls = 0; this.args = args; this.requests = []; this.failAfterTool = failAfterTool; this.parallel = parallel;
  }
  async *generateContentAsync(request) {
    this.requests.push(JSON.stringify(request));
    assert.doesNotMatch(JSON.stringify(request.config?.tools), /exclusiveMinimum/);
    if (this.calls++ % 2 === 0) {
      const call = { functionCall: { name: 'nearby_cinemas', args: this.args } };
      yield { content: { role: 'model', parts: this.parallel ? [call, call] : [call] } };
    } else if (this.failAfterTool) yield { errorCode: '504', errorMessage: 'timeout' };
    else yield { content: { role: 'model', parts: [{ text: '模型猜測電影 99:99，應完全排除。' }] }, turnComplete: true };
  }
}
const found = { status: 'ok', origin: { name: '你分享的位置' }, radiusMeters: 3000, date: '2026-10-26', fetchedAt: '2026-10-26T04:00:00Z',
  places: [{ name: '京站威秀影城', address: '台北市大同區', distanceMeters: 120, mapsUrl: 'https://www.google.com/maps/search/?api=1&query_place_id=test',
    schedule: { status: 'ok', cinema: '台北京站威秀影城', movies: [{ title: '測試電影', times: ['19:30'] }] } }] };
test('真正 ADK Runner → 地圖 HTTP adapter → 分館配對 → 既有場次工具；排除模型虛構時間', async () => {
  const store = new Store(), calls = [], model = new MapModel();
  const maps = new GoogleMapsSource({ apiKey: 'test-only', fetcher: async (url, options) => {
    calls.push(url); assert.deepEqual(JSON.parse(options.body).locationRestriction.circle.center, location);
    return { ok: true, json: async () => ({ places: [{ id: 'test-qsquare', displayName: { text: '京站威秀影城' },
      formattedAddress: '台北市大同區市民大道', location }] }) };
  } });
  const cinema = { schedule: async input => { assert.equal(input.cinema, 'vieshow-qsquare'); assert.equal(input.onlyUpcoming, true); return found.places[0].schedule; } };
  try {
    const bot = new MovieCompanion({ store, movies: new MovieSource(), model, maps, cinema, trace: () => {} });
    const result = await bot.respond('alice', '請查定位附近影院', 'request', { location });
    assert.equal(calls.length, 1); assert.match(result.text, /19:30/); assert.match(result.text, /Google Maps/);
    assert.doesNotMatch(result.text, /99:99|模型猜測|虛構/);
    assert.doesNotMatch(model.requests.join(''), /25\.0478|121\.517/);
    assert.equal(store.list('alice').length, 0);
  } finally { store.close(); }
});
test('定位於同一使用者 15 分鐘內沿用，過期與其他使用者不可沿用', async () => {
  const store = new Store(), locations = [], model = new MapModel(); let time = Date.now();
  const nearby = { search: async (_input, shared) => { locations.push(shared); return shared ? found : { status: 'needs_location', message: '請傳定位' }; } };
  try {
    const bot = new MovieCompanion({ store, movies: new MovieSource(), model, nearby, now: () => time, trace: () => {} });
    await bot.respond('alice', '定位', 'a', { location });
    await bot.respond('alice', '附近五公里');
    assert.deepEqual(locations[1], location);
    await bot.respond('bob', '附近'); assert.equal(locations[2], undefined);
    time += 15 * 60_000;
    assert.match((await bot.respond('alice', '附近')).text, /請傳定位/);
    assert.equal(locations[3], undefined);
  } finally { store.close(); }
});
test('清除位置會刪除 ADK 對話及位置，下次查詢需重新提供', async () => {
  const store = new Store(), model = new MapModel();
  const nearby = { search: async (_input, shared) => shared ? found : { status: 'needs_location', message: '請重新提供位置' } };
  try {
    const bot = new MovieCompanion({ store, movies: new MovieSource(), model, nearby, trace: () => {} });
    await bot.respond('alice', '定位', 'a', { location });
    assert.ok(bot.sessions.has('alice'));
    assert.match(bot.clearLocation('alice').text, /已清除/);
    assert.equal(bot.sessions.has('alice'), false);
    assert.match((await bot.respond('alice', '附近')).text, /請重新提供位置/);
  } finally { store.close(); }
});
test('即使使用者沒有再傳訊息，15 分鐘計時器也會清除定位與對話', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = new Store();
  try {
    const bot = new MovieCompanion({ store, movies: new MovieSource(), model: new MapModel(), trace: () => {}, nearby: { search: async () => found } });
    await bot.respond('alice', '定位', 'a', { location });
    const session = bot.sessions.get('alice');
    assert.deepEqual(session.turn.location, location);
    t.mock.timers.tick(15 * 60_000);
    assert.equal(bot.sessions.has('alice'), false);
    assert.equal(session.location, undefined); assert.equal(session.turn.location, undefined);
  } finally { store.close(); }
});
test('相同回合多個附近工具呼叫合併，避免重複地圖費用', async () => {
  const store = new Store(); let calls = 0;
  try {
    const bot = new MovieCompanion({ store, movies: new MovieSource(), model: new MapModel({ parallel: true }), trace: () => {},
      nearby: { search: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return found; } } });
    assert.match((await bot.respond('alice', '附近', 'a', { location })).text, /19:30/);
    assert.equal(calls, 1);
  } finally { store.close(); }
});
test('地圖工具成功後模型逾時仍保留工具結果，沒有資料時不猜答案', async () => {
  const store = new Store();
  try {
    const bot = new MovieCompanion({ store, movies: new MovieSource(), model: new MapModel({ failAfterTool: true }), trace: () => {}, nearby: { search: async () => found } });
    assert.match((await bot.respond('alice', '附近')).text, /19:30/);
    const missing = new MovieCompanion({ store, movies: new MovieSource(), model: new MapModel(), maps: new GoogleMapsSource({ apiKey: '' }), trace: () => {} });
    const result = await missing.respond('bob', '附近', 'b', { location });
    assert.match(result.text, /尚未設定 Google Maps/); assert.doesNotMatch(result.text, /99:99/);
  } finally { store.close(); }
});
