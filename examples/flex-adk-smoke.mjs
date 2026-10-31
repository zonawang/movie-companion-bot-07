// Live Gemini/ADK, cinema websites, TMDB; in-memory fixture actor. No user message delivery or production ticket writes.
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { CinemaSource, taipeiDateTime } from '../src/cinema.mjs';
import { MovieCompanion } from '../src/agent.mjs';
import { CinemaCards } from '../src/cinema-cards.mjs';
import { MovieCardCatalog } from '../src/movie-card-catalog.mjs';
import { lineMessages } from '../src/line.mjs';
import { flexFixture } from './flex-fixture.mjs';
const settings = config(process.env), store = new Store(), calls = [];
const cinema = new CinemaSource(), cards = new CinemaCards({ catalog: new MovieCardCatalog({ token: settings.tmdbToken }) });
const actor = 'flex-adk-smoke-fixture';
const bot = new MovieCompanion({ store, movies: new MovieSource({ mode: settings.mode, token: settings.tmdbToken }), model: settings.model, cinema, cards, trace: name => calls.push(name) });
async function validate(result, label) {
  const messages = lineMessages(result); assert.ok(messages.length <= 5);
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    const response = await fetch('https://api.line.me/v2/bot/message/validate/reply', { method: 'POST', headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }), signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, 'LINE validation failed: ' + label + ' ' + await response.text());
  }
  console.log(JSON.stringify({ check: label, messageTypes: messages.map(message => message.type), status: 'ok' }));
}
try {
  const exact = await bot.respond(actor, '誠品現在有哪些電影好看？');
  assert.ok(calls.includes('cinema_schedule'), 'The real ADK must query this cinema, not the nationwide movie list');
  assert.ok(!calls.includes('recommend_movies') && !calls.includes('now_playing'), 'Cinema-specific query must remain grounded in the cinema schedule');
  await validate(exact, 'real-current-query');
  const current = taipeiDateTime().date;
  const page = await cinema.eslite.page();
  const dates = [...new Set(page.movies.flatMap(movie => movie.days.map(day => day.date)))].filter(date => date >= current).sort();
  let liveCards = 0;
  if (dates.length) {
    const dated = await bot.respond('flex-dated-smoke', `請查松菸誠品 ${dates[0]} 公告的完整電影片單與場次，包含所有公告時間，不限制現在之後，也不要加入其他影城或全台上映候選。`);
    await validate(dated, 'real-announced-schedule');
    const flex = dated.messages?.find(message => message.type === 'flex');
    if (flex) {
      liveCards = flex.contents.contents.length;
      const item = flex.contents.contents[0];
      await validate(await cards.handle('flex-dated-smoke', item.footer.contents[0].action.data), 'real-film-introduction');
      await validate(await cards.handle('flex-dated-smoke', item.footer.contents[1].action.data), 'real-complete-showtimes');
      const next = flex.quickReply?.items.find(item => item.action.label === '看更多電影');
      if (next) await validate(await cards.handle('flex-dated-smoke', next.action.data), 'real-next-page');
    }
  }
  // Always verify card schema/paging even when the real cinema has no remaining published sessions.
  const fixture = await cards.present(actor, [flexFixture]);
  await validate(fixture, 'fixture-card-schema');
  await validate(await cards.handle(actor, fixture.messages[1].quickReply.items[0].action.data), 'fixture-next-page-schema');
  assert.equal(store.list(actor).length, 0); assert.equal(store.pending(actor), undefined);
  console.log(JSON.stringify({ status: 'ok', tools: calls, liveCards, announcedDates: dates, ticketWrites: 0 }));
} finally { store.close(); }
