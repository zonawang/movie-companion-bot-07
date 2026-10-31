import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';

const input = { movieTitle: '月台上的貓', watchedOn: '2026-10-25', cinema: '', companions: '小安', note: '配樂很好聽' };
test('確認前不寫票根、確認後依使用者隔離、重複點擊不重複存檔', () => {
  const store = new Store();
  try {
    const draft = store.prepare('alice', 'event-1', input, ['配樂很好聽']);
    assert.equal(store.list('alice').length, 0);
    assert.equal(store.decide('bob', draft.id, 'confirm').status, 'not_found');
    assert.equal(store.decide('alice', draft.id, 'confirm').status, 'saved');
    assert.equal(store.decide('alice', draft.id, 'confirm').status, 'saved');
    assert.equal(store.list('alice', '小安').length, 1);
    assert.equal(store.list('bob').length, 0);
    assert.deepEqual(store.list('alice')[0].originalMessages, ['配樂很好聽']);
  } finally { store.close(); }
});
test('過期與取消草稿都不能儲存', () => {
  let now = 1000;
  const store = new Store(':memory:', () => now);
  try {
    const first = store.prepare('alice', 'a', input, ['配樂很好聽']);
    now += 600_001;
    assert.equal(store.decide('alice', first.id, 'confirm').status, 'expired');
    const second = store.prepare('alice', 'b', input, ['配樂很好聽']);
    store.decide('alice', second.id, 'cancel');
    assert.equal(store.decide('alice', second.id, 'confirm').status, 'cancelled');
    assert.equal(store.list('alice').length, 0);
  } finally { store.close(); }
});
test('拒絕改寫心得和不存在的日期，同一事件只產生一張草稿', () => {
  const store = new Store();
  try {
    assert.throws(() => store.prepare('alice', 'a', { ...input, note: '年度最佳神作' }, ['配樂很好聽']));
    assert.throws(() => store.prepare('alice', 'b', { ...input, watchedOn: '2026-02-30' }, ['配樂很好聽']));
    const a = store.prepare('alice', 'c', input, ['配樂很好聽']);
    assert.equal(store.prepare('alice', 'c', input, ['配樂很好聽']).id, a.id);
  } finally { store.close(); }
});
test('票根重啟後保留，工作佇列依 event ID 去重', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movie-bot-'));
  let store;
  try {
    store = new Store(join(dir, 'test.sqlite'));
    const draft = store.prepare('alice', 'a', input, ['配樂很好聽']);
    store.decide('alice', draft.id, 'confirm');
    assert.equal(store.enqueue({ webhookEventId: 'e1' }), true);
    assert.equal(store.enqueue({ webhookEventId: 'e1' }), false);
    store.nextJob();
    store.close(); store = new Store(join(dir, 'test.sqlite'));
    assert.equal(store.list('alice').length, 1);
    assert.equal(store.nextJob().id, 'e1');
    store.finishJob('e1');
    assert.equal(store.nextJob(), null);
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
