import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { BaseLlm } from '@google/adk';
import { MovieNavigation, richMenuDefinition, menuFeatures } from '../src/navigation.mjs';
import { RichMenuClient, planRichMenu } from '../src/richmenu.mjs';
import { Store } from '../src/store.mjs';
import { MovieCompanion } from '../src/agent.mjs';
import { MovieSource } from '../src/movies.mjs';
import { lineMessages } from '../src/line.mjs';
import { createWebhookServer } from '../src/app.mjs';

const navigation = new MovieNavigation({ liffUrl: 'https://miniapp.line.me/2012222034-AVyO2nk3' });
const image = readFileSync(new URL('../assets/richmenu.png', import.meta.url));
class NavigationModel extends BaseLlm {
  constructor(feature) { super({ model: 'navigation-fixture' }); this.feature = feature; this.calls = 0; this.response = null; }
  async *generateContentAsync(request) {
    if (this.calls++ % 2 === 0) yield { content: { role: 'model', parts: [{ functionCall: { name: 'open_movie_feature', args: { feature: this.feature } } }] } };
    else {
      this.response = request.contents.flatMap(value => value.parts || []).findLast(part => part.functionResponse)?.functionResponse;
      yield { content: { role: 'model', parts: [{ text: '模型任意網址 https://untrusted.invalid' }] }, turnComplete: true };
    }
  }
}
test('four menu areas cover the image exactly, and authenticated MINI App actions have no identity parameters', () => {
  const menu = richMenuDefinition(navigation); assert.equal(menu.areas.length, 4);
  for (let i = 0; i < 4; i++) {
    const { bounds } = menu.areas[i]; assert.equal(bounds.width * bounds.height, 1250 * 843);
    assert.equal(bounds.x, i % 2 * 1250); assert.equal(bounds.y, Math.floor(i / 2) * 843);
  }
  assert.equal(menu.areas[0].action.data, 'menu:movies'); assert.equal(menu.areas[2].action.data, 'menu:nearby');
  assert.equal(menu.areas[1].action.uri, navigation.liffUrl);
  assert.equal(menu.areas[3].action.data, 'menu:recommend');
  assert.equal(navigation.open('new_ticket').actions[0].uri, navigation.liffUrl + '?action=new');
  assert.throws(() => new MovieNavigation({ liffUrl: 'https://attacker.invalid/?userId=other' }));
  assert.throws(() => richMenuDefinition(new MovieNavigation()));
});
for (const feature of menuFeatures) test(`real ADK Runner invokes open_movie_feature(${feature}), returns trusted UI and never writes tickets`, async () => {
  const store = new Store(), model = new NavigationModel(feature), traces = [];
  try {
    const bot = new MovieCompanion({ store, movies: new MovieSource(), model, navigation, trace: name => traces.push(name) });
    const result = await bot.respond('actor-A', navigation.prompt(feature));
    assert.deepEqual(traces, ['open_movie_feature']); assert.equal(model.response.response.feature, feature);
    assert.equal(store.list('actor-A').length, 0); assert.equal(store.pending('actor-A'), undefined);
    assert.doesNotMatch(result.text, /untrusted|模型任意/);
    if (feature === 'nearby') assert.equal(lineMessages(result)[0].quickReply.items[0].action.type, 'location');
    if (feature === 'new_ticket') assert.match(result.actions[0].uri, /\?action=new$/);
  } finally { store.close(); }
});
for (const feature of ['nearby', 'recommend']) test(`signed ${feature} postbacks run through ADK, preserve actor and deduplicate events`, async t => {
  const store = new Store(), calls = [], model = new NavigationModel(feature);
  const bot = new MovieCompanion({ store, movies: new MovieSource(), model, navigation, trace: name => calls.push(name) });
  const replies = []; const server = createWebhookServer({ secret: 'fixture-secret', store, bot, navigation, reply: async (token, messages) => replies.push(messages) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const event = { type: 'postback', webhookEventId: randomUUID(), replyToken: 'fixture-reply', source: { type: 'user', userId: 'actor-A' }, postback: { data: 'menu:' + feature } };
  const raw = JSON.stringify({ events: [event] }); const signature = createHmac('sha256', 'fixture-secret').update(raw).digest('base64');
  assert.equal((await fetch(base + '/webhook', { method: 'POST', body: raw })).status, 401);
  for (let i = 0; i < 2; i++) assert.equal((await fetch(base + '/webhook', { method: 'POST', headers: { 'x-line-signature': signature }, body: raw })).status, 200);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(calls, ['open_movie_feature']); assert.equal(replies.length, 1);
  assert.equal(replies[0][0].quickReply.items[0].action.type, feature === 'nearby' ? 'location' : 'message');
  assert.equal(store.list('actor-A').length, 0);
});

function fakeLine({ failUpload = false, initialDefault = 'richmenu-old' } = {}) {
  const menus = [], images = new Map(), requests = []; let current = initialDefault, count = 0;
  const response = (value, status = 200) => new Response(value instanceof Buffer ? value : JSON.stringify(value), { status });
  return { menus, images, requests, get current() { return current; }, set failUpload(value) { failUpload = value; }, fetcher: async (url, options) => {
    const path = new URL(url).pathname, method = options.method; requests.push([method, path]);
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    if (path === '/v2/bot/richmenu/validate') return response({});
    if (path === '/v2/bot/richmenu/list') return response({ richmenus: menus });
    if (path === '/v2/bot/user/all/richmenu' && method === 'GET') return current ? response({ richMenuId: current }) : response({}, 404);
    if (path === '/v2/bot/user/all/richmenu' && method === 'DELETE') { current = null; return response({}); }
    if (path === '/v2/bot/richmenu' && method === 'POST') { const id = `richmenu-new${++count}`; menus.push({ ...JSON.parse(options.body), richMenuId: id }); return response({ richMenuId: id }); }
    const content = /\/richmenu\/(richmenu-[^/]+)\/content$/.exec(path);
    if (content) {
      assert.equal(new URL(url).hostname, 'api-data.line.me');
      if (method === 'POST') { if (failUpload) return response({}, 500); images.set(content[1], options.body); return response({}); }
      return images.has(content[1]) ? response(images.get(content[1])) : response({}, 404);
    }
    if (path.startsWith('/v2/bot/user/all/richmenu/') && method === 'POST') { current = path.split('/').at(-1); return response({}); }
    throw new Error('unexpected request');
  } };
}
test('installer validates image, switches default only after upload verification, retries reuse and rollback restores previous menu', async () => {
  const line = fakeLine(); const client = new RichMenuClient({ token: 'fixture-token', fetcher: line.fetcher });
  const plan = planRichMenu(navigation, image); let state;
  const first = await client.apply({ plan, image, checkpoint: async value => { state = value; } });
  assert.equal(first.previousDefault, 'richmenu-old'); assert.equal(first.stage, 'active'); assert.equal(line.current, first.newRichMenuId);
  const second = await client.apply({ plan, image, state }); assert.equal(second.reused, true); assert.equal(second.previousDefault, 'richmenu-old'); assert.equal(line.menus.length, 1);
  assert.equal((await client.rollback(state)).restored, 'richmenu-old'); assert.equal(line.current, 'richmenu-old');
  assert.throws(() => planRichMenu(navigation, Buffer.from('not-a-png')));
});
test('upload failure never changes the default menu and a subsequent run resumes the same created menu', async () => {
  const line = fakeLine({ failUpload: true }), client = new RichMenuClient({ token: 'fixture-token', fetcher: line.fetcher });
  const plan = planRichMenu(navigation, image); let state;
  await assert.rejects(client.apply({ plan, image, checkpoint: async value => { state = value; } }), /HTTP 500/);
  assert.equal(line.current, 'richmenu-old'); assert.equal(state.stage, 'created');
  assert.equal(line.requests.some(([method,path])=>method==='POST'&&path.startsWith('/v2/bot/user/all/richmenu/')),false);
  line.failUpload = false;
  const resumed = await client.apply({ plan, image, state }); assert.equal(resumed.reused,true); assert.equal(line.menus.length,1); assert.equal(resumed.previousDefault,'richmenu-old');
});
test('rollback removes only this installation default when no API default existed before', async () => {
  const line = fakeLine({ initialDefault: null }), client = new RichMenuClient({ token: 'fixture-token', fetcher: line.fetcher });
  const state = await client.apply({ plan: planRichMenu(navigation,image), image });
  assert.equal(state.previousDefault,null); assert.equal((await client.rollback(state)).restored,null);
  assert.equal(line.menus.length,1,'installed menu image is retained for later recovery');
});
