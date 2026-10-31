// Real Gemini/ADK and public data; no LINE message delivery or persistent ticket writes.
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { CinemaSource, taipeiDateTime } from '../src/cinema.mjs';
import { MovieCompanion } from '../src/agent.mjs';
import { MovieSource } from '../src/movies.mjs';
import { CinemaCards } from '../src/cinema-cards.mjs';
import { MovieCardCatalog } from '../src/movie-card-catalog.mjs';
import { Store } from '../src/store.mjs';
import { lineMessages } from '../src/line.mjs';
const settings=config(),cinema=new CinemaSource(),store=new Store(),tools=[];
const actor='dome-recovery-fixture';
try {
 const cards=new CinemaCards({catalog:new MovieCardCatalog({token:settings.tmdbToken}),fallbackPosterUrl:new URL('/tickets/assets/poster-fallback-v1.jpg',settings.publicBaseUrl).href});
 const bot=new MovieCompanion({store,cinema,cards,model:settings.model,movies:new MovieSource({mode:settings.mode,token:settings.tmdbToken}),trace:name=>tools.push(name)});
 const started=Date.now(),reply=await bot.respond(actor,'大巨蛋秀泰今晚有哪些電影可以看？');
 assert.ok(tools.includes('cinema_schedule'),'ADK must actually query this cinema');
 assert.ok(reply.messages?.some(message=>message.type==='flex'),'Expected real movie cards: '+reply.text);
 const snapshot=[...cards.snapshots.values()].find(value=>value.actor===actor);assert.ok(snapshot);
 const result=snapshot.sources[0];assert.equal(result.cinemaId,'atmovies-t02a13');assert.equal(result.status,'ok');assert.equal(result.date,taipeiDateTime(new Date()).date);assert.ok(result.afterTime>='18:00');
 assert.ok(result.movies.every(movie=>movie.times.length&&movie.times.every(time=>time>=result.afterTime)));
 assert.ok(['atmovies','official','twshowtimes'].includes(result.provider));
 if(result.provider==='twshowtimes'){assert.match(reply.text,/場次通.*第三方/);assert.equal(result.sourceDate,result.date);assert.ok(result.fallbackFrom.officialFailure);}
 assert.doesNotMatch(reply.text,/來源連線失敗|尚未取得.*可核對的場次|AI 這次連線失敗/);
 const validate=async output=>{
  const response=await fetch('https://api.line.me/v2/bot/message/validate/reply',{method:'POST',headers:{Authorization:'Bearer '+process.env.LINE_CHANNEL_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({messages:lineMessages(output)}),signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200,await response.text());
 };
 await validate(reply);
 const carousel=reply.messages.find(message=>message.type==='flex').contents.contents;
 const times=await cards.handle(actor,carousel[0].footer.contents[1].action.data);assert.ok(times.text.includes(result.afterTime));await validate(times);
 const next=carousel.at(-1).footer.contents.find(item=>item.action?.label==='下一批電影 →');
 if(next){const page2=await cards.handle(actor,next.action.data);assert.match(page2.text,/第 2\//);await validate(page2);}
 assert.equal(store.list(actor).length,0);assert.equal(store.pending(actor),undefined);
 console.log(JSON.stringify({status:'ok',tools,coldQueryMilliseconds:Date.now()-started,cinema:result.cinema,date:result.date,afterTime:result.afterTime,provider:result.provider,source:result.sourceUrl,movieVersionGroups:result.movies.length,films:snapshot.items.length,showtimes:result.movies.reduce((sum,movie)=>sum+movie.times.length,0),lineValidation:200,nextPageValidated:!!next,ticketWrites:0}));
}finally{store.close();}
