import { load } from 'cheerio';
import { validDate, validTime } from './atmovies.mjs';
import { normalizeName } from './cinema-registry.mjs';

// Explicitly matched branch only. This independent public publisher is not the cinema's official API.
const branch = { id: 'atmovies-t02a13', name: '大巨蛋秀泰影城', url: 'https://twshowtimes.com/cinemas/showtimes-dajudan/', address: '台北市信義區光復南路105號2樓', bookingUrl: 'https://www.showtimes.com.tw/cinemas/91/' };
export function parseTwshowtimesSchedule(html) {
  const $ = load(html), main = $('main');
  if (main.length !== 1 || main.find('h1').length !== 1 || normalizeName(main.find('h1').text()) !== normalizeName(branch.name)) throw new Error('Wrong cinema');
  const identities = $('script[type="application/ld+json"]').map((_, element) => {
    try { const data = JSON.parse($(element).text()); return data['@type'] === 'MovieTheater' ? data : null; } catch { return null; }
  }).get();
  if (identities.length !== 1 || identities[0].url !== branch.url || normalizeName(identities[0].name || '') !== normalizeName(branch.name)
    || normalizeName(identities[0].address?.streetAddress || '') !== normalizeName(branch.address)) throw new Error('Wrong cinema identity');
  const headings = main.find('h2').map((_, element) => $(element).text().replace(/\s+/g, ' ').trim()).get();
  const dates = headings.map(text => /^(\d{4}-\d{2}-\d{2}) 片單\s+共 (\d+) 部電影$/.exec(text)).filter(Boolean);
  if (dates.length !== 1 || !validDate(dates[0][1])) throw new Error('Unknown schedule date');
  const date = dates[0][1], movies = [], cards = main.find('.card-body');
  if (!cards.length || cards.length !== Number(dates[0][2])) throw new Error('Incomplete schedule');
  cards.each((_, element) => {
    const card = $(element), link = card.find('a.card-title'), title = link.text().trim();
    if (link.length !== 1 || !title) throw new Error('Missing movie');
    const detail = new URL(link.attr('href'), branch.url);
    if (detail.origin !== 'https://twshowtimes.com' || detail.username || detail.password || !/^\/movies\/[^/]+\/\d{4}-\d{2}-\d{2}\/$/.test(detail.pathname)
      || !detail.pathname.endsWith(`/${date}/`)) throw new Error('Invalid movie link/date');
    const versions = card.children('.space-y-1').children('div');
    if (!versions.length) throw new Error('Missing versions');
    versions.each((_, element) => {
      const row = $(element), label = row.children('span:not(.font-mono)'), times = row.children('span.font-mono').map((_, time) => $(time).text().normalize('NFKC').trim()).get();
      if (label.length !== 1 || !label.text().trim() || !times.length || times.some(time => !validTime(time))) throw new Error('Invalid version/showtime');
      movies.push({ title: title.slice(0, 150), version: label.text().trim().slice(0, 80), detailUrl: detail.href, times: [...new Set(times)].sort() });
    });
  });
  return { date, movies };
}
export class TwshowtimesSource {
  constructor({ fetcher = fetch, now = () => new Date() } = {}) { this.fetcher = fetcher; this.now = now; this.cached = null; this.inflight = null; this.retryAt = 0; this.error = null; }
  supports(id) { return id === branch.id; }
  async page() {
    if (this.cached && this.now().valueOf() - this.cached.fetched < 300_000) return this.cached;
    if (this.inflight) return this.inflight;
    if (this.retryAt > this.now().valueOf()) throw this.error;
    const pending = (async () => {
      const response = await this.fetcher(branch.url, { headers: { 'User-Agent': 'MovieCompanionLearningBot/0.3', accept: 'text/html' }, signal: AbortSignal.timeout(5000), redirect: 'error', credentials: 'omit' });
      if (!response.ok) throw Object.assign(new Error('Schedule HTTP'), { kind: 'http', httpStatus: response.status });
      const reader = response.body.getReader(), chunks = []; let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          length += value.length; if (length > 2_000_000) { await reader.cancel(); throw Object.assign(new Error('Page too large'), { kind: 'format' }); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      let parsed; try { parsed = parseTwshowtimesSchedule(Buffer.concat(chunks).toString('utf8')); }
      catch { throw Object.assign(new Error('Unrecognized schedule'), { kind: 'format' }); }
      this.cached = { ...parsed, fetched: this.now().valueOf() }; return this.cached;
    })();
    this.inflight = pending;
    try { return await pending; }
    catch (error) { this.error = error; this.retryAt = this.now().valueOf() + 30_000; throw error; }
    finally { this.inflight = null; }
  }
  async schedule(cinema, { date, afterTime = '', onlyUpcoming = false }) {
    if (!this.supports(cinema.id)) return null;
    const base = { cinemaId: cinema.id, cinema: cinema.name, brand: cinema.brand, provider: 'twshowtimes', source: '場次通（第三方時刻表，非影城官方）', sourceUrl: branch.url, bookingUrl: branch.bookingUrl, date, afterTime, onlyUpcoming };
    try {
      const page = await this.page(), meta = { ...base, sourceDate: page.date, fetchedAt: new Date(page.fetched).toISOString() };
      // Only parse the date actually shown on this public entry page; never infer future dates from a URL or cached older data.
      if (page.date !== date) return { ...meta, status: 'unavailable', failure: { kind: 'date' }, message: `備援頁列的是 ${page.date}，尚未取得 ${date} 可核對的場次。` };
      const movies = page.movies.map(movie => ({ ...movie, times: movie.times.filter(time => time >= afterTime) })).filter(movie => movie.times.length).sort((a, b) => a.times[0].localeCompare(b.times[0]));
      return { ...meta, status: movies.length ? 'ok' : 'no_upcoming', movies };
    } catch (error) {
      return { ...base, status: 'unavailable', failure: { kind: error?.kind || 'network', ...(error?.httpStatus ? { httpStatus: error.httpStatus } : {}) }, message: '場次通備援暫時無法讀取或核對，請開啟影城官網確認。' };
    }
  }
}
