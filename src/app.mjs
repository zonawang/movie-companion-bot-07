import { createServer } from 'node:http';
import { parseEvents, verifySignature, lineMessages, decisionReply } from './line.mjs';
import { aboutReply } from './attribution.mjs';
import { featureForText } from './navigation.mjs';
import { ticketPhotoPrompt } from './ticket-photo.mjs';

export function createWebhookServer({ secret, store, bot, reply, fetchImage, shelf, navigation, cards, log = console.error }) {
  let running = false;
  let stopping = false;
  const drain = async () => {
    if (running || stopping) return;
    running = true;
    try {
      let job;
      while (!stopping && (job = store.nextJob())) {
        try {
          // 失效的 reply token 不重送，也不在重新啟動後執行舊 AI 任務。
          if (Date.now() - job.created > 50_000) { store.finishJob(job.id, 'expired'); continue; }
          const event = job.event, actor = event.source.userId;
          let result;
          if (event.type === 'follow') result = { text: '我是你的電影夥伴！可傳送 LINE 位置，或說「台北車站附近有什麼電影？」查附近影院。輸入「清除位置」清除定位與暫存對話。也可以問「信義威秀今晚有哪些片？」、「比較信義和西門威秀今晚場次」，也可查秀泰、國賓、新光、in89 等，問「台南有哪些影城？」或「影城清單下一頁」。部分場館只有圖片入口。還能查電影簡介、評論，或直接拍下電影票根照片／輸入文字建立待確認草稿，確認後才儲存。輸入「我的票匣」可開啟私人收藏、編輯心得；輸入「關於」可查看資料來源。' };
          else if (event.type === 'postback' && ['menu:movies', 'menu:nearby', 'menu:recommend'].includes(event.postback.data) && navigation) result = await bot.respond(actor, navigation.prompt(event.postback.data.slice(5)), job.id);
          else if (event.type === 'postback' && event.postback.data.startsWith('flex:') && cards) result = await cards.handle(actor, event.postback.data);
          else if (event.type === 'postback') result = decisionReply(store, actor, event.postback.data);
          else if (event.message.type === 'location') result = await bot.respond(actor,
            '請找這個定位附近三公里內的電影院，並列出今天尚未開演的電影與場次。', job.id,
            { location: { latitude: event.message.latitude, longitude: event.message.longitude } });
          else if (event.message.type === 'image') {
            if (!fetchImage) result = { text: '目前尚未啟用票根圖片讀取功能，請直接用文字告訴我片名、觀影日期與心得。' };
            else {
              const fetched = await fetchImage(event.message.id);
              result = fetched.status === 'ok'
                ? await bot.respond(actor, ticketPhotoPrompt, job.id, { image: fetched.image })
                : { text: fetched.message };
            }
          }
          else if (navigation && featureForText(event.message.text) && (navigation.liffUrl || !['shelf', 'new_ticket'].includes(featureForText(event.message.text)))) result = await bot.respond(actor, navigation.prompt(featureForText(event.message.text)), job.id);
          else if (shelf && ['我的票匣', '票匣', '開啟票匣'].includes(event.message.text.trim())) result = shelf.entry(actor);
          else if (event.message.text.trim() === '清除位置') result = bot.clearLocation(actor);
          else if (['關於', '資料來源', 'about'].includes(event.message.text.trim().toLowerCase())) result = aboutReply();
          else result = await bot.respond(actor, event.message.text, job.id);
          await reply(event.replyToken, lineMessages(result));
          store.finishJob(job.id);
        } catch {
          store.finishJob(job.id, 'failed');
          log('[LINE] 回覆失敗；請檢查設定、網路與 reply token 時效。事件不會自動重新執行。');
        }
      }
    } finally { running = false; }
  };
  const server = createServer(async (req, res) => {
    if (shelf && await shelf.handle(req, res)) return;
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok', app: 'movie-companion-bot' });
    if (req.method !== 'POST' || req.url !== '/webhook') return send(404, { error: 'not_found' });
    const chunks = []; let length = 0;
    try {
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 1_048_576) { send(413, { error: 'body_too_large' }); return; }
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks);
      if (!verifySignature(raw, req.headers['x-line-signature'], secret)) return send(401, { error: 'invalid_signature' });
      let events;
      try { events = parseEvents(JSON.parse(raw.toString('utf8'))); }
      catch { return send(400, { error: 'invalid_payload' }); }
      for (const event of events) store.enqueue(event);
      send(200, { ok: true });
      // 先落盤並回 200，再呼叫 ADK / LINE；空事件可供 LINE Verify 使用。
      setImmediate(() => { void drain().catch(() => log('[worker] 工作佇列處理失敗')); });
    } catch { if (!res.headersSent) send(500, { error: 'internal_error' }); }
  });
  server.requestTimeout = 10_000;
  const timer = setInterval(() => { void drain().catch(() => log('[worker] 工作佇列處理失敗')); }, 1000);
  timer.unref();
  server.on('close', () => { stopping = true; clearInterval(timer); });
  return server;
}
