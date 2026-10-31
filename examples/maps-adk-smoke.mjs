// Real Gemini/ADK; optional Maps fixture is EXPLICIT. No LINE delivery or disk database.
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { MovieCompanion } from '../src/agent.mjs';
import { GoogleMapsSource } from '../src/maps.mjs';
const settings = config(), fixture = process.env.MAPS_SMOKE_FIXTURE === '1';
if (!fixture && !settings.mapsApiKey) throw new Error('請設定 GOOGLE_MAPS_API_KEY；若要明確使用替代地圖資料驗證 ADK，請執行 smoke:maps:adk:fixture。');
const requests = [], tools = [], store = new Store();
const fixtureFetch = async (url, options) => {
  requests.push({ method: url.endsWith('searchText') ? 'searchText' : 'searchNearby', input: JSON.parse(options.body) });
  const places = url.endsWith('searchText')
    ? [{ id: 'fixture-station', displayName: { text: '台北車站' }, formattedAddress: '台北市中正區北平西路', location: { latitude: 25.0478, longitude: 121.517 } }]
    : [{ id: 'fixture-qsquare', displayName: { text: '京站威秀影城' }, formattedAddress: '台北市大同區市民大道一段', location: { latitude: 25.049, longitude: 121.517 } }];
  return { ok: true, json: async () => ({ places }) };
};
const maps = new GoogleMapsSource(fixture ? { apiKey: 'fixture-not-a-key', fetcher: fixtureFetch } : { apiKey: settings.mapsApiKey });
const bot = new MovieCompanion({ store, model: settings.model, maps, movies: new MovieSource({ mode: settings.mode, token: settings.tmdbToken }),
  trace: name => { tools.push(name); console.log('[ADK tool]', name); }, onError: error => console.error('模型錯誤代碼：', error.code || 'unknown') });
async function query(actor, message, context) {
  tools.length = 0;
  const result = await bot.respond(actor, message, undefined, context);
  console.log(result.text);
  assert.ok(tools.includes('nearby_cinemas'), '模型必須呼叫附近影院工具');
  assert.match(result.text, /Google Maps/);
  assert.doesNotMatch(result.text, /AI 這次連線失敗|附近影院查詢暫時無法完成|地圖服務暫時無法使用/);
  assert.equal(store.list(actor).length, 0);
  return result;
}
try {
  console.log(fixture ? '驗證模式：真實 Gemini／ADK，替代地圖資料，真實開眼場次。' : '驗證模式：真實 Gemini／ADK、Google Maps 與場次來源。');
  await query('maps-location-smoke', '請找這個定位附近三公里內的電影院，並列出今天尚未開演的電影與場次。', { location: { latitude: 25.0478, longitude: 121.517 } });
  await query('maps-address-smoke', '我在台北車站，附近三公里今晚六點以後有哪些電影可以看？');
  if (fixture) {
    assert.ok(requests.some(request => request.method === 'searchText' && request.input.textQuery.includes('台北車站')));
    assert.ok(requests.some(request => request.method === 'searchNearby'));
  }
  bot.clearLocation('maps-location-smoke');
  console.log('PASS：真實模型可處理 LINE 定位與文字地標，並呼叫附近影院工具。未傳送 LINE 訊息、未寫入票根。');
} finally { store.close(); }
