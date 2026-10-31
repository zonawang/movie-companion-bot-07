import { load } from 'cheerio';
import { fetchSchedulePage } from './schedule-page.mjs';

export const esliteScheduleUrl = 'https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001';
export const esliteBookingUrl = 'https://arthouse.eslite.com/visAgreement.aspx';
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function taipeiDateTime(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function datedLabel(label, anchor) {
  const match = /^(\d{1,2})\/(\d{1,2})\s*[（(][日一二三四五六][）)]$/.exec(label);
  if (!match) throw new Error('Unknown date format');
  const year = Number(anchor.slice(0, 4));
  const candidates = [year - 1, year, year + 1].map(y => `${y}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`)
    .filter(validDate).sort((a, b) => Math.abs(Date.parse(a) - Date.parse(anchor)) - Math.abs(Date.parse(b) - Date.parse(anchor)));
  if (!candidates[0] || Math.abs(Date.parse(candidates[0]) - Date.parse(anchor)) > 183 * 86_400_000) throw new Error('Ambiguous date');
  return candidates[0];
}
export function parseEsliteSchedule(html) {
  const $ = load(html);
  const updated = $('.film_waring').text().match(/最後更新時間[：:]\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (!updated || !validDate(updated[1]) || !clock.test(updated[2]) || !$('.film_list > .box').length) throw new Error('Unknown schedule structure');
  const movies = [];
  $('.film_list > .box').each((_, element) => {
    const box = $(element);
    const title = box.find('.intro .left > p').first().text().replace(/\s+/g, ' ').trim();
    if (!title) throw new Error('Missing movie title');
    const href = box.find('.btn-detail-intro').attr('href');
    const url = href && new URL(href, esliteScheduleUrl);
    const detailUrl = url?.origin === 'https://meet.eslite.com' && url.pathname.startsWith('/tw/tc/artshow/') ? url.href : null;
    const days = [];
    box.find('.time-swiper .swiper-slide').each((_, slide) => {
      const date = datedLabel($(slide).children('p').first().text().trim(), updated[1]);
      const times = $(slide).find('ul > li').map((_, li) => $(li).text().trim()).get();
      if (times.some(time => !clock.test(time))) throw new Error('Unknown showtime format');
      if (times.length) days.push({ date, times: [...new Set(times)].sort() });
    });
    movies.push({ title, detailUrl, days });
  });
  if (!movies.some(movie => movie.days.length)) throw new Error('No readable showtimes');
  return { updatedAt: `${updated[1]} ${updated[2]}（Asia/Taipei）`, movies };
}

export class EsliteSource {
  constructor({ fetcher = fetchSchedulePage, now = () => new Date() } = {}) {
    this.fetcher = fetcher; this.now = now; this.cache = null; this.inflight = null; this.nextFetchAt = 0;
  }
  async page() {
    const now = this.now().valueOf();
    if (this.cache && now - this.cache.fetched < 5 * 60_000) return this.cache;
    if (this.inflight) return this.inflight;
    if (now < this.nextFetchAt) throw new Error('Retry later');
    // 共享快取與同時請求合併；避免密集讀取官方網站（robots.txt Crawl-delay: 3）。
    this.nextFetchAt = now + 30_000;
    this.inflight = (async () => {
      const response = await this.fetcher(esliteScheduleUrl, {
        headers: { 'User-Agent': 'MovieCompanionLearningBot/0.1', accept: 'text/html' },
        signal: AbortSignal.timeout(8_000), redirect: 'error',
      });
      if (!response.ok) throw new Error('Schedule unavailable');
      const html = await response.text();
      if (html.length > 2_000_000) throw new Error('Page too large');
      this.cache = { ...parseEsliteSchedule(html), fetched: this.now().valueOf() };
      return this.cache;
    })();
    try { return await this.inflight; } finally { this.inflight = null; }
  }
  async schedule({ cinema = '松菸誠品', date = '', afterTime = '', onlyUpcoming = false } = {}) {
    const base = { cinemaId: 'eslite-songyan', cinema: '松菸誠品電影院', source: '誠品電影院官方時刻表', sourceUrl: esliteScheduleUrl, bookingUrl: esliteBookingUrl };
    if (!['松菸誠品', '松菸誠品電影院', '誠品松菸', '誠品電影院', '誠品', 'eslite', 'eslite-songyan'].includes(cinema.trim().toLowerCase())) {
      return { status: 'unsupported_cinema', message: '目前只有松菸誠品支援場次查詢，其他影城請到各自官網確認。' };
    }
    const local = taipeiDateTime(this.now());
    date ||= local.date;
    if (!validDate(date) || (afterTime && !clock.test(afterTime))) return { ...base, status: 'invalid', message: '請使用有效日期 YYYY-MM-DD 與 24 小時制 HH:mm。' };
    if (date < local.date) return { ...base, status: 'past_date', date, message: '目前只查官方現有公告，不提供已過日期的歷史場次。' };
    try {
      const page = await this.page();
      const publishedDates = [...new Set(page.movies.flatMap(movie => movie.days.map(day => day.date)))].sort();
      const lowerBound = [afterTime, onlyUpcoming && date === local.date ? local.time : ''].sort().at(-1);
      const movies = page.movies.flatMap(movie => {
        const day = movie.days.find(day => day.date === date);
        const times = day?.times.filter(time => time >= lowerBound) || [];
        return times.length ? [{ title: movie.title, detailUrl: movie.detailUrl, times }] : [];
      }).sort((a, b) => a.times[0].localeCompare(b.times[0]));
      return {
        ...base, status: movies.length ? 'ok' : publishedDates.includes(date) ? 'no_upcoming' : 'not_published',
        date, afterTime: lowerBound, onlyUpcoming, movies, publishedDates,
        updatedAt: page.updatedAt, fetchedAt: new Date(page.fetched).toISOString(),
        notice: '僅整理官網目前公告的場次；官網可能已移除開演時間。沒有查到公告不代表當天沒有電影。場次與售票以官方為準，沒有即時座位或票價資訊。',
      };
    } catch { return { ...base, status: 'unavailable', date, message: '官方時刻表暫時無法讀取或格式已變更，請直接開啟官網確認。' }; }
  }
}
