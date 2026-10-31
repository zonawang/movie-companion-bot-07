import { load } from 'cheerio';
import { fetchSchedulePage } from './schedule-page.mjs';
import { normalizeName } from './cinema-registry.mjs';

export const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const validTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

export function parseAtmoviesSchedule(html, cinema) {
  const $ = load(html);
  const heading = $('h2').map((_, element) => $(element).text().trim()).get();
  if (!heading.some(name => cinema.sourceNames.some(expected => normalizeName(name) === normalizeName(expected)))) throw new Error('Wrong cinema');
  const block = $('#theaterShowtimeBlock');
  if (!block.length) {
    const poster = $('.theaterboard img[src]').first().attr('src');
    if (poster) {
      const url = new URL(poster, cinema.sourceUrl);
      if (url.origin === 'https://www.atmovies.com.tw' && url.pathname.startsWith('/movie/homeimages/A1showtime/')) {
        return { kind: 'image_only', date: null, publishedDates: [], movies: [], imageUrl: url.href };
      }
    }
    throw new Error('Unknown schedule structure');
  }
  const label = block.prevAll('h3').first().text().trim();
  const match = /^(\d{4})\/(\d{2})\/(\d{2})\s*[（(][日一二三四五六][）)]$/.exec(label);
  const date = match && `${match[1]}-${match[2]}-${match[3]}`;
  if (block.length !== 1 || !date || !validDate(date)) throw new Error('Unknown date structure');
  const publishedDates = new Set([date]);
  $('a[href]').each((_, element) => {
    const url = new URL($(element).attr('href'), cinema.sourceUrl);
    if (url.origin !== 'https://www.atmovies.com.tw') return;
    const prefix = `/showtime/${cinema.theaterCode}/${cinema.areaCode}/`;
    const stamp = url.pathname.startsWith(prefix) && /^(\d{4})(\d{2})(\d{2})\/$/.exec(url.pathname.slice(prefix.length));
    if (stamp) {
      const day = `${stamp[1]}-${stamp[2]}-${stamp[3]}`;
      if (validDate(day)) publishedDates.add(day);
    }
  });
  // 官網使用重複 id，因此用屬性選擇器讀取所有電影／版本區塊。
  const entries = block.find('[id="theaterShowtimeTable"]');
  if (!entries.length) throw new Error('No readable showtimes');
  const movies = [];
  entries.each((_, element) => {
    const entry = $(element);
    const titleLink = entry.children('.filmTitle').find('a').first();
    const title = titleLink.text().replace(/\s+/g, ' ').trim();
    const timeList = entry.children('li').eq(1).children('ul').last();
    const version = timeList.children('.filmVersion').text().replace(/\s+/g, ' ').trim() || '來源未標示版本';
    if (!title || !timeList.length) throw new Error('Missing movie or time list');
    const times = timeList.children('li:not(.filmVersion):not(.theaterElse)').map((_, li) => $(li).text().normalize('NFKC').trim()).get();
    if (!times.length || times.some(time => !validTime(time))) throw new Error('Unknown showtime format');
    const url = new URL(titleLink.attr('href'), cinema.sourceUrl);
    const detailUrl = url.origin === 'https://www.atmovies.com.tw' && /^\/movie\/[a-z0-9]+\/$/.test(url.pathname) ? url.href : null;
    const previous = movies.find(movie => movie.title === title && movie.version === version);
    if (previous) previous.times = [...new Set([...previous.times, ...times])].sort();
    else movies.push({ title, version, detailUrl, times: [...new Set(times)].sort() });
  });
  return { date, publishedDates: [...publishedDates].sort(), movies };
}

