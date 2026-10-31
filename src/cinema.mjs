import { EsliteSource, taipeiDateTime } from './eslite.mjs';
import { AtmoviesSource, validDate, validTime } from './atmovies.mjs';
import { OfficialCinemaSource, officialCinemaUrl } from './official-cinemas.mjs';
import { findCinema, matchCinemas, normalizeName } from './cinema-registry.mjs';
export { parseEsliteSchedule, taipeiDateTime } from './eslite.mjs';
export { listCinemas, formatCinemaList } from './cinema-registry.mjs';

const titleKey = value => normalizeName(value).replace(/[\p{P}\p{S}]/gu, '');

export class CinemaSource {
  constructor({ fetcher, now = () => new Date(), eslite, atmovies, official } = {}) {
    this.now = now;
    this.official = official === null ? null : official || new OfficialCinemaSource({ ...(fetcher ? { fetcher } : {}), now });
    this.eslite = eslite || new EsliteSource({ ...(fetcher ? { fetcher } : {}), now });
    this.atmovies = atmovies || new AtmoviesSource({ ...(fetcher ? { fetcher } : {}), now });
  }
  get cache() { return this.eslite.cache; }
  async schedule({ cinema = '松菸誠品', date = '', afterTime = '', onlyUpcoming = false, movieTitle = '' } = {}) {
    const branch = findCinema(cinema);
    if (!branch) {
      const choices = matchCinemas(cinema);
      return choices.length
        ? { status: 'choose_cinema', cinema, choices, message: `找到 ${choices.length} 間候選，請指定分館：${choices.slice(0, 20).map(item => item.name).join('、')}${choices.length > 20 ? '等（僅列前 20 間，可用影城清單分頁查看）' : ''}。可先說品牌或縣市縮小範圍。` }
        : { status: 'unsupported_cinema', cinema, message: '找不到這間分館，請先查詢影城清單，或提供品牌與縣市；本 Bot 未保證涵蓋所有營業場所。' };
    }
    const base = { cinemaId: branch.id, cinema: branch.name, sourceUrl: branch.sourceUrl, bookingUrl: branch.bookingUrl };
    const local = taipeiDateTime(this.now());
    date ||= local.date;
    if (!validDate(date) || (afterTime && !validTime(afterTime)) || typeof onlyUpcoming !== 'boolean'
      || typeof movieTitle !== 'string' || movieTitle.length > 150 || (movieTitle && !titleKey(movieTitle))) {
      return { ...base, status: 'invalid', message: '請使用有效日期 YYYY-MM-DD、24 小時制 HH:mm 與可辨識的片名。' };
    }
    if (date < local.date) return { ...base, date, status: 'past_date', message: '只查目前公告，不提供已過日期的歷史場次。' };
    const lowerBound = [afterTime, onlyUpcoming && date === local.date ? local.time : ''].sort().at(-1);
    let result = branch.provider === 'eslite'
      ? await this.eslite.schedule({ cinema: branch.id, date, afterTime: lowerBound, onlyUpcoming })
      : await this.atmovies.schedule(branch, { date, afterTime: lowerBound, onlyUpcoming, local });
    if (branch.provider !== 'eslite' && result.status !== 'ok' && this.official?.supports(branch.id)) {
      const fallback = await this.official.schedule(branch, { date, afterTime: lowerBound, onlyUpcoming });
      if (fallback && fallback.status !== 'unavailable') result = { ...fallback, fallbackFrom: { status: result.status, sourceDate: result.sourceDate, failure: result.failure }, fallbackNotice: '開眼當日資料無法使用，已改查這間影城的官方公開場次。' };
      else result = { ...result, bookingUrl: officialCinemaUrl(branch.id), websiteFromDirectory: false, officialFallback: fallback?.failure, fallbackNotice: (fallback?.failure?.httpStatus === 403 ? '官方網站拒絕伺服器存取，暫時無法取得場次' : '官方備援也暫時無法核對') + (fallback?.failure?.httpStatus ? `（HTTP ${fallback.failure.httpStatus}）` : '') + '，請直接開啟影城官網確認。' };
    }
    if (result.status !== 'ok' || !movieTitle) return result;
    // 僅作片名文字篩選，保留來源原片名與版本；不讓模型替不確定的片名配對。
    const movies = result.movies.filter(movie => titleKey(movie.title).includes(titleKey(movieTitle)));
    return { ...result, status: movies.length ? 'ok' : 'no_match', movies, movieTitle };
  }
  async compare({ cinemas, ...query }) {
    if (!Array.isArray(cinemas) || cinemas.length < 2 || cinemas.length > 3 || cinemas.some(name => typeof name !== 'string')) {
      return [{ status: 'invalid', message: '一次請選擇 2～3 間分館。' }];
    }
    const unique = [...new Map(cinemas.map(name => [findCinema(name)?.id || normalizeName(name), name])).values()];
    return Promise.all(unique.map(cinema => this.schedule({ ...query, cinema })));
  }
}

