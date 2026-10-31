// Live Gemini + Google ADK multimodal ticket photo smoke test using in-memory SQLite store.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { MovieCompanion } from '../src/agent.mjs';
import { validImagePart, ticketPhotoPrompt } from '../src/ticket-photo.mjs';
import { lineMessages } from '../src/line.mjs';

const settings = config(process.env);
const store = new Store();
const calls = [];
const bot = new MovieCompanion({
  store,
  movies: new MovieSource({ mode: 'demo' }),
  model: settings.model,
  trace: name => calls.push(name)
});

try {
  // 1. Complete ticket photo -> ADK multimodal LlmAgent calls prepare_ticket
  const actor1 = 'ticket-photo-smoke-actor-1';
  const fullTicketBytes = readFileSync(resolve('assets/sample-ticket.png'));
  const fullImage = { mimeType: 'image/png', data: fullTicketBytes.toString('base64') };
  assert.equal(validImagePart(fullImage), true);
  const firstTurn = await bot.respond(actor1, ticketPhotoPrompt, undefined, { image: fullImage });

  assert.ok(calls.includes('prepare_ticket'), 'ADK must call prepare_ticket on complete ticket photo');
  const firstDraft = store.pending(actor1);
  assert.ok(firstDraft, 'Pending draft must be created in SQLite');
  assert.match(firstDraft.movieTitle, /進擊的鼓手/);
  assert.equal(firstDraft.watchedOn, '2026-10-31');
  assert.match(firstDraft.cinema, /松菸誠品電影院|誠品電影院/);
  assert.equal(firstDraft.companions, '');
  assert.equal(firstDraft.note, '');
  assert.equal(store.list(actor1).length, 0, 'Unconfirmed draft must not write to confirmed tickets');
  const firstMessages = lineMessages(firstTurn);
  assert.equal(firstMessages.at(-1).quickReply?.items?.[0]?.action?.label, '確認儲存票根');

  // Verify raw image inlineData was scrubbed from InMemoryRunner session history
  const session1 = bot.sessions.get(actor1);
  const events1 = session1?.runner?.sessionService?.sessions?.[session1.runner.appName]?.[actor1]?.[session1.id]?.events || [];
  const remainingInlineData = events1.flatMap(e => e?.content?.parts || []).filter(p => p?.inlineData);
  assert.equal(remainingInlineData.length, 0, 'Session inlineData must be scrubbed after image turn');

  // 2. Follow-up text turn in the same ADK session updates companions & verbatim note
  await bot.respond(actor1, '我是跟小安一起看的，心得是最後一段鼓聲太震撼了');
  const updatedDraft = store.pending(actor1);
  assert.ok(updatedDraft, 'Updated pending draft must exist');
  assert.notEqual(updatedDraft.id, firstDraft.id, 'Previous draft should be replaced by a new pending draft');
  assert.match(updatedDraft.movieTitle, /進擊的鼓手/);
  assert.equal(updatedDraft.watchedOn, '2026-10-31');
  assert.match(updatedDraft.companions, /小安/);
  assert.equal(updatedDraft.note, '最後一段鼓聲太震撼了');

  // Confirm draft into SQLite
  const confirmed = store.decide(actor1, updatedDraft.id, 'confirm');
  assert.equal(confirmed.status, 'saved');
  assert.equal(store.list(actor1).length, 1);

  // 3. Incomplete ticket photo (missing date) -> ADK must NOT call prepare_ticket, asks for missing date
  const actor2 = 'ticket-photo-smoke-actor-2';
  const beforeCount = calls.filter(name => name === 'prepare_ticket').length;
  const missingDateBytes = readFileSync(resolve('assets/sample-ticket-missing-date.png'));
  const missingDateImage = { mimeType: 'image/png', data: missingDateBytes.toString('base64') };
  assert.equal(validImagePart(missingDateImage), true);
  const missingTurn = await bot.respond(actor2, ticketPhotoPrompt, undefined, { image: missingDateImage });
  const afterCount = calls.filter(name => name === 'prepare_ticket').length;

  assert.equal(afterCount, beforeCount, 'ADK must not call prepare_ticket when watchedOn date is missing from ticket image');
  assert.equal(store.pending(actor2), undefined);
  assert.match(missingTurn.text, /日期/);

  console.log(JSON.stringify({
    status: 'ok',
    tools: calls,
    firstDraft: {
      movieTitle: firstDraft.movieTitle,
      watchedOn: firstDraft.watchedOn,
      cinema: firstDraft.cinema,
      companions: firstDraft.companions,
      note: firstDraft.note
    },
    updatedDraft: {
      movieTitle: updatedDraft.movieTitle,
      watchedOn: updatedDraft.watchedOn,
      cinema: updatedDraft.cinema,
      companions: updatedDraft.companions,
      note: updatedDraft.note
    },
    confirmedTickets: store.list(actor1).length,
    missingDateReply: missingTurn.text,
    scrubbedInlineDataCount: remainingInlineData.length
  }, null, 2));
} finally {
  store.close();
}