export class AtmoviesSource {
  constructor({ fetcher = fetchSchedulePage, now = () => new Date() } = {}) {
    this.fetcher = fetcher; this.now = now; this.cache = new Map(); this.inflight = new Map(); this.retryAt = new Map(); this.errors = new Map();
  }
  async page(cinema, date, today, forceDated = false) {
    const url = cinema.sourceUrl + (date === today && !forceDated ? '' : `${date.replaceAll('-', '')}/`);
    const now = this.now().valueOf();
    for (const [key, value] of this.cache) if (now - value.fetched >= 300_000) this.cache.delete(key);
    for (const [key, value] of this.retryAt) if (value <= now) { this.retryAt.delete(key); this.errors.delete(key); }
    if (this.cache.has(url)) return this.cache.get(url);
    if (this.inflight.has(url)) return this.inflight.get(url);
    if (this.retryAt.has(url)) throw this.errors.get(url) || Object.assign(new Error('Retry later'), { kind: 'network' });
    if (this.retryAt.size >= 200) { const oldest=this.retryAt.keys().next().value; this.retryAt.delete(oldest); this.errors.delete(oldest); }
    this.retryAt.set(url, now + 30_000);
    const promise = (async () => {
      try {
        const response = await this.fetcher(url, {
          headers: { 'User-Agent': 'MovieCompanionLearningBot/0.2', accept: 'text/html' },
          signal: AbortSignal.timeout(5_000), redirect: 'error',
        });
        if (!response.ok) throw Object.assign(new Error('Schedule HTTP'), { kind: 'http', httpStatus: response.status });
        const html = await response.text();
        if (html.length > 2_000_000) throw Object.assign(new Error('Page too large'), { kind: 'format' });
        let parsed;
        try { parsed = parseAtmoviesSchedule(html, cinema); }
        catch { throw Object.assign(new Error('Unrecognized schedule'), { kind: 'format' }); }
        const result = { ...parsed, fetched: this.now().valueOf(), sourceUrl: url };
        if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(url, result); return result;
      } catch (error) {
        const reason = error.kind ? error : Object.assign(new Error('Schedule network failure'), { kind: 'network' });
        this.errors.set(url, reason); throw reason;
      }
    })();
    this.inflight.set(url, promise);
    try { return await promise; } finally { this.inflight.delete(url); }
  }
  async schedule(cinema, { date, afterTime = '', onlyUpcoming = false, local }) {
    const base = {
      cinemaId: cinema.id, cinema: cinema.name, brand: cinema.brand, provider: 'atmovies',
      source: '開眼電影網（第三方時刻表）', sourceUrl: cinema.sourceUrl, bookingUrl: cinema.bookingUrl,
      websiteFromDirectory: cinema.websiteFromDirectory || false,
      date, afterTime, onlyUpcoming,
      notice: '場次由開眼電影網整理，非影城官方 API；來源可能延遲或未涵蓋所有版本。實際場次與售票以影城為準。',
    };
    let page, lastError; const attempts = [];
    const attempt = async forceDated => {
      const url = cinema.sourceUrl + (date === local.date && !forceDated ? '' : `${date.replaceAll('-', '')}/`);
      try {
        const result = await this.page(cinema, date, local.date, forceDated);
        attempts.push({ sourceUrl: url, sourceDate: result.date, status: 'read' }); return result;
      } catch (error) {
        lastError=error; attempts.push({ sourceUrl: url, status: 'failed', kind: error.kind, ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}) }); return null;
      }
    };
    page = await attempt(false);
    // The site's default "today" can lag behind Taiwan's date. Try the explicit date even if it is not linked yet.
    if (date === local.date && (!page || (page.kind !== 'image_only' && page.date !== date))) {
      const dated = await attempt(true); if (dated) page=dated;
    }
    const meta = { ...base, attempts, ...(page ? { sourceUrl:page.sourceUrl, sourceDate:page.date, fetchedAt:new Date(page.fetched).toISOString(), publishedDates:page.publishedDates } : {}) };
    if (!page || (lastError && page.date !== date && page.kind !== 'image_only')) {
      const reason = lastError?.kind === 'http' ? `來源連線失敗（HTTP ${lastError.httpStatus}）` : lastError?.kind === 'format' ? '來源格式無法辨識或缺少可核對場次' : '來源連線失敗或逾時';
      return { ...meta, status:'unavailable', failure:{kind:lastError?.kind || 'network',...(lastError?.httpStatus ? {httpStatus:lastError.httpStatus}:{})}, message:`${reason}，尚未取得 ${date} 可核對的場次，請開啟來源或影城官網確認。` };
    }
    if (page.kind === 'image_only') return { ...meta, status:'links_only', imageUrl:page.imageUrl, message:'這個來源只有圖片時刻表，尚未自動擷取日期與場次。請開啟來源原圖或影城網站確認，不代表沒有放映。' };
    if (page.date !== date) return { ...meta, status:date===local.date?'stale_source':'not_published', message:`來源頁仍是 ${page.date}，尚未取得 ${date} 的有效場次。` };
    const movies=page.movies.map(movie=>({...movie,times:movie.times.filter(time=>time>=afterTime)})).filter(movie=>movie.times.length).sort((a,b)=>a.times[0].localeCompare(b.times[0]));
    return { ...meta,status:movies.length?'ok':'no_upcoming',movies };
  }
}
