import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { BaseLlm } from '@google/adk';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { MovieCompanion } from '../src/agent.mjs';
import { createWebhookServer } from '../src/app.mjs';
import {
  MAX_IMAGE_BYTES,
  ticketPhotoPrompt,
  detectImageMimeType,
  validImagePart,
  fetchLineImage,
} from '../src/ticket-photo.mjs';

// 1x1 透明 PNG
const samplePngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const samplePngPart = {
  mimeType: 'image/png',
  data: samplePngBuffer.toString('base64'),
};
const sampleJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const sampleWebpBuffer = Buffer.from('52494646240000005745425056503820', 'hex');

test('detectImageMimeType 與 validImagePart 驗證真實圖片檔頭、格式與大小上限', () => {
  assert.equal(detectImageMimeType(samplePngBuffer), 'image/png');
  assert.equal(detectImageMimeType(sampleJpegBuffer), 'image/jpeg');
  assert.equal(detectImageMimeType(sampleWebpBuffer), 'image/webp');
  assert.equal(detectImageMimeType(Buffer.from('<html>not an image</html>')), null);

  assert.equal(validImagePart(samplePngPart), true);
  assert.equal(validImagePart({ mimeType: 'image/jpeg', data: samplePngPart.data }), false);
  assert.equal(validImagePart({ mimeType: 'application/pdf', data: samplePngPart.data }), false);
  assert.equal(validImagePart({ mimeType: 'image/png', data: 'not-base64!' }), false);
});

test('fetchLineImage 驗證訊息 ID、狀態碼、檔案大小上限與檔案魔數', async () => {
  assert.equal((await fetchLineImage('token', '../bad-id')).status, 'invalid');

  const okRes = await fetchLineImage('token', 'msg123', async (url, init) => {
    assert.equal(url, 'https://api-data.line.me/v2/bot/message/msg123/content');
    assert.equal(init.headers.Authorization, 'Bearer token');
    return new Response(samplePngBuffer, { status: 200, headers: { 'content-type': 'image/png' } });
  });
  assert.equal(okRes.status, 'ok');
  assert.equal(okRes.image.mimeType, 'image/png');
  assert.equal(okRes.image.data, samplePngPart.data);

  const htmlRes = await fetchLineImage('token', 'msg123', async () =>
    new Response(Buffer.from('<!doctype html><html></html>'), { status: 200, headers: { 'content-type': 'text/html' } }),
  );
  assert.equal(htmlRes.status, 'unsupported_type');

  const hugeHeaderRes = await fetchLineImage('token', 'msg123', async () =>
    new Response(samplePngBuffer, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(MAX_IMAGE_BYTES + 10) } }),
  );
  assert.equal(hugeHeaderRes.status, 'too_large');

  const failRes = await fetchLineImage('token', 'msg123', async () => new Response(null, { status: 404 }));
  assert.equal(failRes.status, 'unavailable');
});

test('Google ADK 接收票根圖片 inlineData 並呼叫 prepare_ticket 建立草稿，完成後立即清除記憶體圖檔並支援後續文字補心得', async () => {
  class MultimodalTicketModel extends BaseLlm {
    constructor() {
      super({ model: 'multimodal-ticket-test' });
      this.calls = 0;
      this.requests = [];
    }
    async *generateContentAsync(request) {
      this.calls++;
      this.requests.push(StructuredCloneSafe(request.contents));
      if (this.calls === 1) {
        // 第一輪第一次呼叫：必須收到 inlineData 與提示文字
        const userParts = request.contents.at(-1).parts;
        assert.equal(userParts[0].inlineData?.mimeType, 'image/png');
        assert.equal(userParts[0].inlineData?.data, samplePngPart.data);
        assert.match(userParts[1].text, /電影票根/);
        yield {
          content: {
            role: 'model',
            parts: [{
              functionCall: {
                name: 'prepare_ticket',
                args: {
                  movieTitle: '進擊的鼓手',
                  watchedOn: '2026-10-31',
                  cinema: '松菸誠品電影院',
                  companions: '',
                  note: '',
                },
              },
            }],
          },
        };
      } else if (this.calls === 2) {
        yield {
          content: {
            role: 'model',
            parts: [{ text: '已經從票根照片幫你整理好《進擊的鼓手》草稿！你可以直接點確認儲存，或接著告訴我跟誰看與心得。' }],
          },
          turnComplete: true,
        };
      } else if (this.calls === 3) {
        // 第二輪文字追問：確認第一輪的 inlineData 已被清除，但保留工具呼叫上下文
        const allInlineData = request.contents.flatMap(c => c.parts || []).filter(p => p.inlineData);
        assert.equal(allInlineData.length, 0, '圖片原始 base64 不應保留在後續回合的對話記憶體中');
        yield {
          content: {
            role: 'model',
            parts: [{
              functionCall: {
                name: 'prepare_ticket',
                args: {
                  movieTitle: '進擊的鼓手',
                  watchedOn: '2026-10-31',
                  cinema: '松菸誠品電影院',
                  companions: '小安',
                  note: '最後一段鼓聲太震撼了',
                },
              },
            }],
          },
        };
      } else {
        yield {
          content: {
            role: 'model',
            parts: [{ text: '已替你補上同伴小安與心得，請點下方確認儲存票根！' }],
          },
          turnComplete: true,
        };
      }
    }
  }
  function StructuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
  }

  const store = new Store(), traces = [], model = new MultimodalTicketModel();
  try {
    const bot = new MovieCompanion({ store, model, movies: new MovieSource(), trace: name => traces.push(name) });
    const first = await bot.respond('alice', ticketPhotoPrompt, 'req-photo-1', { image: samplePngPart });
    assert.ok(first.draft);
    assert.equal(first.draft.movieTitle, '進擊的鼓手');
    assert.equal(first.draft.watchedOn, '2026-10-31');
    assert.equal(first.draft.cinema, '松菸誠品電影院');
    assert.equal(first.draft.companions, '');
    assert.equal(first.draft.note, '');
    assert.equal(store.list('alice').length, 0, '確認前不可直接寫入正式票根表');

    // 第二輪：使用者用文字補上同伴與心得
    const second = await bot.respond('alice', '我是跟小安去看的，心得是最後一段鼓聲太震撼了', 'req-text-2');
    assert.ok(second.draft);
    assert.equal(second.draft.companions, '小安');
    assert.equal(second.draft.note, '最後一段鼓聲太震撼了');
    assert.deepEqual(traces, ['prepare_ticket', 'prepare_ticket']);

    // 使用者按下確認後才存入 SQLite
    const saved = store.decide('alice', second.draft.id, 'confirm');
    assert.equal(saved.status, 'saved');
    const tickets = store.list('alice');
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].movieTitle, '進擊的鼓手');
    assert.equal(tickets[0].cinema, '松菸誠品電影院');
    assert.equal(tickets[0].companions, '小安');
    assert.equal(tickets[0].note, '最後一段鼓聲太震撼了');
  } finally {
    store.close();
  }
});

