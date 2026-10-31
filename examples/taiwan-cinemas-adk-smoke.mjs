// 真實 Gemini／ADK。使用模型 API 額度；記憶體資料庫，不傳 LINE 訊息。
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { MovieCompanion } from '../src/agent.mjs';
const settings=config(),store=new Store(),calls=[];
const bot=new MovieCompanion({store,movies:new MovieSource({mode:settings.mode,token:settings.tmdbToken}),model:settings.model,
 trace:name=>{calls.push(name);console.log('[ADK tool]',name);},onError:error=>console.error('ADK error code',error.code||'unknown')});
async function query(actor,text,check){calls.length=0;const result=await bot.respond(actor,text);console.log(result.text);assert.doesNotMatch(result.text,/AI 這次連線失敗/);check(result.text);return result;}
try{
 const first=await query('taiwan-list','列出全台所有已登錄的影城清單，先給第一頁。',text=>{assert.ok(calls.includes('list_cinemas'));assert.match(text,/108 間.*第 1\/5 頁/);assert.match(text,/下一頁/);});
 const second=await query('taiwan-list','下一頁。',text=>{assert.ok(calls.includes('list_cinemas'));assert.match(text,/第 2\/5 頁/);});assert.notEqual(first.text,second.text);
 await query('taiwan-south','高雄有哪些國賓影城？',text=>{assert.ok(calls.includes('list_cinemas'));assert.match(text,/義大/);assert.match(text,/草衙道/);assert.doesNotMatch(text,/台北/);});
 await query('taiwan-compare','比較台中文心秀泰、台北長春國賓與澎湖in89今天晚上六點後的場次，不限片名。',text=>{assert.ok(calls.includes('cinema_compare'));for(const name of ['台中文心秀泰影城','國賓長春影城','in89澎湖影城'])assert.ok(text.includes(name),name);assert.match(text,/資料來源：開眼/);assert.doesNotMatch(text,/暫時無法讀取|尚未查到/);});
 await query('taiwan-image','府中15今天有哪些電影和時間？',text=>{assert.ok(calls.includes('cinema_schedule'));assert.match(text,/圖片時刻表/);assert.match(text,/來源圖片時刻表/);assert.doesNotMatch(text,/沒有電影|官方更新/);});
 assert.equal(store.list('taiwan-list').length,0);
 console.log('PASS：全台清單翻頁、國賓縣市篩選、秀泰／國賓／外島跨品牌比較與圖片入口均經真實模型驗證。');
}finally{store.close();}
