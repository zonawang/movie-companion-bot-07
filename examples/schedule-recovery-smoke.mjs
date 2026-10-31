// Real anonymous public sources + real Gemini/ADK. Memory-only tickets; LINE schema validation, no message delivery.
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { CinemaSource } from '../src/cinema.mjs';
import { MovieCompanion } from '../src/agent.mjs';
import { MovieSource } from '../src/movies.mjs';
import { CinemaCards } from '../src/cinema-cards.mjs';
import { MovieCardCatalog } from '../src/movie-card-catalog.mjs';
import { Store } from '../src/store.mjs';
import { lineMessages } from '../src/line.mjs';
const settings=config(),cinema=new CinemaSource(),store=new Store(),calls=[];
const names=['文心秀泰','長春國賓','澎湖in89'];
try{
 const live=await cinema.compare({cinemas:names,afterTime:'18:00',onlyUpcoming:true});
 for(const result of live){
  if(result.status!=='ok'){
   assert.equal(result.cinemaId,'atmovies-t04411');assert.equal(result.officialFallback?.httpStatus,403);
   assert.equal(result.movies,undefined);assert.match(result.fallbackNotice,/拒絕伺服器存取/);
   console.log(JSON.stringify({cinema:result.cinema,status:result.status,officialFallback:result.officialFallback}));continue;
  }
  assert.ok(result.movies.every(movie=>movie.times.every(time=>time>='18:00')));
  assert.equal(result.provider,'official','Expected official recovery for this incident');
  console.log(JSON.stringify({cinema:result.cinema,date:result.date,status:result.status,provider:result.provider,versions:result.movies.length,showtimes:result.movies.reduce((n,m)=>n+m.times.length,0),source:result.sourceUrl,primary:result.fallbackFrom}));
 }
 assert.ok(live.filter(result=>result.status==='ok').length>=2,'At least Ambassador and Penghu must recover');
 const cards=new CinemaCards({catalog:new MovieCardCatalog({token:settings.tmdbToken}),fallbackPosterUrl:new URL('/tickets/assets/poster-fallback-v1.jpg',settings.publicBaseUrl).href});
 const bot=new MovieCompanion({store,cinema,cards,model:settings.model,movies:new MovieSource({mode:settings.mode,token:settings.tmdbToken}),trace:name=>calls.push(name)});
 const reply=await bot.respond('schedule-recovery-fixture','比較台中文心秀泰、台北長春國賓與澎湖 in89，今天晚上六點後的場次。');
 assert.ok(calls.includes('cinema_compare')||calls.filter(name=>name==='cinema_schedule').length>=3,'ADK must actually query all three cinemas');
 for(const result of live)assert.ok(reply.text.includes(result.cinema));
 assert.ok(reply.messages?.some(message=>message.type==='flex'));
 assert.doesNotMatch(reply.text,/尚未查到這天|AI 這次連線失敗/);
 if(live.some(result=>result.officialFallback?.httpStatus===403))assert.match(reply.text,/拒絕伺服器存取/);
 const response=await fetch('https://api.line.me/v2/bot/message/validate/reply',{method:'POST',headers:{Authorization:'Bearer '+process.env.LINE_CHANNEL_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({messages:lineMessages(reply)}),signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,await response.text());
 assert.equal(store.list('schedule-recovery-fixture').length,0);assert.equal(store.pending('schedule-recovery-fixture'),undefined);
 console.log(JSON.stringify({status:'ok',tools:calls,lineValidation:response.status,ticketWrites:0}));
}finally{store.close();}