test('傳送票根圖片的當輪不可把票面印刷字或前一輪對話當成個人心得', async () => {
  class HallucinatingNoteModel extends BaseLlm {
    constructor() { super({ model: 'hallucinate-note' }); this.calls = 0; }
    async *generateContentAsync() {
      this.calls++;
      if (this.calls === 1) {
        yield { content: { role: 'model', parts: [{ text: '收到你的文字' }] }, turnComplete: true };
      } else if (this.calls === 2) {
        yield {
          content: {
            role: 'model',
            parts: [{
              functionCall: {
                name: 'prepare_ticket',
                args: {
                  movieTitle: '月台上的貓',
                  watchedOn: '2026-10-31',
                  cinema: '信義威秀',
                  companions: '',
                  note: '配樂很好聽',
                },
              },
            }],
          },
        };
      } else {
        yield { content: { role: 'model', parts: [{ text: '請先確認票根資訊' }] }, turnComplete: true };
      }
    }
  }
  const store = new Store();
  try {
    const bot = new MovieCompanion({ store, model: new HallucinatingNoteModel(), movies: new MovieSource(), trace: () => {} });
    await bot.respond('alice', '配樂很好聽', 'req-1');
    const photoTurn = await bot.respond('alice', ticketPhotoPrompt, 'req-2', { image: samplePngPart });
    assert.equal(photoTurn.draft, null, '圖片回合禁止帶入非空心得建立草稿');
    assert.equal(store.pending('alice'), undefined);
  } finally {
    store.close();
  }
});

test('LINE Webhook 驗簽接收圖片訊息、下載圖片交給 ADK 並附確認按鈕，外部圖片網址不處理', async t => {
  const store = new Store(), replies = [], fetchedIds = [];
  let receivedContext;
  const bot = {
    respond: async (actor, text, id, context) => {
      assert.equal(actor, 'alice');
      assert.equal(id, 'img-evt-1');
      assert.equal(text, ticketPhotoPrompt);
      receivedContext = context;
      const draft = store.prepare('alice', id, { movieTitle: '進擊的鼓手', watchedOn: '2026-10-31', cinema: '松菸誠品電影院', companions: '', note: '' }, []);
      return { text: '已從票根照片建立草稿', draft };
    },
  };
  const server = createWebhookServer({
    secret: 'test-secret',
    store,
    bot,
    fetchImage: async id => {
      fetchedIds.push(id);
      return { status: 'ok', image: samplePngPart };
    },
    reply: async (...args) => { replies.push(args); },
    log: () => {},
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });

  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  const sign = body => createHmac('sha256', 'test-secret').update(body).digest('base64');
  const post = async payload => {
    const body = JSON.stringify(payload);
    return fetch(url, { method: 'POST', headers: { 'x-line-signature': sign(body) }, body });
  };

  const lineImageEvent = {
    type: 'message',
    webhookEventId: 'img-evt-1',
    replyToken: 'reply-img-1',
    source: { type: 'user', userId: 'alice' },
    message: { type: 'image', id: 'line_msg_999', contentProvider: { type: 'line' } },
  };
  const externalImageEvent = {
    type: 'message',
    webhookEventId: 'img-evt-ext',
    replyToken: 'reply-img-ext',
    source: { type: 'user', userId: 'alice' },
    message: { type: 'image', id: 'ext_999', contentProvider: { type: 'external', originalContentUrl: 'https://evil.example/a.png' } },
  };

  const res = await post({ events: [lineImageEvent, externalImageEvent] });
  assert.equal(res.status, 200);
  for (let i = 0; i < 100 && !replies.length; i++) await new Promise(resolve => setTimeout(resolve, 10));

  assert.deepEqual(fetchedIds, ['line_msg_999']);
  assert.deepEqual(receivedContext?.image, samplePngPart);
  assert.equal(replies.length, 1);
  assert.match(replies[0][1][1].text, /請確認這張票根/);
  assert.match(replies[0][1][1].quickReply.items[0].action.data, /^ticket:confirm:/);
  assert.equal(store.db.prepare('SELECT payload FROM jobs WHERE id=?').get('img-evt-1').payload, '{}');
});
