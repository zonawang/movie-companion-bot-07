import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Store } from '../src/store.mjs';
import { createWebhookServer } from '../src/app.mjs';
import { lineMessages } from '../src/line.mjs';

const sign = text => createHmac('sha256', 'test-secret').update(text).digest('base64');
const event = { type: 'message', webhookEventId: 'evt1', replyToken: 'test-reply', source: { type: 'user', userId: 'alice' }, message: { type: 'text', text: '最近有什麼電影' } };
async function fixture(t, bot) {
  const store = new Store(), replies = [];
  const server = createWebhookServer({ secret: 'test-secret', store, bot, reply: async (...args) => { replies.push(args); }, log: () => {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  return { store, replies, url, post: async (payload, signature) => {
    const body = JSON.stringify(payload);
    return fetch(url, { method: 'POST', headers: { 'x-line-signature': signature ?? sign(body) }, body });
  } };
}
test('錯誤簽章不能執行 agent；空 events 可供 LINE Verify', async t => {
  let called = false;
  const app = await fixture(t, { respond: async () => { called = true; } });
  assert.equal((await app.post({ events: [event] }, 'bad')).status, 401);
  assert.equal(called, false);
  assert.equal((await app.post({ events: [] })).status, 200);
  assert.equal((await app.post({ nope: true })).status, 400);
});
test('先回 200 再執行 agent、重送事件去重、私人資料不在群組執行', async t => {
  let resolveAnswer, called = 0;
  const answer = new Promise(resolve => { resolveAnswer = resolve; });
  const app = await fixture(t, { respond: async (actor, text, id) => {
    called++; assert.equal(actor, 'alice'); assert.equal(id, 'evt1');
    await answer; return { text: '這是示範電影' };
  } });
  assert.equal((await app.post({ events: [event] })).status, 200);
  assert.equal(app.replies.length, 0);
  await app.post({ events: [event, { ...event, webhookEventId: 'group', source: { type: 'group', userId: 'alice' } }] });
  resolveAnswer();
  for (let i = 0; i < 100 && !app.replies.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(called, 1); assert.equal(app.replies.length, 1);
});
test('確認按鈕只能儲存點擊者自己的草稿，按鈕不經過 AI', async t => {
  const app = await fixture(t, { respond: () => { throw new Error('不應呼叫 AI'); } });
  const draft = app.store.prepare('alice', 'draft-event', { movieTitle: '月台上的貓', watchedOn: '2026-10-25', cinema: '', companions: '', note: '' }, ['月台上的貓']);
  assert.match(lineMessages({ text: '請確認', draft })[1].quickReply.items[0].action.data, /^ticket:confirm:/);
  await app.post({ events: [{ ...event, type: 'postback', postback: { data: `ticket:confirm:${draft.id}` } }] });
  for (let i = 0; i < 100 && !app.replies.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(app.store.list('alice').length, 1);
});
test('關於入口提供 TMDB 來源聲明，不呼叫模型或讀取私人票根', async t => {
  const app = await fixture(t, { respond: () => { throw new Error('關於頁不需要 AI'); } });
  await app.post({ events: [{ ...event, message: { type: 'text', text: '關於' } }] });
  for (let i = 0; i < 100 && !app.replies.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(app.replies.length, 1);
  assert.match(app.replies[0][1][0].text, /not endorsed or certified by TMDB/);
});

test('LINE 定位綁定第四個參數，處理後清空事件內容，重送定位不重查', async t => {
  let called = 0;
  const app = await fixture(t, { respond: async (actor, text, id, context) => {
    called++; assert.equal(actor, 'alice'); assert.equal(id, 'location-evt');
    assert.doesNotMatch(text, /25\.0478|121\.517|私人/);
    assert.deepEqual(context.location, { latitude: 25.0478, longitude: 121.517 });
    return { text: '附近影院清單' };
  } });
  const location = { ...event, webhookEventId: 'location-evt', message: { type: 'location', latitude: 25.0478, longitude: 121.517, address: '私人地址' } };
  await app.post({ events: [location] });
  for (let i = 0; i < 100 && !app.replies.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  await app.post({ events: [location] });
  assert.equal(called, 1);
  assert.equal(app.store.db.prepare('SELECT payload FROM jobs WHERE id=?').get('location-evt').payload, '{}');
});
test('清除位置指令直接執行，不經過模型', async t => {
  let actor;
  const app = await fixture(t, { respond: () => { throw new Error('不應呼叫模型'); }, clearLocation: user => { actor = user; return { text: '已清除位置' }; } });
  await app.post({ events: [{ ...event, message: { type: 'text', text: '清除位置' } }] });
  for (let i = 0; i < 100 && !app.replies.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(actor, 'alice'); assert.match(app.replies[0][1][0].text, /已清除位置/);
});
