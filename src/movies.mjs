// 虛構資料只用來驗證工具流程，絕不是目前上映名單。
const fixtures = [
  { id: 1, title: '月台上的貓', releaseDate: '虛構日期', overview: '一名通勤族在末班車月台遇見一隻貓，開始注意每天擦肩而過的人。', url: null },
  { id: 2, title: '星期天的放映室', releaseDate: '虛構日期', overview: '即將關門的社區戲院，邀請居民帶著自己的故事參加最後一場放映。', url: null },
];
export const showtimeLinks = () => ({
  status: 'links_only',
  notice: '可先用 list_cinemas 找全台已登錄的影城與場館，再用 cinema_schedule 查場次；誠品來自官方，其他影城使用開眼第三方資料。部分場館僅圖片入口，沒有即時座位或票價。',
  sources: [
    { name: '松菸誠品電影院官方時刻表', url: 'https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001' },
    { name: '威秀影城', url: 'https://www.vscinemas.com.tw/' },
  ],
});

export class MovieSource {
  constructor({ mode = 'demo', token, fetcher = fetch } = {}) {
    this.mode = mode; this.token = token; this.fetcher = fetcher;
    if (!['demo', 'tmdb'].includes(mode)) throw new Error('不支援的電影資料模式');
  }
  async request(path, params = {}) {
    const url = new URL(`https://api.themoviedb.org/3/${path}`);
    for (const [key, value] of Object.entries({ language: 'zh-TW', ...params })) url.searchParams.set(key, value);
    try {
      if (!this.token) return { status: 'unavailable', message: '尚未設定 TMDB token。' };
      const response = await this.fetcher(url, {
        headers: { Authorization: `Bearer ${this.token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return { status: 'unavailable', message: `TMDB 暫時無法查詢（HTTP ${response.status}）。` };
      const body = await response.json();
      if (!Array.isArray(body.results)) return { status: 'unavailable', message: 'TMDB 資料格式無法辨識。' };
      return { status: 'ok', body };
    } catch { return { status: 'unavailable', message: 'TMDB 連線失敗或逾時，請稍後再試。' }; }
  }
  async movies(query = '') {
    if (this.mode === 'demo') return {
      status: 'demo', source: '虛構示範資料',
      notice: '【示範模式】以下是虛構電影，不是目前上映名單。',
      movies: fixtures.filter(movie => !query || movie.title.includes(query)),
    };
    const result = await this.request(query ? 'search/movie' : 'movie/now_playing',
      query ? { query, include_adult: 'false', region: 'TW' } : { region: 'TW' });
    if (result.status !== 'ok') return result;
    return {
      status: 'ok', source: 'TMDB', retrievedAt: new Date().toISOString(),
      notice: 'TMDB 的電影與上映資料不代表特定影城今日有場次；未查到時不補造內容。',
      movies: result.body.results.slice(0, 5).map(movie => ({
        id: movie.id, title: movie.title, releaseDate: movie.release_date || '未提供',
        overview: movie.overview || '尚無繁體中文簡介', url: `https://www.themoviedb.org/movie/${movie.id}`,
      })),
    };
  }
  async reviews(movieId) {
    if (this.mode === 'demo') return { status: 'demo', notice: '示範電影沒有真實影評，請切換 TMDB 模式後查詢。', reviews: [] };
    const result = await this.request(`movie/${movieId}/reviews`);
    if (result.status !== 'ok') return result;
    return {
      status: 'ok', source: 'TMDB 使用者評論',
      notice: '這是使用者評論，不代表專業影評或整體共識。預設僅提供作者與原文連結，點開可能有劇透。沒有評論請明確說明。',
      reviews: result.body.results.slice(0, 3).map(review => ({ author: review.author, date: review.created_at, url: review.url })),
    };
  }
  async recommendationCandidates() {
    if (this.mode === 'demo') return { status: 'demo', source: '虛構示範資料', movies: fixtures.map(movie => ({ ...movie, genreIds: [18, 35], popularity: 0 })) };
    const pages = await Promise.all([1, 2].map(page => this.request('movie/now_playing', { region: 'TW', page })));
    const available = pages.filter(page => page.status === 'ok');
    if (!available.length) return { status: 'unavailable', movies: [] };
    const seen = new Set();
    const movies = available.flatMap(page => page.body.results).slice(0, 40).filter(movie => {
      if (!Number.isSafeInteger(movie.id) || movie.id < 1 || typeof movie.title !== 'string' || !movie.title.trim() || movie.adult === true || seen.has(movie.id)) return false;
      seen.add(movie.id); return true;
    }).map(movie => ({ id: movie.id, title: movie.title.slice(0, 150),
      genreIds: Array.isArray(movie.genre_ids) ? movie.genre_ids.filter(Number.isSafeInteger) : [],
      popularity: Number.isFinite(movie.popularity) ? movie.popularity : 0,
      url: `https://www.themoviedb.org/movie/${movie.id}` }));
    return { status: 'ok', source: 'TMDB', partial: available.length < pages.length, retrievedAt: new Date().toISOString(), movies };
  }
}
