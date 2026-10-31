import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { BaseLlm } from '@google/adk';
import { CinemaCards } from '../src/cinema-cards.mjs';
import { MovieCardCatalog } from '../src/movie-card-catalog.mjs';
import { lineMessages } from '../src/line.mjs';
import { MovieCompanion } from '../src/agent.mjs';
import { MovieSource } from '../src/movies.mjs';
import { Store } from '../src/store.mjs';
import { createWebhookServer } from '../src/app.mjs';
const sourceUrl = 'https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001';
const result = () => ({ status: 'ok', cinema: '松菸誠品電影院', cinemaId: 'eslite-songyan', date: '2026-10-30', source: '誠品電影院官方時刻表', sourceUrl,
  fetchedAt: '2026-10-30T08:00:00Z', updatedAt: '2026-10-30 15:00（Asia/Taipei）', afterTime: '16:00',
  movies: Array.from({ length: 12 }, (_, i) => ({ title: `測試電影${i + 1}`, detailUrl: 'https://meet.eslite.com/tw/tc/artshow/test' + i, version: '數位', times: ['16:30', '18:00', '20:00', '22:00'] })) });
const allText = value => JSON.stringify(value);
const films = reply => reply.messages[1].contents.contents.filter(bubble => bubble.footer.contents.some(item => item.action?.data?.startsWith('flex:info:')));
const firstAction = reply => reply.messages[1].contents.contents[0].footer.contents[0].action.data;
const metadata = title => ({ id: 42, title, overview: '這是一段測試簡介。', url: 'https://www.themoviedb.org/movie/42', posterUrl: 'https://image.tmdb.org/t/p/w500/test.jpg' });
test('ten film cards per page, separate versions grouped and complete times recoverable without model text', async () => {
  const input = result(); input.movies.splice(1, 0, { ...input.movies[0], version: 'IMAX', times: ['18:20'] });
  const cards = new CinemaCards({ catalog: { lookup: async title => metadata(title) } });
  const first = await cards.present('A', [input]), flex = first.messages[1];
  assert.equal(flex.contents.contents[0].hero.url, metadata('測試電影1').posterUrl);
  assert.equal(flex.type, 'flex'); assert.equal(films(first).length, 10);
  assert.equal(flex.contents.contents.length, 11);
  assert.equal(flex.contents.contents.at(-1).footer.contents[0].action.label, '下一批電影 →');
  assert.match(first.text, /12 部/); assert.match(first.text, /TMDB/); assert.match(first.text, /2026-10-30/);
  assert.match(allText(flex.contents.contents[0]), /IMAX/); assert.match(allText(flex), /16:30/);
  assert.doesNotMatch(allText(flex.contents.contents[0]), /22:00/);
  assert.equal(lineMessages(first).length, 2);
  const more = flex.quickReply.items[0].action.data, second = await cards.handle('A', more);
  assert.match(allText(second.messages[1]), /測試電影11/); assert.doesNotMatch(allText(second.messages[1]), /測試電影1"/);
  assert.equal(films(second).length, 2);
  assert.equal(second.messages[1].contents.contents.length, 3);
  const back = await cards.handle('A', second.messages[1].quickReply.items[0].action.data);
  assert.equal(films(back).length, 10);
  assert.match(allText(back.messages[1].contents.contents[0]), /測試電影1/);
  const times = await cards.handle('A', flex.contents.contents[0].footer.contents[1].action.data);
  assert.match(times.text, /22:00/); assert.match(times.text, /IMAX/); assert.match(times.text, /官方時刻表/);
  assert.equal(input.movies.length, 13); // Presentation never mutates cached source data.
});
test('postbacks bind to the signed actor, expire and cannot address arbitrary films or URLs', async () => {
  let now = 0; const cards = new CinemaCards({ now: () => now }); const first = await cards.present('A', [result()]), data = firstAction(first);
  assert.match((await cards.handle('B', data)).text, /過期或不屬於/);
  assert.match((await cards.handle('A', data.replace(/:0$/, ':999'))).text, /過期或不屬於/);
  assert.match((await cards.handle('A', 'flex:info:https://evil.invalid:0')).text, /過期或不屬於/);
  now = 600001; assert.match((await cards.handle('A', data)).text, /過期或不屬於/);
  assert.equal(cards.snapshots.size, 0);
});
test('metadata outage and unavailable sources retain genuine showtimes and safe fallback art', async () => {
  const cards = new CinemaCards({ catalog: { lookup: async () => { throw new Error('offline'); } } });
  const input = result(); input.movies[0].detailUrl = 'https://evil.invalid/';
  const first = await cards.present('A', [input, { status: 'unavailable', cinema: '另一間影城', message: '來源暫時無法讀取', sourceUrl }]);
  assert.match(first.text, /來源暫時無法讀取/); assert.doesNotMatch(allText(first), /evil.invalid/);
  assert.equal(first.messages[1].contents.contents[0].hero.type, 'image');
  assert.match(first.messages[1].contents.contents[0].hero.url, /poster-fallback-v1\.jpg$/);
  assert.doesNotMatch(allText(first), /每一場電影|都是一段故事/);
  const info = await cards.handle('A', firstAction(first)); assert.match(info.text, /沒有這部電影的簡介/);
  assert.equal(await cards.present('A', [{ status: 'not_published', cinema: '誠品', date: '2026-11-01' }]), null);
});
test('TMDB artwork requires one exact title match, rejects ambiguity, adult works and foreign image URLs', async () => {
  const fetcher = rows => async url => { assert.equal(url.searchParams.get('include_adult'), 'false'); return Response.json({ results: rows, total_pages: 1 }); };
  const movie = { id: 42, title: '測試電影', overview: '簡介', poster_path: '/film.jpg' };
  const catalog = new MovieCardCatalog({ token: 'fixture', fetcher: fetcher([{ ...movie, title: '看似相似的片' }, movie]) });
  assert.equal((await catalog.lookup('測試電影')).id, 42);
  assert.equal(await new MovieCardCatalog({ token: 'fixture', fetcher: fetcher([movie, { ...movie, id: 43 }]) }).lookup('測試電影'), null);
  assert.equal(await new MovieCardCatalog({ token: 'fixture', fetcher: fetcher([{ ...movie, adult: true }]) }).lookup('測試電影'), null);
  const unsafe = await new MovieCardCatalog({ token: 'fixture', fetcher: fetcher([{ ...movie, poster_path: 'https://evil.invalid/p.jpg' }]) }).lookup('測試電影');
  assert.equal(unsafe.posterUrl, null);
});
test('metadata requests coalesce and cache misses briefly without affecting schedule cache', async () => {
  let count = 0, now = 0; const catalog = new MovieCardCatalog({ token: 'fixture', now: () => now, fetcher: async () => { count++; return Response.json({ results: [], total_pages: 1 }); } });
  await Promise.all([catalog.lookup('同名電影'), catalog.lookup('同名電影')]); assert.equal(count, 1);
  await catalog.lookup('同名電影'); assert.equal(count, 1);
  now = 30001; await catalog.lookup('同名電影'); assert.equal(count, 2);
});
class CinemaModel extends BaseLlm {
  constructor() { super({ model: 'cinema-flex-fixture' }); this.calls = 0; }
  async *generateContentAsync() {
    if (!this.calls++) yield { content: { role: 'model', parts: [{ functionCall: { name: 'cinema_schedule', args: { cinema: '誠品', date: '', afterTime: '', onlyUpcoming: true } } }] } };
    else yield { content: { role: 'model', parts: [{ text: '模型編造的電影與時間：不存在的電影 99:99' }] }, turnComplete: true };
  }
}
test('real ADK runner supplies actual cinema results to Flex; model cannot replace films or times', async () => {
  const store = new Store(), traces = [], cards = new CinemaCards();
  try {
    const bot = new MovieCompanion({ store, movies: new MovieSource(), model: new CinemaModel(), cards, cinema: { schedule: async () => result() }, trace: name => traces.push(name) });
    const answer = await bot.respond('A', '誠品現在有哪些電影好看？');
    assert.deepEqual(traces, ['cinema_schedule']); assert.equal(lineMessages(answer)[1].type, 'flex');
    assert.doesNotMatch(allText(answer), /不存在的電影|99:99/); assert.equal(store.list('A').length, 0);
  } finally { store.close(); }
});
test('signed Flex button events bypass the model, deduplicate, and cannot read another actor snapshot', async t => {
  const store = new Store(), cards = new CinemaCards(), first = await cards.present('A', [result()]), replies = [];
  const server = createWebhookServer({ secret: 'fixture', store, cards, bot: { respond: () => { throw Error('must not invoke model'); } }, reply: async (_, messages) => replies.push(messages) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const event = actor => ({ type: 'postback', webhookEventId: randomUUID(), replyToken: 'fixture-reply', source: { type: 'user', userId: actor }, postback: { data: firstAction(first) } });
  const post = async payload => { const raw = JSON.stringify({ events: [payload] }); const signature = createHmac('sha256', 'fixture').update(raw).digest('base64'); return fetch(base + '/webhook', { method: 'POST', headers: { 'x-line-signature': signature }, body: raw }); };
  const item = event('A'); assert.equal((await post(item)).status, 200); await post(item); await post(event('B'));
  await new Promise(resolve => setTimeout(resolve, 70)); assert.equal(replies.length, 2);
  assert.match(replies[0][0].text, /測試電影1/); assert.match(replies[1][0].text, /不屬於/);
  assert.equal(store.list('A').length, 0);
});
test('presentation failure falls back to the genuine cinema schedule instead of losing successful tool results', async () => {
  const store = new Store();
  try {
    const bot = new MovieCompanion({ store, movies: new MovieSource(), model: new CinemaModel(), cards: { present: async () => { throw Error('renderer failure'); } }, cinema: { schedule: async () => result() }, trace: () => {} });
    const answer = await bot.respond('A', '查誠品場次');
    assert.match(answer.text, /測試電影1/); assert.match(answer.text, /22:00/); assert.match(answer.text, /官方時刻表/);
    assert.doesNotMatch(answer.text, /AI 這次連線失敗/);
  } finally { store.close(); }
});
test('Flex remains within LINE size limits, including a separate draft confirmation message', async () => {
  const cards = new CinemaCards(), input = result();
  input.movies.forEach(movie => { movie.title = '長'.repeat(150); movie.version = '版本'.repeat(40); });
  const reply = await cards.present('A', [input]);
  for (const message of lineMessages(reply)) if (message.type === 'flex') assert.ok(Buffer.byteLength(JSON.stringify(message.contents)) < 50000);
  const withDraft = lineMessages({ ...reply, draft: { id: randomUUID(), movieTitle: '票根測試', watchedOn: '2026-10-30', note: '原始心得' } });
  assert.equal(withDraft.length, 3); assert.equal(withDraft[1].type, 'flex'); assert.match(withDraft[2].text, /原始心得/);
  assert.match(withDraft[2].quickReply.items[0].action.data, /^ticket:confirm:/);
});
test('end-of-carousel navigation handles first, middle and final batches with ten films retained', async () => {
  const cards = new CinemaCards(), input = result();
  input.movies = Array.from({ length: 21 }, (_, i) => ({ ...input.movies[0], title: `電影${i + 1}` }));
  const first = await cards.present('A', [input]), navigation = reply => reply.messages[1].contents.contents.at(-1);
  assert.equal(films(first).length, 10); assert.equal(first.messages[1].contents.contents.length, 11);
  const next = navigation(first).footer.contents[0].action;
  assert.equal(next.label, '下一批電影 →');
  assert.match((await cards.handle('other-actor', next.data)).text, /不屬於/);
  const middle = await cards.handle('A', next.data);
  assert.equal(films(middle).length, 10); assert.equal(navigation(middle).footer.contents.length, 2);
  const last = await cards.handle('A', navigation(middle).footer.contents[0].action.data);
  assert.equal(films(last).length, 1); assert.match(allText(navigation(last)), /已到最後一批/);
  assert.equal(navigation(last).footer.contents.length, 1);
  assert.equal(navigation(last).footer.contents[0].action.label, '← 上一批電影');
  const previous = await cards.handle('A', navigation(last).footer.contents[0].action.data);
  assert.equal(films(previous)[0].body.contents[1].text, '電影11');
});
test('single-batch results omit navigation and exact multiples never offer an empty next batch', async () => {
  const cards = new CinemaCards(), input = result(); input.movies = input.movies.slice(0, 10);
  const single = await cards.present('A', [input]);
  assert.equal(single.messages[1].contents.contents.length, 10); assert.doesNotMatch(allText(single), /下一批電影/);
  input.movies = Array.from({ length: 20 }, (_, i) => ({ ...input.movies[0], title: `電影${i + 1}` }));
  const first = await cards.present('A', [input]);
  const last = await cards.handle('A', first.messages[1].contents.contents.at(-1).footer.contents[0].action.data);
  assert.equal(films(last).length, 10); assert.equal(last.messages[1].contents.contents.length, 11);
  assert.doesNotMatch(allText(last.messages[1].contents.contents.at(-1)), /下一批電影/);
});
