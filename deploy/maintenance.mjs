// Temporary, signed webhook receiver for migrating an existing SQLite bot.
// Run only during cutover; the normal worker resumes the queued events afterward.
import { createServer } from 'node:http';
import { Store } from '/opt/movie-bot/app/src/store.mjs';
import { parseEvents, verifySignature } from '/opt/movie-bot/app/src/line.mjs';
const store = new Store(process.env.SQLITE_PATH);
const server = createServer(async (request, response) => {
  const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
  if (request.method === 'GET' && request.url === '/health') return send(200, { status: 'maintenance' });
  if (request.method !== 'POST' || request.url !== '/webhook') return send(404, { error: 'not_found' });
  try {
    const chunks = []; let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 1_048_576) return send(413, { error: 'body_too_large' });
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    if (!verifySignature(body, request.headers['x-line-signature'], process.env.LINE_CHANNEL_SECRET)) return send(401, { error: 'invalid_signature' });
    let events;
    try { events = parseEvents(JSON.parse(body.toString('utf8'))); }
    catch { return send(400, { error: 'invalid_payload' }); }
    for (const event of events) store.enqueue(event);
    send(200, { ok: true });
  } catch { if (!response.headersSent) send(500, { error: 'internal_error' }); }
});
server.listen(3003, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => { store.close(); process.exit(0); }));
