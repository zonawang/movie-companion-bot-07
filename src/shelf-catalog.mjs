const imagePath = value => typeof value === 'string' && /^\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(value) ? value : null;
export class ShelfCatalog {
  constructor({ token = '', fetcher = fetch } = {}) { this.token = token; this.fetcher = fetcher; }
  async request(path, parameters = {}) {
    if (!this.token) return null;
    const url = new URL('https://api.themoviedb.org/3/' + path);
    for (const [key, value] of Object.entries({ language: 'zh-TW', ...parameters })) url.searchParams.set(key, value);
    try {
      const response = await this.fetcher(url, { headers: { Authorization: `Bearer ${this.token}`, accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error' });
      return response.ok ? await response.json() : null;
    } catch { return null; }
  }
  view(movie) {
    if (!movie || !Number.isInteger(movie.id) || movie.id < 1 || typeof movie.title !== 'string' || movie.adult) return null;
    return { id: movie.id, title: movie.title.slice(0, 150), releaseDate: typeof movie.release_date === 'string' ? movie.release_date.slice(0, 10) : '',
      posterPath: imagePath(movie.poster_path), url: `https://www.themoviedb.org/movie/${movie.id}` };
  }
  async search(query) {
    const result = await this.request('search/movie', { query, include_adult: 'false', region: 'TW' });
    return { available: !!result && Array.isArray(result.results), movies: Array.isArray(result?.results) ? result.results.slice(0, 8).map(movie => this.view(movie)).filter(Boolean) : [] };
  }
  async details(id) {
    const result = await this.request('movie/' + id);
    return result?.id === id ? this.view(result) : null;
  }
}
