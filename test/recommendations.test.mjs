import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseLlm } from '@google/adk';
import { MovieSource } from '../src/movies.mjs';
import { recommendMovies, formatRecommendations } from '../src/recommendations.mjs';
import { MovieCompanion } from '../src/agent.mjs';
import { MovieNavigation } from '../src/navigation.mjs';
import { Store } from '../src/store.mjs';
const preferences = { mood: 'light', genres: ['comedy'], excludeGenres: ['horror'], matchAll: false };
const rows = [
  { id: 10, title: '喜劇甲', genre_ids: [35], popularity: 9 },
  { id: 11, title: '恐怖喜劇', genre_ids: [35, 27], popularity: 100 },
  { id: 12, title: '類型不詳', popularity: 1000 },
  { id: 13, title: '喜劇乙', genre_ids: [35], popularity: 8 },
  { id: 14, title: '成人', genre_ids: [35], adult: true },
  { id: -1, title: '無效', genre_ids: [35] },
];
const makeSource = (data = rows, failPage = 0) => new MovieSource({ mode: 'tmdb', token: 'fixture', fetcher: async url => {
  assert.equal(url.searchParams.get('region'), 'TW');
  return new Response(JSON.stringify({ results: data }), { status: Number(url.searchParams.get('page')) === failPage ? 503 : 200 });
} });
test('real-source pipeline excludes horror, unknown genres, adult entries and duplicate IDs before ranking', async () => {
  const result = await recommendMovies(makeSource(), preferences);
  assert.deepEqual(result.movies.map(movie => movie.id), [10, 13]);
  assert.match(result.movies[0].reason, /喜劇/);
  assert.doesNotMatch(formatRecommendations(result), /恐怖喜劇|類型不詳|成人/);
  assert.match(formatRecommendations(result), /不代表特定影城/);
});
test('all-genre requests, no matches, partial failures and live outages do not fabricate replacements', async () => {
  assert.equal((await recommendMovies(makeSource(), { ...preferences, genres: ['comedy', 'action'], matchAll: true })).movies.length, 0);
  assert.match(formatRecommendations(await recommendMovies(makeSource(), { ...preferences, genres: ['documentary'] })), /沒有符合/);
  assert.equal((await recommendMovies(makeSource(rows, 2), preferences)).partial, true);
  const source = new MovieSource({ mode: 'tmdb', token: 'fixture', fetcher: async () => { throw new Error('offline'); } });
  const result = await recommendMovies(source, preferences);
  assert.equal(result.status, 'unavailable'); assert.deepEqual(result.movies, []);
  assert.doesNotMatch(formatRecommendations(result), /月台上的貓/);
});
class RecommendationModel extends BaseLlm {
  constructor() { super({ model: 'recommendation-fixture' }); this.calls = 0; }
  async *generateContentAsync() {
    const step = this.calls++;
    if (step === 0) yield { content: { role: 'model', parts: [{ functionCall: { name: 'open_movie_feature', args: { feature: 'recommend' } } }] } };
    else if (step === 2) yield { content: { role: 'model', parts: [{ functionCall: { name: 'recommend_movies', args: preferences } }] } };
    else yield { content: { role: 'model', parts: [{ text: '模型編造電影：假的冠軍，https://untrusted.invalid' }] }, turnComplete: true };
  }
}
test('multi-turn real ADK runner opens the guide then returns only retrieved recommendations without ticket writes', async () => {
  const store = new Store(), traces = [], navigation = new MovieNavigation();
  try {
    const bot = new MovieCompanion({ store, movies: makeSource(), model: new RecommendationModel(), navigation, trace: name => traces.push(name) });
    const entry = await bot.respond('recommend-fixture', navigation.prompt('recommend'));
    assert.equal(entry.quickReplies.length, 3); assert.match(entry.text, /心情/);
    const result = await bot.respond('recommend-fixture', '跟朋友看喜劇，不要恐怖片');
    assert.deepEqual(traces, ['open_movie_feature', 'recommend_movies']);
    assert.match(result.text, /喜劇甲/); assert.doesNotMatch(result.text, /假的冠軍|untrusted|恐怖喜劇/);
    assert.equal(store.list('recommend-fixture').length, 0); assert.equal(store.pending('recommend-fixture'), undefined);
  } finally { store.close(); }
});
