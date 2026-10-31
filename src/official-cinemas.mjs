import { load } from 'cheerio';
import { normalizeName } from './cinema-registry.mjs';

const dateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const timeValid = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const configs = {
  'atmovies-t04411': { type: 'showtime', name: '台中文心秀泰影城', url: 'https://www.showtimes.com.tw/cinemas/56/', source: '秀泰影城官方公開場次頁' },
  'atmovies-t02d02': { type: 'ambassador', name: '台北長春國賓影城', id: '453b2966-f7c2-44a9-b2eb-687493855d0e', url: 'https://www.ambassador.com.tw/home/Showtime?ID=453b2966-f7c2-44a9-b2eb-687493855d0e', source: '國賓影城官方公開時刻表' },
  'atmovies-t06902': { type: 'in89', name: '澎湖昇恆昌in89豪華影城', id: '1', url: 'https://www.in89cinemax.com/film_list.aspx?TheaterId=14', api: 'https://penghu.in89.com.tw/api/api_movie.php?method=getStagesByDate', source: 'in89 官方公開場次資料' },
};
export const officialCinemaUrl = id => configs[id]?.url || '';
function add(rows, date, title, version, time, detailUrl) {
  if (!dateValid(date) || !timeValid(time) || typeof title !== 'string' || !title.trim()) throw new Error('Invalid official schedule');
  rows.push({ date, title: title.trim().slice(0,150), version: version.trim().slice(0,80) || '來源未標示版本', time, detailUrl });
}
function safeLink(value, base, path) {
  try { const url = new URL(value, base); return url.origin === new URL(base).origin && path.test(url.pathname) ? url.href : null; } catch { return null; }
}
export function parseShowtimeOfficial(html) {
  const config = configs['atmovies-t04411'], $ = load(html);
  if (!$('h1').toArray().some(el => normalizeName($(el).text().trim()) === normalizeName(config.name))) throw new Error('Wrong cinema');
  const anchors = $('script[type="application/ld+json"]').map((_,el) => {
    try { const body = JSON.parse($(el).text()); return body['@type'] === 'ScreeningEvent' && typeof body.startDate === 'string' ? body.startDate.slice(0,10) : null; } catch { return null; }
  }).get().filter(dateValid).sort();
  if (!anchors.length) throw new Error('Missing year anchor');
  const anchor = anchors[0], year = Number(anchor.slice(0,4)), rows = [], dates = new Set();
  // JSON-LD is capped by the official page; read ALL displayed date groups instead of only those first events.
  $('.seo-card h3').each((_,el) => {
    const title = $(el).text().trim(), detailUrl = safeLink($(el).find('a').attr('href'),config.url,/^\/programs\/\d+\/$/);
    let date = '';
    $(el).nextUntil('h3').each((_,node) => {
      const item = $(node), match = /^(\d{1,2})月(\d{1,2})日\s/.exec(item.is('p') ? item.text().trim() : '');
      if (match) {
        const candidates = [year-1,year,year+1].map(y=>`${y}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`).filter(dateValid)
          .sort((a,b)=>Math.abs(Date.parse(a)-Date.parse(anchor))-Math.abs(Date.parse(b)-Date.parse(anchor)));
        date = candidates[0]; if (!date || Math.abs(Date.parse(date)-Date.parse(anchor))>183*86400000) throw new Error('Ambiguous official date');
        dates.add(date);
      }
      if (item.hasClass('seo-showtime-grid')) item.find('a').each((_,a) => {
        if (!safeLink($(a).attr('href'),config.url,/^\/ticketing\/cart\/selectTicketTypes\/\d+$/)) throw new Error('Invalid showtime link');
        add(rows,date,title,$(a).find('.f').text(),$(a).find('.t').text().normalize('NFKC').trim(),detailUrl);
      });
    });
  });
  if (!rows.length) throw new Error('No readable official showtimes');
  return { rows, publishedDates:[...dates].sort() };
}
export function parseAmbassadorOfficial(html) {
  const config = configs['atmovies-t02d02'], $ = load(html);
  if (!$('h1').toArray().some(el => normalizeName($(el).text().trim()) === normalizeName(config.name))) throw new Error('Wrong cinema');
  const decodeDate = value => {
    try { const u = new URL(value,config.url); const d = (u.searchParams.get('DT') || '').replaceAll('/','-');
      return u.origin === 'https://www.ambassador.com.tw' && u.pathname.toLowerCase() === '/home/showtime' && u.searchParams.get('ID') === config.id && dateValid(d) ? d : null;
    } catch { return null; }
  };
  const selected = $('.search-bar-page .has-submenu > a').map((_,el)=>decodeDate($(el).attr('href'))).get();
  if (new Set(selected).size !== 1) throw new Error('Ambiguous official date');
  const date = selected[0], dates = new Set($('a[href]').map((_,el)=>decodeDate($(el).attr('href'))).get()), rows=[];
  $('.showtime-item .theater-box').each((_,el)=>{
    const item=$(el), link=item.find('h3>a').first(), title=link.clone().children().remove().end().text().trim();
    const detailUrl=safeLink(link.attr('href'),config.url,/^\/home\/MovieContent$/i);
    const label=item.children('.tag-seat').text().trim(), version=/^[（(]([^）)]+)[）)]/.exec(label)?.[1] || '來源未標示版本';
    const times=item.find('.seat-list > li > h6'); if (!times.length) throw new Error('Missing official showtimes');
    times.each((_,time)=>add(rows,date,title,version,$(time).text().normalize('NFKC').trim(),detailUrl));
  });
  if (!rows.length) throw new Error('No readable official showtimes');
  return { rows,publishedDates:[...dates].sort() };
}
export function parseIn89Official(body) {
  const config=configs['atmovies-t06902'];
  if (!body || String(body.theater_id)!==config.id || normalizeName(body.name || '')!==normalizeName(config.name)) throw new Error('Wrong cinema');
  if (!body.movies || typeof body.movies!=='object' || !body.stages || typeof body.stages!=='object') throw new Error('Invalid official data');
  const rows=[], dates=new Set();
  const visit=(value,depth=0)=>{
    if (depth>6) throw new Error('Invalid stage depth');
    if (!value || typeof value!=='object') throw new Error('Invalid stage data');
    if (Object.hasOwn(value,'movie_show_time')) {
      const movie=body.movies[String(value.movie_id)], match=/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):[0-5]\d$/.exec(value.movie_show_time);
      if (!movie || !match || String(movie.movie_id)!==String(value.movie_id)) throw new Error('Invalid stage movie/date');
      const [ ,date,time]=match;
      const version=[movie.movie_play_desc,movie.movie_lang_desc,value.theater_film_name].filter(v=>typeof v==='string'&&v.trim()).join('・');
      const detail=new URL('https://www.in89cinemax.com/film_detail.aspx');
      detail.searchParams.set('TheaterId','14'); detail.searchParams.set('movie_id',String(movie.movie_id));
      add(rows,date,movie.movie_group_name,version,time,detail.href); dates.add(date); return;
    }
    for (const child of Object.values(value)) visit(child,depth+1);
  };
  visit(body.stages);
  if (!rows.length) throw new Error('No readable official showtimes');
  return { rows,publishedDates:[...dates].sort() };
}
export class OfficialCinemaSource {
  constructor({fetcher=fetch,now=()=>new Date()}={}) {this.fetcher=fetcher;this.now=now;this.cache=new Map();this.inflight=new Map();this.retryAt=new Map();this.errors=new Map();}
  supports(id) {return !!configs[id];}
  async page(id,date) {
    const config=configs[id], url=new URL(config.api || config.url);
    if(config.type==='ambassador')url.searchParams.set('DT',date.replaceAll('-','/'));
    const key=url.href, now=this.now().valueOf();
    for(const [k,v] of this.cache)if(now-v.fetched>=300000)this.cache.delete(k);
    for(const [k,v] of this.retryAt)if(v<=now){this.retryAt.delete(k);this.errors.delete(k);}
    if(this.cache.has(key))return this.cache.get(key);
    if(this.inflight.has(key))return this.inflight.get(key);
    if(this.retryAt.has(key))throw this.errors.get(key) || Object.assign(new Error('Official source cooling down'),{kind:'network'});
    this.retryAt.set(key,now+30000);
    const pending=(async()=>{
      const options={headers:{'User-Agent':'MovieCompanionLearningBot/0.3',accept:config.type==='in89'?'application/json':'text/html'},signal:AbortSignal.timeout(6000),redirect:'error',credentials:'omit'};
      if(config.type==='in89'){options.method='POST';options.headers['Content-Type']='application/x-www-form-urlencoded';options.body=new URLSearchParams({method:'getStagesByDate'});}
      const response=await this.fetcher(key,options);if(!response.ok)throw Object.assign(new Error('Official HTTP'),{kind:'http',httpStatus:response.status});
      // Bound response size before parsing; no login/session, booking, seats or payment API calls.
      const reader=response.body.getReader(), chunks=[];let bytes=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2000000){await reader.cancel();throw new Error('Official response too large');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
      const raw=Buffer.concat(chunks).toString('utf8');
      let parsed;
      try{parsed=config.type==='showtime'?parseShowtimeOfficial(raw):config.type==='ambassador'?parseAmbassadorOfficial(raw):parseIn89Official(JSON.parse(raw));}
      catch{throw Object.assign(new Error('Unrecognized official data'),{kind:'format'});}
      const page={...parsed,fetched:this.now().valueOf(),sourceUrl:config.type==='ambassador'?key:config.url};
      if(this.cache.size>=50)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,page);return page;
    })();
    this.inflight.set(key,pending);try{return await pending;}catch(error){this.errors.set(key,error);throw error;}finally{this.inflight.delete(key);}
  }
  async schedule(cinema,{date,afterTime='',onlyUpcoming=false}) {
    const config=configs[cinema.id];if(!config)return null;
    const base={cinemaId:cinema.id,cinema:cinema.name,brand:cinema.brand,provider:'official',source:config.source,sourceUrl:config.url,bookingUrl:config.url,date,afterTime,onlyUpcoming};
    try{
      const page=await this.page(cinema.id,date), meta={...base,sourceUrl:page.sourceUrl,fetchedAt:new Date(page.fetched).toISOString(),publishedDates:page.publishedDates};
      if(!page.publishedDates.includes(date))return {...meta,status:'not_published'};
      const groups=new Map();
      for(const row of page.rows)if(row.date===date&&row.time>=afterTime){
        const key=JSON.stringify([row.title,row.version,row.detailUrl]);
        if(!groups.has(key))groups.set(key,{title:row.title,version:row.version,detailUrl:row.detailUrl,times:[]});groups.get(key).times.push(row.time);
      }
      const movies=[...groups.values()].map(movie=>({...movie,times:[...new Set(movie.times)].sort()})).sort((a,b)=>a.times[0].localeCompare(b.times[0]));
      return {...meta,status:movies.length?'ok':'no_upcoming',movies};
    }catch(error){const kind=error.kind||'network';const reason=kind==='http'?`官方來源連線失敗（HTTP ${error.httpStatus}）`:kind==='format'?'官方來源格式無法辨識或分館／日期無法核對':'官方來源連線失敗或逾時';return {...base,status:'unavailable',failure:{kind,...(error.httpStatus?{httpStatus:error.httpStatus}:{})},message:reason+'，請開啟影城官網確認。'};}
  }
}
