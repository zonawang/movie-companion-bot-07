// 真正呼叫 Gemini 與誠品公開時刻表，使用 API 額度；不傳送 LINE 訊息或修改正式票根。
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { CinemaSource } from '../src/cinema.mjs';
import { MovieCompanion } from '../src/agent.mjs';

const settings = config();
const store = new Store(), calls = [];
const cinema = new CinemaSource();
const bot = new MovieCompanion({ store, cinema, model: settings.model, movies: new MovieSource({ mode: settings.mode, token: settings.tmdbToken }), trace: name => { calls.push(name); console.log(`[ADK tool] ${name}`); } });
try {
  const result = await bot.respond('cinema-smoke', '今晚松菸誠品有哪些電影和場次？只查現在之後、18:00 起的場次。');
  console.log(result.text);
  assert.ok(calls.includes('cinema_schedule'));
  assert.doesNotMatch(result.text, /AI 這次連線失敗|示範資料模式/);
  assert.match(result.text, /官方時刻表：https:\/\/meet.eslite.com/);
  assert.ok(cinema.cache, '必須真正讀到官網，不把格式錯誤當成功');
  assert.match(result.text, /官方更新：/);
  const next = await bot.respond('cinema-smoke', '那《進擊的鼓手》在講什麼？請用工具查詢，簡單兩句，不劇透。');
  console.log(next.text);
  assert.ok(calls.includes('search_movies'));
  assert.match(next.text, /資料來源：TMDB/);
  assert.equal(store.list('cinema-smoke').length, 0);
  console.log('PASS：真實 ADK → 誠品官方場次 → TMDB 電影介紹；未修改正式票根。');
} finally { store.close(); }
