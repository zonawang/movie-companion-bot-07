// 真正呼叫 Gemini 與公開時刻表，使用 API 額度；資料庫僅在記憶體，不傳 LINE 訊息。
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { CinemaSource } from '../src/cinema.mjs';
import { MovieCompanion } from '../src/agent.mjs';
const settings = config();
const store = new Store(), calls = [], cinema = new CinemaSource();
const bot = new MovieCompanion({ store, cinema, model: settings.model,
  movies: new MovieSource({ mode: settings.mode, token: settings.tmdbToken }),
  trace: name => { calls.push(name); console.log(`[ADK tool] ${name}`); },
  onError: error => console.error('ADK error code:', error.code || 'unknown'),
});
try {
  const list = await bot.respond('multi-cinema-smoke', '目前台北有哪些威秀分館可以查場次？');
  assert.ok(calls.includes('list_cinemas'));
  assert.match(list.text, /信義威秀/); assert.match(list.text, /西門威秀/);
  console.log(list.text);
  calls.length = 0;
  const preview = await cinema.compare({ cinemas: ['信義威秀', '西門威秀'], afterTime: '18:00' });
  assert.ok(preview.every(result => ['ok', 'no_upcoming'].includes(result.status)));
  const title = preview[0].movies?.find(movie => preview[1].movies?.some(other => other.title === movie.title))?.title || '';
  const result = await bot.respond('multi-cinema-smoke', `請比較今天信義威秀和西門威秀晚上六點後${title ? `《${title}》的` : '所有電影的'}場次。請保留不同版本。`);
  assert.ok(calls.includes('cinema_compare') || calls.filter(name => name === 'cinema_schedule').length >= 2);
  assert.match(result.text, /台北信義威秀影城/); assert.match(result.text, /台北西門威秀影城/);
  assert.match(result.text, /資料來源：開眼電影網/);
  if (title) assert.ok(result.text.includes(title));
  assert.doesNotMatch(result.text, /AI 這次連線失敗|暫時無法讀取/);
  console.log(result.text);
  calls.length = 0;
  const tomorrow = await bot.respond('multi-cinema-smoke', '再查西門威秀明天晚上六點後所有電影的場次，不限剛才的片名。');
  assert.ok(calls.includes('cinema_schedule'));
  const nextDate = new Date(Date.now() + 86400000);
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(nextDate);
  assert.ok(tomorrow.text.includes(date));
  assert.match(tomorrow.text, /資料來源：開眼電影網/);
  assert.doesNotMatch(tomorrow.text, /AI 這次連線失敗|暫時無法讀取|尚未查到/);
  console.log(tomorrow.text);
  assert.equal(store.list('multi-cinema-smoke').length, 0);
  console.log('PASS：真實 Gemini → ADK → 分館清單／兩館比較／明日場次；未寫入正式票根或傳送 LINE。');
} finally { store.close(); }
