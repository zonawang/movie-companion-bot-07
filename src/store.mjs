import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}, '請使用真實日期 YYYY-MM-DD');
export const ticketSchema = z.object({
  movieTitle: z.string().trim().min(1).max(150).describe('使用者提供的片名'),
  watchedOn: date.describe('使用者提供的觀影日期，YYYY-MM-DD；未提供先詢問'),
  cinema: z.string().max(150).describe('影院；未提供用空字串'),
  companions: z.string().max(200).describe('跟誰看；未提供用空字串'),
  note: z.string().max(1500).describe('逐字引用使用者的心得；未提供用空字串，禁止改寫'),
}).strict();

export class Store {
  constructor(path = ':memory:', now = () => Date.now()) {
    this.now = now;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA journal_mode = DELETE;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY, actor TEXT NOT NULL, request TEXT NOT NULL,
        payload TEXT NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        UNIQUE(actor, request)
      );
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY, actor TEXT NOT NULL, payload TEXT NOT NULL, created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ticket_meta (
        id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ticket_requests (
        actor TEXT NOT NULL, request TEXT NOT NULL, ticket_id TEXT NOT NULL, request_hash TEXT,
        PRIMARY KEY(actor, request)
      );
      UPDATE jobs SET status='pending' WHERE status='processing';
    `);
    if (!this.db.prepare('PRAGMA table_info(ticket_requests)').all().some(column => column.name === 'request_hash')) this.db.exec('ALTER TABLE ticket_requests ADD COLUMN request_hash TEXT');
  }
  prepare(actor, request, input, originals) {
    const ticket = ticketSchema.parse(input);
    // 原始文字與逐字心得分開保留，不讓模型摘要蓋掉使用者紀錄。
    if (ticket.note && !originals.some(text => text.includes(ticket.note))) {
      throw new Error('心得必須逐字取自使用者訊息，請勿改寫。');
    }
    const previous = this.db.prepare('SELECT * FROM drafts WHERE actor=? AND request=?').get(actor, request);
    if (previous) return this.view(previous);
    this.db.prepare("UPDATE drafts SET status='cancelled' WHERE actor=? AND status='pending'").run(actor);
    const draft = { id: randomUUID(), actor, request, payload: JSON.stringify({ ...ticket, originalMessages: originals }), expires: this.now() + 10 * 60_000 };
    this.db.prepare('INSERT INTO drafts(id,actor,request,payload,expires) VALUES(?,?,?,?,?)')
      .run(draft.id, actor, request, draft.payload, draft.expires);
    return this.view({ ...draft, status: 'pending' });
  }
  view(row) { return row && { id: row.id, ...JSON.parse(row.payload), expires: row.expires, status: row.status }; }
  pending(actor) {
    return this.view(this.db.prepare("SELECT * FROM drafts WHERE actor=? AND status='pending' AND expires>? ORDER BY rowid DESC LIMIT 1").get(actor, this.now()));
  }
  decide(actor, id, decision) {
    if (!['confirm', 'cancel'].includes(decision)) return { status: 'invalid' };
    // 同一交易內檢查擁有者、期限與狀態；重複點擊不會新增第二張票根。
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT * FROM drafts WHERE id=? AND actor=?').get(id, actor);
      let result;
      if (!row) result = { status: 'not_found' };
      else if (row.status !== 'pending') result = { status: row.status };
      else if (row.expires <= this.now()) result = { status: 'expired' };
      else if (decision === 'cancel') {
        this.db.prepare("UPDATE drafts SET status='cancelled' WHERE id=?").run(id);
        result = { status: 'cancelled' };
      } else {
        this.db.prepare('INSERT OR IGNORE INTO tickets VALUES(?,?,?,?)').run(id, actor, row.payload, this.now());
        this.db.prepare("UPDATE drafts SET status='saved' WHERE id=?").run(id);
        result = { status: 'saved', ticket: this.view(row) };
      }
      this.db.exec('COMMIT');
      return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  list(actor, keyword = '') {
    return this.db.prepare('SELECT * FROM tickets WHERE actor=? ORDER BY created DESC LIMIT 200').all(actor)
      .map(row => ({ id: row.id, ...JSON.parse(row.payload) }))
      .filter(ticket => [ticket.movieTitle, ticket.note, ticket.companions, ticket.cinema, ticket.watchedOn]
        .some(value => value.toLowerCase().includes(keyword.toLowerCase())))
      .slice(0, 20);
  }
  shelfTicket(actor, id) {
    const row = this.db.prepare(`SELECT t.*, COALESCE(m.revision,1) AS revision, COALESCE(m.updated,t.created) AS updated
      FROM tickets t LEFT JOIN ticket_meta m ON m.id=t.id WHERE t.actor=? AND t.id=?`).get(actor, id);
    if (!row) return undefined;
    const value = JSON.parse(row.payload);
    return { id: row.id, movieTitle: value.movieTitle, watchedOn: value.watchedOn, cinema: value.cinema || '',
      companions: value.companions || '', note: value.note || '', movieId: value.movieId || null,
      posterPath: /^\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(value.posterPath || '') ? value.posterPath : null,
      revision: row.revision, createdAt: row.created, updatedAt: row.updated };
  }
  shelfList(actor, { query = '', year = '', page = 1, pageSize = 20 } = {}) {
    const terms = ['t.actor=?'], params = [actor];
    if (query) {
      terms.push(`(instr(lower(json_extract(t.payload,'$.movieTitle')),lower(?))>0
        OR instr(lower(json_extract(t.payload,'$.note')),lower(?))>0
        OR instr(lower(json_extract(t.payload,'$.cinema')),lower(?))>0
        OR instr(lower(json_extract(t.payload,'$.companions')),lower(?))>0)`);
      params.push(query, query, query, query);
    }
    if (year) { terms.push("substr(json_extract(t.payload,'$.watchedOn'),1,4)=?"); params.push(year); }
    const where = terms.join(' AND ');
    const total = this.db.prepare('SELECT count(*) AS total FROM tickets t WHERE ' + where).get(...params).total;
    const rows = this.db.prepare(`SELECT t.id FROM tickets t WHERE ${where}
      ORDER BY json_extract(t.payload,'$.watchedOn') DESC,t.created DESC,t.id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
    const currentYear = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric' }).format(new Date(this.now()));
    const stats = this.db.prepare(`SELECT count(*) AS total,
      COALESCE(sum(substr(json_extract(payload,'$.watchedOn'),1,4)=?),0) AS thisYear,
      COALESCE(sum(length(trim(COALESCE(json_extract(payload,'$.note'),'')))>0),0) AS withNotes
      FROM tickets WHERE actor=?`).get(currentYear, actor);
    const years = this.db.prepare(`SELECT DISTINCT substr(json_extract(payload,'$.watchedOn'),1,4) AS year
      FROM tickets WHERE actor=? ORDER BY year DESC`).all(actor).map(row => row.year);
    return { tickets: rows.map(row => this.shelfTicket(actor, row.id)), total, page, pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)), stats, years };
  }
  shelfCreate(actor, request, input) {
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.db.prepare('SELECT ticket_id,request_hash FROM ticket_requests WHERE actor=? AND request=?').get(actor, request);
      if (previous) {
        if (previous.request_hash && previous.request_hash !== requestHash) { this.db.exec('COMMIT'); return { status: 'conflict' }; }
        const ticket = this.shelfTicket(actor, previous.ticket_id);
        this.db.exec('COMMIT');
        return ticket ? { status: 'ok', ticket, repeated: true } : { status: 'conflict' };
      }
      const id = randomUUID(), created = this.now();
      this.db.prepare('INSERT INTO tickets(id,actor,payload,created) VALUES(?,?,?,?)').run(id, actor, JSON.stringify(input), created);
      this.db.prepare('INSERT INTO ticket_meta(id,revision,updated) VALUES(?,1,?)').run(id, created);
      this.db.prepare('INSERT INTO ticket_requests(actor,request,ticket_id,request_hash) VALUES(?,?,?,?)').run(actor, request, id, requestHash);
      const ticket = this.shelfTicket(actor, id);
      this.db.exec('COMMIT'); return { status: 'ok', ticket, repeated: false };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  shelfUpdate(actor, id, revision, input) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.shelfTicket(actor, id);
      if (!previous || previous.revision !== revision) {
        this.db.exec('COMMIT'); return { status: previous ? 'conflict' : 'not_found' };
      }
      const row = this.db.prepare('SELECT payload FROM tickets WHERE actor=? AND id=?').get(actor, id);
      // Preserve the original chat note as an audit field; display the user's latest edited note.
      this.db.prepare('UPDATE tickets SET payload=? WHERE actor=? AND id=?').run(JSON.stringify({ ...JSON.parse(row.payload), ...input }), actor, id);
      this.db.prepare(`INSERT INTO ticket_meta(id,revision,updated) VALUES(?,?,?)
        ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,updated=excluded.updated`).run(id, revision + 1, this.now());
      const ticket = this.shelfTicket(actor, id);
      this.db.exec('COMMIT'); return { status: 'ok', ticket };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  shelfDelete(actor, id, revision) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.shelfTicket(actor, id);
      if (!previous || previous.revision !== revision) {
        this.db.exec('COMMIT'); return { status: previous ? 'conflict' : 'not_found' };
      }
      this.db.prepare('DELETE FROM tickets WHERE actor=? AND id=?').run(actor, id);
      this.db.prepare('DELETE FROM ticket_meta WHERE id=?').run(id);
      // Remove confirmed chat drafts too, so a stale confirmation button cannot recreate a deleted ticket.
      this.db.prepare('DELETE FROM drafts WHERE actor=? AND id=?').run(actor, id);
      this.db.exec('COMMIT'); return { status: 'ok' };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  enqueue(event) {
    return this.db.prepare('INSERT OR IGNORE INTO jobs(id,payload,created) VALUES(?,?,?)')
      .run(event.webhookEventId, JSON.stringify(event), this.now()).changes > 0;
  }
  nextJob() {
    const row = this.db.prepare("SELECT * FROM jobs WHERE status='pending' ORDER BY rowid LIMIT 1").get();
    if (!row) return null;
    this.db.prepare("UPDATE jobs SET status='processing' WHERE id=?").run(row.id);
    return { id: row.id, event: JSON.parse(row.payload), created: row.created };
  }
  finishJob(id, status = 'done') {
    // 清除訊息與 reply token；保留事件 ID 作為去重依據。
    this.db.prepare("UPDATE jobs SET status=?, payload='{}' WHERE id=?").run(status, id);
  }
  close() { this.db.close(); }
}
