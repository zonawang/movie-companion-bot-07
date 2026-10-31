import test from 'node:test';
import assert from 'node:assert/strict';
import { TwshowtimesSource, parseTwshowtimesSchedule } from '../src/twshowtimes.mjs';
import { OfficialCinemaSource, parseShowtimeOfficial } from '../src/official-cinemas.mjs';
import { AtmoviesSource } from '../src/atmovies.mjs';
import { CinemaSource, formatCinemaSchedule } from '../src/cinema.mjs';
import { findCinema } from '../src/cinema-registry.mjs';
import { CinemaCards } from '../src/cinema-cards.mjs';
const now=()=>new Date('2026-10-31T02:00:00Z'),branch=findCinema('大巨蛋秀泰');
const fixture=(date='2026-10-31')=>`<main><h1>大巨蛋秀泰影城</h1><script type="application/ld+json">{"@type":"MovieTheater","name":"大巨蛋秀泰影城","url":"https://twshowtimes.com/cinemas/showtimes-dajudan/","address":{"streetAddress":"台北市信義區光復南路105號2樓"}}</script><h2>${date} 片單 <span>共 1 部電影</span></h2><div class="card"><div class="card-body"><div><a class="card-title" href="/movies/測試片/${date}/">測試片</a></div><div class="space-y-1"><div><span>數位 國語</span><span class="font-mono">17:30</span><span class="font-mono">18:00</span><span class="font-mono">22:40</span></div><div><span>SCREENX 國語</span><span class="font-mono">19:20</span></div></div></div></div></main>`;
const officialFixture=()=>`<h1>大巨蛋秀泰影城</h1><script type="application/ld+json">{"@type":"ScreeningEvent","startDate":"2026-10-31T19:00:00+08:00"}</script><div class="seo-card"><h3><a href="/programs/123/">官方測試片</a></h3><p>10月31日 週六</p><div class="seo-showtime-grid"><a href="/ticketing/cart/selectTicketTypes/9"><span class="t">19:00</span><span class="f">ULTRA 國語</span></a></div></div>`;
const failedAtmovies=()=>new AtmoviesSource({now,fetcher:async()=>new Response('',{status:502})});
test('Dome third-party parser requires exact branch identity and complete ISO date, preserving versions',()=>{
 const result=parseTwshowtimesSchedule(fixture());assert.equal(result.date,'2026-10-31');assert.equal(result.movies.length,2);
 assert.deepEqual(result.movies[0].times,['17:30','18:00','22:40']);assert.equal(result.movies[1].version,'SCREENX 國語');
 for(const html of [fixture().replace('<h1>大巨蛋秀泰','<h1>文心秀泰'),fixture().replace('showtimes-dajudan/','wrong-branch/'),fixture().replace('光復南路105號2樓','其他地址'),fixture().replace('2026-10-31 片單','2026-02-30 片單'),fixture().replace('共 1 部電影','共 2 部電影'),fixture().replace('22:40','25:40'),fixture().replace('href="/movies/測試片/2026-10-31/"','href="https://evil.test/movies/x/2026-10-31/"'),fixture().replace('/movies/測試片/2026-10-31/','/movies/測試片/2026-11-01/')])assert.throws(()=>parseTwshowtimesSchedule(html));
});
test('a dated Dome query recovers from primary 502 and official 403, retaining third-party attribution in Flex and complete times',async()=>{
 let calls=0;const thirdParty=new TwshowtimesSource({now,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://twshowtimes.com/cinemas/showtimes-dajudan/');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);return new Response(fixture());}});
 const cinema=new CinemaSource({now,atmovies:failedAtmovies(),official:new OfficialCinemaSource({now,fetcher:async()=>new Response('',{status:403})}),thirdParty});
 const result=await cinema.schedule({cinema:'大巨蛋秀泰',afterTime:'18:00',onlyUpcoming:true});
 assert.equal(result.status,'ok');assert.equal(result.provider,'twshowtimes');assert.equal(result.cinemaId,branch.id);assert.equal(result.fallbackFrom.officialFailure.httpStatus,403);
 assert.deepEqual(result.movies[0].times,['18:00','22:40']);assert.deepEqual(result.movies[1].times,['19:20']);
 assert.match(formatCinemaSchedule(result),/來源時刻表：https:\/\/twshowtimes/);assert.doesNotMatch(formatCinemaSchedule(result),/官方時刻表：https:\/\/twshowtimes/);
 const cards=new CinemaCards(),reply=await cards.present('actor',[result]);assert.match(reply.text,/場次通.*第三方/);assert.match(reply.text,/含第三方時刻表/);
 const full=await cards.handle('actor',reply.messages[1].contents.contents[0].footer.contents[1].action.data);assert.match(full.text,/22:40/);assert.match(full.text,/來源時刻表：https:\/\/twshowtimes/);
 assert.match(JSON.stringify(reply),/twshowtimes\.com/);assert.equal(calls,1);
});
test('official Dome mapping uses its own name and branch URL; a working official result avoids third-party requests',async()=>{
 assert.equal(parseShowtimeOfficial(officialFixture(),branch.id).rows[0].title,'官方測試片');
 assert.throws(()=>parseShowtimeOfficial(officialFixture()),/Wrong cinema/);
 let calls=0;const official=new OfficialCinemaSource({now,fetcher:async url=>{assert.equal(url,'https://www.showtimes.com.tw/cinemas/91/');return new Response(officialFixture());}});
 const cinema=new CinemaSource({now,atmovies:failedAtmovies(),official,thirdParty:new TwshowtimesSource({now,fetcher:async()=>{calls++;throw Error('Should not read');}})});
 assert.equal((await cinema.schedule({cinema:'大巨蛋秀泰',afterTime:'18:00'})).provider,'official');assert.equal(calls,0);
});
test('third-party page dates never become a requested future day or remain valid across midnight',async()=>{
 let current=now();const source=new TwshowtimesSource({now:()=>current,fetcher:async()=>new Response(fixture('2026-10-30'))});
 const stale=await source.schedule(branch,{date:'2026-10-31',afterTime:'18:00'});assert.equal(stale.status,'unavailable');assert.equal(stale.sourceDate,'2026-10-30');assert.equal(stale.movies,undefined);
 const fresh=new TwshowtimesSource({now:()=>current,fetcher:async()=>new Response(fixture())});assert.equal((await fresh.schedule(branch,{date:'2026-10-31',afterTime:'18:00'})).status,'ok');
 current=new Date('2026-10-31T16:01:00Z');const next=await fresh.schedule(branch,{date:'2026-11-01'});assert.equal(next.status,'unavailable');assert.equal(next.movies,undefined);
 assert.equal((await fresh.schedule(branch,{date:'2026-10-31',afterTime:'23:59'})).status,'no_upcoming');
 assert.equal(await fresh.schedule(findCinema('文心秀泰'),{date:'2026-10-31'}),null);
});
test('coalesced third-party reads expire after five minutes, failed reads cool down and never reuse expired schedules',async()=>{
 let current=now(),calls=0,fail=false;const source=new TwshowtimesSource({now:()=>current,fetcher:async()=>{calls++;return new Response(fail?'':fixture(),{status:fail?503:200});}}),query={date:'2026-10-31',afterTime:'18:00'};
 await Promise.all([source.schedule(branch,query),source.schedule(branch,query)]);assert.equal(calls,1);
 current=new Date(current.valueOf()+301000);fail=true;const failed=await source.schedule(branch,query);assert.equal(failed.status,'unavailable');assert.equal(failed.failure.httpStatus,503);assert.equal(failed.movies,undefined);
 await source.schedule(branch,query);assert.equal(calls,2);current=new Date(current.valueOf()+31000);fail=false;assert.equal((await source.schedule(branch,query)).status,'ok');assert.equal(calls,3);
});
test('if every source fails the primary error stays visible, and unknown or past queries do not fetch',async()=>{
 const cinema=new CinemaSource({now,fetcher:async()=>new Response('',{status:502})});const result=await cinema.schedule({cinema:'大巨蛋秀泰',afterTime:'18:00'});
 assert.equal(result.status,'unavailable');assert.equal(result.failure.httpStatus,502);assert.equal(result.thirdPartyFallback.httpStatus,502);assert.equal(result.movies,undefined);assert.match(formatCinemaSchedule(result),/場次通備援/);
 const source=new CinemaSource({now,fetcher:async()=>{throw Error('Must not fetch');}});assert.equal((await source.schedule({cinema:'大巨蛋秀泰',date:'2026-10-30'})).status,'past_date');assert.equal((await source.schedule({cinema:'不存在影城'})).status,'unsupported_cinema');
});
