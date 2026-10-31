// Real Gemini + real TMDB; isolated in-memory tickets, no LINE delivery.
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { MovieCompanion } from '../src/agent.mjs';
import { MovieNavigation } from '../src/navigation.mjs';
const settings = config(process.env), store = new Store(), calls = [];
const movies = new MovieSource({ mode: 'tmdb', token: settings.tmdbToken });
const bot = new MovieCompanion({ store, movies, model: settings.model, navigation: new MovieNavigation(), trace: name => calls.push(name) });
try {
  const entry = await bot.respond('recommend-smoke', bot.navigation.prompt('recommend'));
  assert.equal(entry.feature, 'recommend');
  const response = await bot.respond('recommend-smoke', '想跟朋友看輕鬆的喜劇，不要恐怖片，請幫我挑電影');
  assert.ok(calls.includes('recommend_movies'));
  const result = bot.sessions.get('recommend-smoke')?.turn.recommendationResult;
  assert.equal(result?.status, 'ok');
  assert.ok(result.preferences.excludeGenres.includes('horror'));
  assert.ok(result.preferences.genres.includes('comedy'));
  assert.ok(result.movies.length > 0 && result.movies.length <= 3);
  assert.ok(result.movies.every(movie => movie.genreIds.includes(35) && !movie.genreIds.includes(27)));
  for (const movie of result.movies) assert.ok(response.text.includes(movie.title));
  await bot.respond('recommend-smoke', '改成動作片，其他限制不變');
  const followup = bot.sessions.get('recommend-smoke')?.turn.recommendationResult;
  assert.equal(followup?.status, 'ok');
  assert.ok(followup.preferences.genres.includes('action'));
  assert.ok(followup.preferences.excludeGenres.includes('horror'));
  assert.ok(followup.movies.every(movie => movie.genreIds.includes(28) && !movie.genreIds.includes(27)));
  assert.equal(store.list('recommend-smoke').length, 0);
  assert.equal(store.pending('recommend-smoke'), undefined);
  console.log(JSON.stringify({ status: 'ok', tools: calls, recommended: result.movies.map(movie => ({ id: movie.id, title: movie.title })), followupCount: followup.movies.length, excludedHorror: true, ticketWrites: 0 }));
} finally { store.close(); }
