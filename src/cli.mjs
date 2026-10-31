import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { config } from './config.mjs';
import { Store } from './store.mjs';
import { MovieSource } from './movies.mjs';
import { MovieCompanion } from './agent.mjs';
import { draftText, decisionReply } from './line.mjs';
import { aboutReply } from './attribution.mjs';
import { detectImageMimeType, ticketPhotoPrompt } from './ticket-photo.mjs';

let store, rl;
try {
  const settings = config();
  store = new Store(settings.database);
  const bot = new MovieCompanion({ store, model: settings.model, movies: new MovieSource({ mode: settings.mode, token: settings.tmdbToken }) });
  rl = createInterface({ input: stdin, output: stdout });
  console.log(`ADK 電影夥伴（${settings.mode} 模式）。exit 結束；/photo <圖片路徑> 傳送票根照片；/confirm 確認票根；/cancel 取消。`);
  while (true) {
    const input = (await rl.question('\n你：')).trim();
    if (input === 'exit') break;
    if (!input) continue;
    if (input === '清除位置') { console.log(bot.clearLocation('local-user').text); continue; }
    if (['關於', '資料來源', 'about'].includes(input.toLowerCase())) { console.log(aboutReply().text); continue; }
    if (input === '/confirm' || input === '/cancel') {
      const draft = store.pending('local-user');
      console.log(draft ? decisionReply(store, 'local-user', `ticket:${input === '/confirm' ? 'confirm' : 'cancel'}:${draft.id}`).text : '目前沒有有效的待確認草稿。');
      continue;
    }
    if (input.startsWith('/photo ')) {
      try {
        const buffer = readFileSync(input.slice(7).trim());
        const mimeType = detectImageMimeType(buffer) || 'application/octet-stream';
        const result = await bot.respond('local-user', ticketPhotoPrompt, undefined, { image: { mimeType, data: buffer.toString('base64') } });
        console.log(`\n電影夥伴：${result.text}`);
        if (result.draft) console.log(`\n${draftText(result.draft)}\n輸入 /confirm 或 /cancel。`);
      } catch (error) { console.log(`讀取圖片失敗：${error.message}`); }
      continue;
    }
    const result = await bot.respond('local-user', input);
    console.log(`\n電影夥伴：${result.text}`);
    if (result.draft) console.log(`\n${draftText(result.draft)}\n輸入 /confirm 或 /cancel。`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { rl?.close(); store?.close(); }
