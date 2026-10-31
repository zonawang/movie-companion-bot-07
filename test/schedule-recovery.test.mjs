import test from 'node:test';
import assert from 'node:assert/strict';
import { AtmoviesSource } from '../src/atmovies.mjs';
import { CinemaSource, formatCinemaSchedule } from '../src/cinema.mjs';
import { CinemaCards } from '../src/cinema-cards.mjs';
import { findCinema } from '../src/cinema-registry.mjs';
import { OfficialCinemaSource, parseShowtimeOfficial, parseAmbassadorOfficial, parseIn89Official } from '../src/official-cinemas.mjs';
const now=()=>new Date('2026-10-31T02:25:00Z');
const entry=(title='測試片',times=['17：00','18：30','20：00'])=>`<ul id="theaterShowtimeTable"><li class="filmTitle"><a href="/movie/test/">${title}</a></li><li><ul></ul><ul>${times.map(time=>`<li>${time}</li>`).join('')}</ul></li></ul>`;
const atPage=(date='2026/10/30',name='國賓長春影城')=>`<h2>${name}</h2><h3>${date} (六)</h3><div id="theaterShowtimeBlock">${entry()}</div>`;
const id='453b2966-f7c2-44a9-b2eb-687493855d0e';
const ambassador=(date='2026/10/31')=>`<h1></h1><h1>台北長春國賓影城</h1><div class="search-bar-page"><div class="has-submenu"><a href="/home/Showtime?ID=${id}&DT=${date}">當日</a></div></div><div class="showtime-item"><div class="theater-box"><h3><a href="/home/MovieContent?MID=fixture&DT=${date}">測試片<span class="eng">Fixture</span></a></h3><p class="tag-seat">(數位‧英文版)測試片</p><ul class="seat-list"><li><h6> 17:00</h6></li><li><h6>18:45</h6></li><li><h6>21:00</h6></li></ul></div></div>`;
const showtime=(heading='台中文心秀泰影城')=>`<h1>${heading}</h1><script type="application/ld+json">{"@type":"ScreeningEvent","startDate":"2026-10-30T18:00:00+08:00"}</script><section class="seo-card"><h3><a href="/programs/123/">測試片</a></h3><p>10月30日 週五</p><div class="seo-showtime-grid"><a href="/ticketing/cart/selectTicketTypes/1"><span class="t">19:00</span><span class="f">數位 英語</span></a></div><p>10月31日 週六</p><div class="seo-showtime-grid"><a href="/ticketing/cart/selectTicketTypes/2"><span class="t">17:30</span><span class="f">數位 英語</span></a><a href="/ticketing/cart/selectTicketTypes/3"><span class="t">20:30</span><span class="f">SCREENX 英語</span></a></div></section>`;
const in89=()=>({theater_id:'1',name:'澎湖昇恆昌in89豪華影城',movies:{'3':{movie_id:'3',movie_group_name:'測試片',movie_play_desc:'2D數位',movie_lang_desc:'英語'}},stages:{'2026-10-31':{group:{'3':[
 {movie_id:'3',movie_show_time:'2026-10-31 17:00:00',theater_film_name:'BOOM廳',seat_free:'8'},
 {movie_id:'3',movie_show_time:'2026-10-31 19:30:00',theater_film_name:'BOOM廳',seat_free:'8'},
 {movie_id:'3',movie_show_time:'2026-11-01 00:30:00',theater_film_name:'BOOM廳',seat_free:'8'},
]}}}});

