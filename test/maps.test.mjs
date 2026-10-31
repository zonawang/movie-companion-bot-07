import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleMapsSource, distanceMeters } from '../src/maps.mjs';

const origin = { latitude: 25.0478, longitude: 121.5170 };
const raw = (id, latitude = 25.048, extra = {}) => ({ id, displayName: { text: '京站威秀影城' },
  formattedAddress: '台灣台北市大同區市民大道一段', location: { latitude, longitude: 121.517 }, ...extra });
const reply = places => ({ ok: true, json: async () => ({ places }) });

test('真實 API 格式、距離排序、去重、排除停業與半徑外地點，僅請求必要欄位', async () => {
  const maps = new GoogleMapsSource({ apiKey: 'test-only-key', fetcher: async (url, options) => {
    assert.equal(url, 'https://places.googleapis.com/v1/places:searchNearby');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['X-Goog-Api-Key'], 'test-only-key');
    assert.doesNotMatch(options.headers['X-Goog-FieldMask'], /\*/);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.includedTypes, ['movie_theater']);
    assert.equal(body.rankPreference, 'DISTANCE');
    assert.deepEqual(body.locationRestriction.circle.center, origin);
    assert.equal(body.languageCode, 'zh-TW');
    return reply([raw('far', 25.06), raw('near'), raw('near'), raw('outside', 25.2), raw('closed', 25.048, { businessStatus: 'CLOSED_TEMPORARILY' })]);
  } });
  const result = await maps.nearby(origin, 3000);
  assert.deepEqual(result.places.map(place => place.placeId), ['near', 'far']);
  assert.ok(result.places[0].distanceMeters < result.places[1].distanceMeters);
  assert.match(result.places[0].mapsUrl, /query_place_id=near/);
  assert.ok(distanceMeters(origin, { latitude: 25.0578, longitude: 121.5170 }) > 1100);
});
test('地標多個候選須請使用者確認；唯一完整名稱才可自動解析', async () => {
  const maps = new GoogleMapsSource({ apiKey: 'test', fetcher: async (url, options) => {
    assert.match(url, /searchText$/); assert.equal(JSON.parse(options.body).regionCode, 'TW');
    return reply([raw('one', 25, { displayName: { text: '台北中山站' } }), raw('two', 25.1, { displayName: { text: '另一個中山站' } })]);
  } });
  assert.equal((await maps.resolve('中山站')).status, 'choose_location');
  assert.equal((await maps.resolve('台北中山站')).place.placeId, 'one');
});
test('找不到位置與空影院結果保留不同狀態', async () => {
  const maps = new GoogleMapsSource({ apiKey: 'test', fetcher: async () => reply([]) });
  assert.equal((await maps.resolve('不存在的地址')).status, 'location_not_found');
  assert.deepEqual((await maps.nearby(origin)).places, []);
});
test('缺金鑰或輸入錯誤不發送外部請求；0,0 是有效座標', async () => {
  let calls = 0;
  const maps = new GoogleMapsSource({ apiKey: '', fetcher: () => { calls++; } });
  assert.equal((await maps.nearby(origin)).status, 'not_configured');
  assert.equal((await maps.nearby({ latitude: NaN, longitude: 121 })).status, 'invalid');
  assert.equal((await maps.nearby({ latitude: 91, longitude: 0 })).status, 'invalid');
  assert.equal((await maps.nearby(origin, 10001)).status, 'invalid');
  assert.equal((await maps.nearby({ latitude: 0, longitude: 0 })).status, 'not_configured');
  assert.equal(calls, 0);
});
test('HTTP 錯誤、額度、逾時與異常格式不回傳金鑰或錯誤內文', async () => {
  const fetchers = [
    async () => ({ ok: false, status: 403, json: () => { throw new Error('test-secret'); } }),
    async () => ({ ok: false, status: 429 }),
    async () => { throw new Error('test-secret'); },
    async () => ({ ok: true, json: async () => ({ places: {} }) }),
    async () => reply([{ id: 'invalid', location: { latitude: 999, longitude: 121 } }]),
  ];
  for (const fetcher of fetchers) {
    const maps = new GoogleMapsSource({ apiKey: 'test-secret', fetcher });
    const result = await maps.nearby(origin);
    assert.equal(result.status, 'unavailable'); assert.doesNotMatch(JSON.stringify(result), /test-secret/);
  }
});
test('不接受任意外部地圖連結；保留地圖第三方來源', async () => {
  const maps = new GoogleMapsSource({ apiKey: 'test', fetcher: async () => reply([raw('safe', 25.048, {
    googleMapsUri: 'https://evil.example/path', attributions: [{ provider: '測試提供者', providerUri: 'https://provider.example' }],
  })]) });
  const result = await maps.nearby(origin);
  assert.match(result.places[0].mapsUrl, /^https:\/\/www.google.com\/maps/);
  assert.equal(result.places[0].attributions[0].name, '測試提供者');
});