export function formatCinemaSchedule(result, { maxChars = 3200 } = {}) {
  const lines = [`${result.cinema || '影城查詢'}${result.date ? `｜${result.date}` : ''}`];
  if (result.status !== 'ok' && result.afterTime) lines.push(`時間條件：${result.afterTime} 起`);
  if (result.sourceDate && result.sourceDate !== result.date) lines.push(`來源頁實際日期：${result.sourceDate}（與查詢日期不同，未採用舊場次）`);
  const footer = [];
  if (result.source) footer.push(`資料來源：${result.source}`);
  if (result.updatedAt) footer.push(`官方更新：${result.updatedAt}`);
  if (result.fetchedAt) {
    const time = taipeiDateTime(new Date(result.fetchedAt));
    footer.push(`讀取時間：${time.date} ${time.time}（台灣時間）`);
  }
  if (result.sourceUrl) footer.push(`${result.provider === 'atmovies' ? '來源時刻表' : '官方時刻表'}：${result.sourceUrl}`);
  if (result.bookingUrl) footer.push(`${result.websiteFromDirectory ? '影城網站（來源頁提供）' : '官方訂票／核對'}：${result.bookingUrl}`);
  if (result.imageUrl) footer.push(`來源圖片時刻表：${result.imageUrl}`);
  if (result.fallbackNotice) footer.push(result.fallbackNotice);
  if (result.sourceUrl) footer.push(result.provider === 'atmovies' ? '第三方資料可能延遲或缺少版本；場次與售票以影城為準。' : '場次與售票異動以官網為準。');
  if (result.status === 'ok') {
    lines.push(result.afterTime ? `以下為 ${result.afterTime} 起的場次：` : '以下為來源目前列出的場次：');
    if (result.movieTitle) lines.push(`片名篩選：${result.movieTitle}（請核對作品與版本）`);
    const budget = maxChars - footer.join('\n').length - 120;
    let shown = 0;
    for (const movie of result.movies) {
      const version = movie.version ? `【${movie.version.slice(0, 40)}】` : '';
      const times = movie.times.slice(0, 12).join('、');
      const line = `${movie.title.slice(0, 100)}${version}：${times}${movie.times.length > 12 ? '（其餘見來源）' : ''}`;
      if (lines.join('\n').length + line.length + 1 > budget) break;
      lines.push(line); shown++;
    }
    if (shown < result.movies.length) lines.push(`顯示 ${shown}/${result.movies.length} 個電影／版本，其餘請見來源或指定片名縮小查詢。`);
    if (result.movies.some(movie => movie.times.some(time => time < '06:00'))) lines.push('凌晨場依來源日期列出，實際入場日期請向影城確認。');
  } else if (result.status === 'no_upcoming') lines.push('目前資料中沒有符合這個時間條件的場次，不代表售完。');
  else if (result.status === 'no_match') lines.push(`目前資料在指定時段內找不到「${result.movieTitle}」，不代表影城沒有放映，請核對片名與來源。`);
  else if (result.status === 'stale_source') lines.push(result.message || '來源頁日期落後，尚未取得查詢日期的場次。');
  else if (result.status === 'not_published') lines.push('尚未查到這天的場次資料，不能判定當天沒有電影。');
  else lines.push(result.message);
  return [...lines, ...footer].filter(Boolean).join('\n');
}

export function formatCinemaSchedules(results, maxChars = 3600) {
  const unique = [...new Map(results.map((result, index) => [`${result.cinemaId || result.cinema || index}:${result.date || ''}:${result.movieTitle || ''}:${result.afterTime || ''}`, result])).values()].slice(0, 3);
  return unique.map(result => formatCinemaSchedule(result, { maxChars: Math.floor(maxChars / unique.length) - 10 })).join('\n\n────\n\n');
}
