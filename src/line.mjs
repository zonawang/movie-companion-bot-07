import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const base = { webhookEventId: z.string().min(1), replyToken: z.string().min(1), source: z.object({ type: z.literal('user'), userId: z.string().min(1) }) };
const supportedEvent = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('message'), message: z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string().min(1).max(4000) }),
    z.object({ type: z.literal('location'), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
    z.object({ type: z.literal('image'), id: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/), contentProvider: z.object({ type: z.literal('line') }).optional() }),
  ]) }),
  z.object({ ...base, type: z.literal('postback'), postback: z.object({ data: z.string().max(200) }) }),
  z.object({ ...base, type: z.literal('follow') }),
]);
export function parseEvents(body) {
  if (!Array.isArray(body?.events)) throw new Error('缺少 events');
  // 一對一文字、定位、加好友與確認按鈕；不保留定位的標題／完整地址。
  return body.events.flatMap(event => {
    const parsed = supportedEvent.safeParse(event);
    return parsed.success ? [parsed.data] : [];
  });
}
export function verifySignature(raw, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  const expected = createHmac('sha256', secret).update(raw).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function draftText(draft) {
  return [
    '請確認這張票根（10 分鐘內有效）', `電影：${draft.movieTitle}`, `日期：${draft.watchedOn}`,
    `影院：${draft.cinema || '未填'}`, `同伴：${draft.companions || '未填'}`,
    `原始心得：${draft.note || '未填'}`, '確認前尚未存入收藏。',
  ].join('\n');
}
export function lineMessages(result) {
  if (Array.isArray(result.messages) && result.messages.length) {
    const messages = result.messages.slice(0, result.draft ? 4 : 5);
    if (result.draft) return [...messages, ...lineMessages({ text: '', draft: result.draft }).slice(-1)];
    return messages;
  }
  // Preserve source URLs on long nearby results. LINE accepts up to five messages.
  const chunks = [];
  let current = '';
  for (const line of result.text.split('\n')) {
    if (current.length + line.length + 1 > 3900 && current) { chunks.push(current); current = ''; }
    if (line.length > 3900) {
      for (let offset = 0; offset < line.length; offset += 3900) chunks.push(line.slice(offset, offset + 3900));
    } else current += (current ? '\n' : '') + line;
  }
  if (current) chunks.push(current);
  const textLimit = result.draft ? 4 : 5;
  const messages = (chunks.length ? chunks : ['這次沒有取得完整回覆。']).slice(0, textLimit).map(text => ({ type: 'text', text }));
  if (chunks.length > textLimit) messages.at(-1).text += '\n內容較多，請指定影城或片名縮小查詢。';
  if (result.draft) messages.push({
    type: 'text', text: draftText(result.draft),
    quickReply: { items: [
      { type: 'action', action: { type: 'postback', label: '確認儲存票根', data: `ticket:confirm:${result.draft.id}`, displayText: '確認儲存這張票根' } },
      { type: 'action', action: { type: 'postback', label: '取消', data: `ticket:cancel:${result.draft.id}`, displayText: '取消這張票根' } },
    ] },
  });
  if (result.actions?.length) messages.at(-1).quickReply = { items: result.actions.slice(0, 13).map(action => ({ type: 'action', action: { type: 'uri', label: action.label, uri: action.uri } })) };
  if (result.quickReplies?.length && !result.draft) messages.at(-1).quickReply = { items: result.quickReplies.slice(0, 13).map(action => ({ type: 'action', action })) };
  return messages;
}
export function decisionReply(store, actor, data) {
  const match = /^ticket:(confirm|cancel):([0-9a-f-]{36})$/.exec(data);
  if (!match) return { text: '這個按鈕無法辨識，請重新建立票根。' };
  const result = store.decide(actor, match[2], match[1]);
  return { text: ({
    saved: '這張票根已存進你的收藏夾，可以輸入「我的票匣」開啟私人收藏，或用同伴、片名查找。',
    cancelled: '這張票根已取消，沒有新增紀錄。',
    expired: '這張草稿已超過 10 分鐘，請重新告訴我觀影資訊。',
    not_found: '找不到屬於你的這張草稿，請重新建立。',
  })[result.status] || '這張草稿目前無法使用，請重新建立。' };
}
export async function replyToLine(token, replyToken, messages, fetcher = fetch) {
  const response = await fetcher('https://api.line.me/v2/bot/message/reply', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages }), signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`LINE reply HTTP ${response.status}`);
}
