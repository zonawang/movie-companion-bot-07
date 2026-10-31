// 需要 Gemini key 與 TMDB Read Access Token。會真正查詢資料、使用模型額度；不傳送 LINE 訊息、不寫入正式票根。
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { MovieCompanion } from '../src/agent.mjs';

const settings = config({ ...process.env, MOVIE_DATA_MODE: 'tmdb' });
const store = new Store();
const calls = [];
const bot = new MovieCompanion({ store, model: settings.model, movies: new MovieSource({ mode: 'tmdb', token: settings.tmdbToken }), trace: name => { calls.push(name); console.log(`[ADK tool] ${name}`); } });
try {
  const playing = await bot.respond('tmdb-smoke', '請用工具查台灣目前的上映候選電影，列三部與資料限制即可。');
  console.log(playing.text);
  assert.ok(calls.includes('now_playing'));
  assert.match(playing.text, /資料來源：TMDB/);
  assert.doesNotMatch(playing.text, /示範模式|示範資料模式|虛構資料/);
  const search = await bot.respond('tmdb-smoke', '請用工具搜尋《全面啟動》，查它的繁中簡介與使用者評論連結；不要劇透或自行編影評。');
  console.log(search.text);
  assert.ok(calls.includes('search_movies'));
  assert.ok(calls.includes('movie_reviews'));
  assert.match(search.text, /資料來源：TMDB/);
  assert.equal(store.list('tmdb-smoke').length, 0);
  console.log('PASS：ADK → 真實 TMDB → Gemini 回覆；沒有修改正式票根。');
} finally { store.close(); }
