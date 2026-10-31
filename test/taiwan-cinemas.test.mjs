import test from 'node:test';
import assert from 'node:assert/strict';
import { cinemas, findCinema, matchCinemas, listCinemas, formatCinemaList } from '../src/cinema-registry.mjs';
import { CinemaSource, formatCinemaSchedule } from '../src/cinema.mjs';
import { parseAtmoviesSchedule } from '../src/atmovies.mjs';
import { lineMessages } from '../src/line.mjs';

const current = () => new Date('2026-10-26T05:00:00Z');
const imagePage = (name, src = '/movie/homeimages/A1showtime/test-202610.jpg') => `<h2>${name}</h2><div class="theaterboard"><img src="${src}"></div><p>更新時間:2026/10/26 14:00</p>`;

test('全台清單逐頁列完且不重複；每頁經 LINE 格式後完整保留，圖片場館有標記', () => {
  const first = listCinemas();
  assert.equal(first.total,108); assert.equal(first.cinemas.length,25); assert.equal(first.pageCount,5);
  const found = [];
  for (let page=1; page<=first.pageCount; page++) {
    const result = listCinemas({ page }), text = formatCinemaList(result);
    assert.ok(text.length < 4000,text.length);
    assert.equal(lineMessages({ text })[0].text,text);
    for (const cinema of result.cinemas) { assert.ok(text.includes(cinema.name)); found.push(cinema.id); }
    if(result.cinemas.some(cinema=>cinema.availability==='image_only'))assert.match(text,/僅圖片場次入口/);
    assert.equal(result.hasMore,page<first.pageCount);
  }
  assert.equal(new Set(found).size,108);
  assert.deepEqual(new Set(found),new Set(cinemas.map(cinema=>cinema.id)));
  assert.match(formatCinemaList(first),/下一頁/);
});

test('清單越界頁碼不假裝沒有影城，篩選後的頁數依符合結果計算', () => {
  assert.equal(listCinemas({ page:0 }).status,'invalid_page');
  assert.equal(listCinemas({ page:6 }).status,'invalid_page');
  assert.match(formatCinemaList(listCinemas({ page:6 })),/108 間、5 頁/);
  assert.equal(listCinemas({ brand:'秀泰',page:2 }).status,'invalid_page');
  assert.equal(listCinemas({ city:'不存在的縣市' }).total,0);
});

test('品牌不預設第一分館，美麗華與美麗新各自獨立，外島仍可查到', async () => {
  assert.equal(matchCinemas('國賓').length,9); assert.equal(matchCinemas('國賓影城').length,9);
  assert.equal(matchCinemas('新光').length,5); assert.equal(matchCinemas('喜樂時代影城').length,4);
  assert.equal(listCinemas({brand:'美麗華'}).total,1); assert.equal(listCinemas({brand:'美麗新'}).total,2);
  assert.equal(findCinema('澎湖in89').county,'澎湖縣'); assert.equal(findCinema('金獅影城').county,'金門縣');
  let calls=0;const source=new CinemaSource({now:current,fetcher:async()=>{calls++;throw Error('不應讀取');}});
  const result=await source.schedule({cinema:'國賓'});assert.equal(result.status,'choose_cinema');assert.equal(result.choices.length,9);assert.equal(calls,0);
});

test('區分新竹市與新竹縣，保留地方與品牌別名，不把城市當作特定戲院', () => {
  const county=listCinemas({city:'新竹縣'}),city=listCinemas({city:'新竹市'});
  assert.equal(county.total,1);assert.match(county.cinemas[0].name,/竹北/);
  assert.equal(city.total,2);assert.ok(city.cinemas.every(cinema=>cinema.county==='新竹市'));
  assert.equal(findCinema('竹北百老匯').id,county.cinemas[0].id);
  assert.equal(findCinema('新竹縣百老匯').id,county.cinemas[0].id);
  assert.equal(findCinema('南投'),undefined);assert.equal(matchCinemas('南投').length,2);
  for(const name of ['文心秀泰','西門國賓','林口國賓','美麗華影城','高雄SKM Park國賓','南港喜樂時代'])assert.ok(findCinema(name),name);
});

test('同一據點只登錄一次，誠品保留官方來源，不與開眼重複計數', () => {
  assert.equal(new Set(cinemas.map(cinema=>cinema.id)).size,108);
  const codes=cinemas.map(cinema=>cinema.theaterCode||cinema.directoryTheaterCode);
  assert.equal(new Set(codes).size,108);
  assert.equal(cinemas.filter(cinema=>cinema.brand==='誠品').length,1);
  assert.equal(findCinema('誠品電影院').provider,'eslite');
  assert.equal(cinemas.filter(cinema=>cinema.availability==='image_only').length,6);
});

test('圖片時刻表不從檔名或更新時間猜放映日期，保留圖片入口並區分網站來源', async () => {
  const cinema=findCinema('府中15');
  const parsed=parseAtmoviesSchedule(imagePage(cinema.name),cinema);
  assert.equal(parsed.kind,'image_only');assert.equal(parsed.date,null);assert.deepEqual(parsed.movies,[]);
  const source=new CinemaSource({now:current,fetcher:async()=>new Response(imagePage(cinema.name))});
  const result=await source.schedule({cinema:'府中15',date:'2026-10-27'}),text=formatCinemaSchedule(result);
  assert.equal(result.status,'links_only');assert.match(text,/只有圖片時刻表/);assert.match(text,/來源圖片時刻表：https:\/\/www.atmovies/);
  assert.match(text,/影城網站（來源頁提供）/);assert.doesNotMatch(text,/官方更新：|沒有電影|以威秀/);
});

test('圖片頁仍驗證分館身分，不信任外部圖片網址或壞掉的表格', () => {
  const cinema=findCinema('府中15');
  assert.throws(()=>parseAtmoviesSchedule(imagePage('另一間戲院'),cinema),/Wrong cinema/);
  assert.throws(()=>parseAtmoviesSchedule(imagePage(cinema.name,'https://evil.test/schedule.jpg'),cinema));
  assert.throws(()=>parseAtmoviesSchedule(`<h2>${cinema.name}</h2><div id="theaterShowtimeBlock"></div>`+imagePage(cinema.name),cinema));
});
