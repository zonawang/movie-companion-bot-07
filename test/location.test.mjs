import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvents } from '../src/line.mjs';

const event = { type: 'message', webhookEventId: 'location-test', replyToken: 'test-token', source: { type: 'user', userId: 'alice' },
  message: { type: 'location', latitude: 25.0478, longitude: 121.517, title: '私人的家', address: '私人地址' } };
test('LINE 定位只保留有效座標，不把標題與地址存進事件佇列', () => {
  const [parsed] = parseEvents({ events: [event] });
  assert.deepEqual(parsed.message, { type: 'location', latitude: 25.0478, longitude: 121.517 });
  assert.doesNotMatch(JSON.stringify(parsed), /私人的家|私人地址/);
});
test('群組、缺欄位、字串座標與超出範圍定位不進佇列', () => {
  const events = [
    { ...event, source: { type: 'group', userId: 'alice' } },
    { ...event, message: { type: 'location', latitude: '25', longitude: 121 } },
    { ...event, message: { type: 'location', latitude: 91, longitude: 121 } },
    { ...event, message: { type: 'location', latitude: 25 } },
  ];
  assert.deepEqual(parseEvents({ events }), []);
});
