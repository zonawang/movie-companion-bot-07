const key = title => title.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
const posterPath = path => typeof path === 'string' && /^\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(path) ? path : null;
// Supplement metadata only: the cinema's actual schedule always supplies titles, versions and times.
export class MovieCardCatalog {
  constructor({ token = '', fetcher = fetch, now = () => Date.now() } = {}) { this.token = token; this.fetcher = fetcher; this.now = now; this.cache = new Map(); this.inflight = new Map(); }
  async lookup(title) {
    if (!this.token || typeof title !== 'string' || !title.trim()) return null;
    const query = title.slice(0, 150), normalized = key(query), cached = this.cache.get(normalized);
    if (cached && cached.until > this.now()) return cached.value;
    if (this.inflight.has(normalized)) return this.inflight.get(normalized);
    if (this.inflight.size >= 20) return null;
    const task = this.fetchMovie(query, normalized);
    this.inflight.set(normalized, task);
    try {
      const value = await task;
      for (const [id, entry] of this.cache) if (entry.until <= this.now()) this.cache.delete(id);
      if (this.cache.size >= 300) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(normalized, { value, until: this.now() + (value ? 600_000 : 30_000) });
      return value;
    } finally { this.inflight.delete(normalized); }
  }
  async fetchMovie(query, normalized) {
    try {
      const url = new URL('https://api.themoviedb.org/3/search/movie');
      for (const [name, value] of Object.entries({ query, language: 'zh-TW', region: 'TW', include_adult: 'false' })) url.searchParams.set(name, value);
      const response = await this.fetcher(url, { headers: { Authorization: `Bearer ${this.token}`, accept: 'application/json' }, signal: AbortSignal.timeout(2500), redirect: 'error' });
      if (!response.ok) return null;
      const body = await response.json();
      // Multiple result pages could hide another same-name work. Never select the first search hit by default.
      if (!Array.isArray(body.results) || body.total_pages > 1) return null;
      const candidates = [...new Map(body.results.filter(movie => Number.isSafeInteger(movie.id) && movie.id > 0 && !movie.adult && typeof movie.title === 'string'
        && [movie.title, movie.original_title].some(title => typeof title === 'string' && key(title) === normalized)).map(movie => [movie.id, movie])).values()];
      if (candidates.length !== 1) return null;
      const movie = candidates[0], path = posterPath(movie.poster_path);
      return { id: movie.id, title: movie.title.slice(0, 150), posterUrl: path ? 'https://image.tmdb.org/t/p/w500' + path : null,
        overview: typeof movie.overview === 'string' ? movie.overview.replace(/\s+/g, ' ').trim().slice(0, 800) : '', url: `https://www.themoviedb.org/movie/${movie.id}` };
    } catch { return null; }
  }
}
