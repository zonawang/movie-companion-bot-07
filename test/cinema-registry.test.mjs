import test from 'node:test';
import assert from 'node:assert/strict';
import { cinemas, findCinema, matchCinemas, listCinemas, formatCinemaList } from '../src/cinema-registry.mjs';
import { CinemaSource } from '../src/cinema.mjs';

test('全台清單涵蓋北中南東，MUVIE 可獨立篩選且不混入誠品', () => {
  const all = listCinemas({ brand: '威秀', city: '全台' });
  assert.equal(all.cinemas.length, 22);
  assert.deepEqual([...new Set(all.cinemas.map(cinema => cinema.city))], ['台北', '新北', '桃園', '新竹', '苗栗', '台中', '台南', '高雄', '花蓮']);
  assert.ok(all.cinemas.every(cinema => cinema.brand === '威秀'));
  const muvie = listCinemas({ brand: 'MUVIE CINEMAS' }).cinemas;
  assert.deepEqual(muvie.map(cinema => cinema.city), ['台北', '台中']);
  const text = formatCinemaList(all);
  for (const cinema of all.cinemas) assert.ok(text.includes(cinema.name));
  assert.ok(text.length < 4000);
});

test('縣市、雙北與地區篩選不把新北當台北，或把新竹縣當新竹市', () => {
  assert.equal(listCinemas({ brand: '威秀', city: '臺北市' }).cinemas.length, 5);
  assert.equal(listCinemas({ brand: '威秀', city: '新北市' }).cinemas.length, 4);
  assert.equal(listCinemas({ brand: '威秀', city: '雙北' }).cinemas.length, 9);
  assert.equal(listCinemas({ brand: '威秀', city: '新竹縣' }).cinemas.length, 0);
  assert.equal(listCinemas({ brand: '威秀', city: '新竹市' }).cinemas.length, 2);
  assert.equal(listCinemas({ brand: '威秀', city: '苗栗縣' }).cinemas[0].id, 'vieshow-toufen');
  assert.equal(listCinemas({ brand: '威秀', city: '花蓮縣' }).cinemas[0].id, 'vieshow-hualien');
  assert.equal(listCinemas({ brand: '威秀', city: '不存在城市' }).cinemas.length, 0);
});

test('有多個候選的名稱先詢問分館，不讀取任意一家場次', async () => {
  let calls = 0;
  const source = new CinemaSource({ fetcher: async () => { calls++; throw new Error('不可呼叫'); } });
  assert.equal(findCinema('新竹威秀'), undefined);
  assert.equal(findCinema('大遠百威秀'), undefined);
  assert.equal(matchCinemas('大遠百威秀影城').length, 5);
  for (const [name, count] of [['新竹威秀', 2], ['台南威秀', 3], ['台中威秀', 3], ['大遠百威秀', 5], ['全台威秀', 22]]) {
    const result = await source.schedule({ cinema: name });
    assert.equal(result.status, 'choose_cinema');
    assert.equal(result.choices.length, count);
  }
  assert.equal(calls, 0);
});

test('保留舊別名、來源舊稱與 MUVIE 官方新名稱，且不混淆不同城市大遠百', () => {
  for (const [alias, id] of [
    ['信義威秀影城', 'vieshow-xinyi'], ['威秀西門', 'vieshow-ximen'], ['京站威秀', 'vieshow-qsquare'],
    ['林口三井威秀', 'vieshow-linkou'], ['高雄威秀', 'vieshow-kaohsiung-fe21'], ['花蓮威秀', 'vieshow-hualien'],
    ['老虎城威秀', 'vieshow-tigercity'], ['MUVIE CINEMAS 台中TIGER CITY', 'vieshow-tigercity'],
    ['松仁威秀', 'vieshow-songren'], ['台中IFG威秀', 'vieshow-ifg'], ['南紡威秀', 'vieshow-tsmall'],
    ['台中大遠百威秀', 'vieshow-taichung-fe21'], ['新竹大遠百威秀', 'vieshow-hsinchu-fe21'],
  ]) assert.equal(findCinema(alias)?.id, id, alias);
});

test('分館 ID、第三方來源代碼與官方入口皆唯一，避免一館複製成另一館', () => {
  const rows = cinemas.filter(cinema => cinema.brand === '威秀');
  for (const key of ['id', 'theaterCode', 'sourceUrl', 'bookingUrl']) assert.equal(new Set(rows.map(cinema => cinema[key])).size, rows.length, key);
  for (const cinema of rows) {
    const source = new URL(cinema.sourceUrl), official = new URL(cinema.bookingUrl);
    assert.equal(source.hostname, 'www.atmovies.com.tw');
    assert.equal(source.pathname, `/showtime/${cinema.theaterCode}/${cinema.areaCode}/`);
    assert.equal(official.hostname, 'www.vscinemas.com.tw');
    assert.equal(official.pathname, cinema.subBrand === 'MUVIE' ? '/theater/detail2.aspx' : '/theater/detail.aspx');
  }
});
