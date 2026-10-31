import test from 'node:test';
import assert from 'node:assert/strict';
import { tmdbAttribution, aboutReply } from '../src/attribution.mjs';

test('來源只保留 HTTPS TMDB 連結，排除偽裝網域與腳本 URL', () => {
  const result = tmdbAttribution([
    'https://www.themoviedb.org/movie/27205', 'https://www.themoviedb.org/movie/27205',
    'https://www.themoviedb.org.evil.test/movie/1', 'javascript:alert(1)', undefined,
  ]);
  assert.equal(result.match(/movie\/27205/g).length, 1);
  assert.doesNotMatch(result, /evil\.test|javascript:/);
  assert.match(aboutReply().text, /not endorsed or certified by TMDB/);
});
