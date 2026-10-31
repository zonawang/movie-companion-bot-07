// 真的呼叫 Gemini，會消耗 API 額度；電影資料與 SQLite 都使用測試模式。
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { MovieCompanion } from '../src/agent.mjs';

const settings = config({ ...process.env, MOVIE_DATA_MODE: 'demo' });
const store = new Store();
const calls = [];
const bot = new MovieCompanion({ store, model: settings.model, movies: new MovieSource(), trace: name => { calls.push(name); console.log(`[ADK tool] ${name}`); } });
try {
  const first = await bot.respond('smoke-user', '請使用工具列出目前可以查詢的電影，提醒我資料模式。');
  console.log(first.text);
  assert.ok(calls.includes('now_playing'));
  const second = await bot.respond('smoke-user', '幫我建立票根草稿：電影是月台上的貓，觀影日期 2026-10-25，跟小安去看，沒有提供影院，心得請逐字記錄「配樂很好聽」。');
  console.log(second.text);
  assert.ok(second.draft, 'ADK 必須實際呼叫 prepare_ticket');
  assert.equal(store.list('smoke-user').length, 0, '模型不能直接儲存票根');
  assert.equal(second.draft.note, '配樂很好聽');
  // 只模擬使用者點擊；這不是實際 LINE 點擊測試。
  store.decide('smoke-user', second.draft.id, 'confirm');
  const third = await bot.respond('smoke-user', '我跟小安看過什麼？請查我的票根。');
  console.log(third.text);
  assert.ok(calls.includes('list_tickets'));
  assert.equal(store.list('smoke-user', '小安').length, 1);
  console.log('PASS：真實 ADK / Gemini 工具呼叫成功；尚未測試真實 LINE 帳號或 TMDB。');
} finally { store.close(); }