test('today retries an explicit date when the index is stale and retains the time filter',async()=>{
 const calls=[];const atmovies=new AtmoviesSource({now,fetcher:async url=>{calls.push(url);return new Response(atPage(url.endsWith('/20261031/')?'2026/10/31':'2026/10/30'));}});
 const cinema=new CinemaSource({now,atmovies,official:null});const result=await cinema.schedule({cinema:'長春國賓',afterTime:'18:00',onlyUpcoming:true});
 assert.equal(result.status,'ok');assert.equal(result.sourceDate,'2026-10-31');assert.deepEqual(result.movies[0].times,['18:30','20:00']);
 assert.equal(calls.length,2);assert.match(calls[1],/20261031\/$/);assert.match(result.sourceUrl,/20261031\/$/);
});
test('stale index plus a dated HTTP error reports the actual old date and failure instead of unpublished',async()=>{
 const atmovies=new AtmoviesSource({now,fetcher:async url=>url.endsWith('/20261031/')?new Response('',{status:502}):new Response(atPage())});
 const cinema=new CinemaSource({now,atmovies,official:null});const result=await cinema.schedule({cinema:'長春國賓',afterTime:'18:00'});
 assert.equal(result.status,'unavailable');assert.equal(result.sourceDate,'2026-10-30');assert.equal(result.failure.httpStatus,502);assert.equal(result.movies,undefined);
 const message=formatCinemaSchedule(result);assert.match(message,/2026-10-30/);assert.match(message,/HTTP 502/);assert.match(message,/18:00/);
});
test('a failed index can recover through a dated page, while malformed data is reported separately',async()=>{
 const cinema=new CinemaSource({now,official:null,atmovies:new AtmoviesSource({now,fetcher:async url=>url.endsWith('/20261031/')?new Response(atPage('2026/10/31')):new Response('',{status:502})})});
 assert.equal((await cinema.schedule({cinema:'長春國賓'})).status,'ok');
 const bad=new AtmoviesSource({now,fetcher:async()=>new Response('<html>unexpected</html>')});const result=await bad.schedule(findCinema('長春國賓'),{date:'2026-10-31',local:{date:'2026-10-31'}});
 assert.equal(result.failure.kind,'format');assert.match(result.message,/格式無法辨識/);
});
test('official Showtimes parser reads displayed future groups beyond the JSON-LD cap and checks cinema identity',()=>{
 const result=parseShowtimeOfficial(showtime());assert.equal(result.rows.length,3);assert.ok(result.publishedDates.includes('2026-10-31'));
 assert.equal(result.rows[2].version,'SCREENX 英語');assert.throws(()=>parseShowtimeOfficial(showtime('高雄秀泰影城')),/Wrong cinema/);
 assert.throws(()=>parseShowtimeOfficial(showtime().replace('20:30','25:30')),/Invalid official/);
 const crossing=parseShowtimeOfficial(showtime().replace('2026-10-30','2026-12-31').replace('10月30日','12月31日').replace('10月31日','1月1日'));
 assert.ok(crossing.publishedDates.includes('2027-01-01'));
});
test('official Ambassador parser binds the selected date and branch UUID, ignores English title markup',()=>{
 const result=parseAmbassadorOfficial(ambassador());assert.equal(result.rows[0].title,'測試片');assert.equal(result.rows[1].time,'18:45');assert.equal(result.rows[0].date,'2026-10-31');
 assert.throws(()=>parseAmbassadorOfficial(ambassador().replaceAll(id,'another-branch')),/Ambiguous official date/);
 assert.throws(()=>parseAmbassadorOfficial(ambassador().replace('台北長春國賓影城','新莊晶冠國賓影城')),/Wrong cinema/);
});
test('in89 binds the dedicated feed to Penghu and respects actual calendar dates across midnight',()=>{
 const body=in89(),result=parseIn89Official(body);assert.ok(result.publishedDates.includes('2026-11-01'));assert.equal(result.rows[2].date,'2026-11-01');assert.equal(result.rows[2].time,'00:30');
 assert.doesNotMatch(JSON.stringify(result),/seat_free/);
 assert.throws(()=>parseIn89Official({...body,name:'其他分館'}),/Wrong cinema/);assert.throws(()=>parseIn89Official({...body,theater_id:'14'}),/Wrong cinema/);
 assert.throws(()=>parseIn89Official({...body,movies:{}}),/Invalid stage movie/);
});
test('three-cinema comparison recovers from stale/502 pages using official sources without mixed dates or times',async()=>{
 const atmovies=new AtmoviesSource({now,fetcher:async url=>url.includes('t06902')||url.endsWith('/20261031/')?new Response('',{status:502}):new Response(atPage('2026/10/30',url.includes('t04411')?'台中文心秀泰影城':'國賓長春影城'))});
 const requests=[];const official=new OfficialCinemaSource({now,fetcher:async(url,options)=>{
  requests.push({url,options});if(url.includes('showtimes'))return new Response(showtime());
  if(url.includes('ambassador')){assert.ok(url.includes('DT=2026%2F10%2F31'));return new Response(ambassador());}
  assert.equal(url,'https://penghu.in89.com.tw/api/api_movie.php?method=getStagesByDate');assert.equal(options.method,'POST');
  assert.equal(String(options.body),'method=getStagesByDate');assert.equal(options.headers.Authorization,undefined);return Response.json(in89());
 }});
 const cinema=new CinemaSource({now,atmovies,official});const results=await cinema.compare({cinemas:['文心秀泰','長春國賓','澎湖in89'],afterTime:'18:00',onlyUpcoming:true});
 assert.deepEqual(results.map(row=>row.status),['ok','ok','ok']);assert.ok(results.every(row=>row.provider==='official'&&row.date==='2026-10-31'));
 assert.ok(results.every(row=>row.movies.every(movie=>movie.times.every(time=>time>='18:00'))));
 assert.deepEqual(results[2].movies[0].times,['19:30']);assert.ok(results.every(row=>row.fallbackFrom));assert.equal(requests.length,3);
 assert.ok(results[0].sourceUrl.includes('showtimes'));assert.ok(results[1].sourceUrl.includes('ambassador'));assert.ok(results[2].sourceUrl.includes('in89cinemax'));
});
test('a failed official fallback preserves the original failure and correct official link',async()=>{
 const cinema=new CinemaSource({now,atmovies:new AtmoviesSource({now,fetcher:async()=>new Response('',{status:502})}),official:new OfficialCinemaSource({now,fetcher:async()=>new Response('',{status:503})})});
 const result=await cinema.schedule({cinema:'文心秀泰',afterTime:'18:00'});assert.equal(result.status,'unavailable');assert.equal(result.failure.httpStatus,502);
 assert.equal(result.bookingUrl,'https://www.showtimes.com.tw/cinemas/56/');assert.match(formatCinemaSchedule(result),/官方備援也暫時無法/);
});
test('official cache coalesces anonymous reads, respects expiry and never serves expired data after failure',async()=>{
 let current=now(),calls=0,fail=false;
 const official=new OfficialCinemaSource({now:()=>current,fetcher:async()=>{calls++;return fail?new Response('',{status:503}):Response.json(in89());}});
 const cinema=findCinema('澎湖in89'),query={date:'2026-10-31',afterTime:'18:00'};
 await Promise.all([official.schedule(cinema,query),official.schedule(cinema,query)]);assert.equal(calls,1);
 current=new Date(current.valueOf()+301000);fail=true;
 assert.equal((await official.schedule(cinema,query)).status,'unavailable');assert.equal((await official.schedule(cinema,query)).status,'unavailable');assert.equal(calls,2);
});

 test('one official HTTP 403 remains explicit while other cinemas still produce usable Flex cards',async()=>{
 const cinema=new CinemaSource({now,atmovies:new AtmoviesSource({now,fetcher:async()=>new Response('',{status:502})}),official:new OfficialCinemaSource({now,fetcher:async url=>url.includes('showtimes')?new Response('',{status:403}):url.includes('ambassador')?new Response(ambassador()):Response.json(in89())})});
 const results=await cinema.compare({cinemas:['文心秀泰','長春國賓','澎湖in89'],afterTime:'18:00'});
 assert.deepEqual(results.map(result=>result.status),['unavailable','ok','ok']);assert.equal(results[0].movies,undefined);
 assert.match(formatCinemaSchedule(results[0]),/拒絕伺服器存取.*HTTP 403/);
 const reply=await new CinemaCards().present('fixture',results);
 assert.ok(reply.messages.some(message=>message.type==='flex'));assert.match(reply.text,/拒絕伺服器存取/);
 assert.match(reply.text,/國賓長春影城/);assert.match(reply.text,/in89澎湖影城/);
 });
