import test from 'node:test';
import assert from 'node:assert/strict';
import { MovieSource, showtimeLinks } from '../src/movies.mjs';
test('示範模式明確標示虛構、找不到片名就回空清單、不產生場次', async () => {
  const movies = new MovieSource();
  assert.equal((await movies.movies()).status, 'demo');
  assert.deepEqual((await movies.movies('不存在的電影')).movies, []);
  assert.deepEqual((await movies.reviews(1)).reviews, []);
  assert.equal(showtimeLinks().status, 'links_only');
});
test('TMDB 地區、語系、認證、空結果與錯誤處理', async () => {
  const source = new MovieSource({ mode: 'tmdb', token: 'test-token', fetcher: async (url, init) => {
    assert.equal(url.hostname, 'api.themoviedb.org');
    assert.equal(url.searchParams.get('language'), 'zh-TW');
    assert.equal(url.searchParams.get('region'), 'TW');
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    return new Response(JSON.stringify({ results: [] }));
  } });
  assert.deepEqual((await source.movies()).movies, []);
  source.fetcher = async () => new Response('', { status: 429 });
  assert.equal((await source.movies()).status, 'unavailable');
  source.fetcher = async () => { throw new Error('timeout'); };
  assert.equal((await source.movies()).status, 'unavailable');
  source.fetcher = async () => new Response('{}');
  assert.equal((await source.movies()).status, 'unavailable');
});
