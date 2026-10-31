// 真正呼叫 Gemini 與公開時刻表，使用 API 額度；不發 LINE 訊息、不寫正式票根。
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { MovieCompanion } from '../src/agent.mjs';
const settings = config(), store = new Store(), calls = [];
const bot = new MovieCompanion({ store, movies: new MovieSource({ mode: settings.mode, token: settings.tmdbToken }), model: settings.model,
  trace: name => { calls.push(name); console.log('[ADK tool]', name); }, onError: error => console.error('ADK error code:', error.code || 'unknown') });
async function query(actor, text, check) {
  calls.length = 0; const result = await bot.respond(actor, text); console.log(result.text); assert.doesNotMatch(result.text, /AI 這次連線失敗/); check(result.text);
}
try {
  await query('national-list', '請列出全台目前可以查的威秀分館，包括 MUVIE。', text => {
    assert.ok(calls.includes('list_cinemas')); assert.match(text, /22 間/); assert.match(text, /花蓮/); assert.match(text, /頭份/); assert.match(text, /TIGER CITY/);
  });
  await query('national-ambiguity', '新竹威秀今晚有哪些場次？', text => {
    assert.match(text, /新竹大遠百/); assert.match(text, /新竹巨城/); assert.match(text, /指定|選擇|請問|哪一/);
    assert.doesNotMatch(text, /資料來源：開眼/);
  });
  await query('national-kaohsiung', '高雄威秀今晚六點後有哪些電影和場次？', text => {
    assert.ok(calls.includes('cinema_schedule')); assert.match(text, /高雄大遠百威秀/); assert.match(text, /18:00 起/); assert.match(text, /資料來源：開眼/); assert.doesNotMatch(text, /暫時無法讀取/);
  });
  await query('national-east', '比較花蓮威秀、台南南紡威秀和台中大遠百威秀明天晚上六點後的場次，不限片名。', text => {
    assert.ok(calls.includes('cinema_compare')); for (const name of ['花蓮新天堂樂園','台南南紡','台中大遠百']) assert.ok(text.includes(name));
    assert.match(text, /資料來源：開眼/); assert.doesNotMatch(text, /暫時無法讀取|尚未查到/);
    assert.ok(text.includes(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date(Date.now()+86400000))));
  });
  assert.equal(store.list('national-kaohsiung').length, 0);
  console.log('PASS：全台清單、新竹分館歧義、高雄單館與花蓮／台南／台中明日比較已由真實 Gemini／ADK 驗證。');
} finally { store.close(); }
