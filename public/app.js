const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const demo = new URLSearchParams(location.search).get('preview') === '1';
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
let csrf = '', page = 1, pages = 1, selected = null, editing = null, movieId = null, requestKey = '', saving = false, listController, movieController, queryTimer, movieTimer, toastTimer;
let newTicketOpened = false;
const wantsNewTicket = () => new URLSearchParams(location.search).get('action') === 'new';
let demoTickets = [
  ['月台上的貓', '2026-09-20', '週末影城', '小安', '最後那班列車離開的時候，突然有點捨不得。\n喜歡電影裡什麼都沒說，卻又什麼都說了的片刻。'],
  ['星期天的放映室', '2026-08-12', '小巷電影院', '自己', '一個人看電影，也是一種很好的約會。散場後慢慢走回家，天還亮著。'],
  ['雨停之前', '2026-07-03', '城市影城', '阿哲', '有些告別不用說出口，聽見雨聲就懂了。'],
  ['去海邊的那一天', '2026-05-16', '海岸影城', '大學朋友', '看完只想訂一張去海邊的車票。很高興今天是和你們一起看。'],
  ['留給明天的信', '2025-12-24', '家裡', '家人', '把平凡的日子過好，好像就是最重要的事。'],
  ['微光練習曲', '2025-10-18', '光點小劇場', '自己', ''],
].map((v, i) => ({ id: `demo-${i}`, movieTitle: v[0], watchedOn: v[1], cinema: v[2], companions: v[3], note: v[4], movieId: null, posterPath: null, revision: 1, createdAt: i, updatedAt: i }));

async function api(path, options = {}) {
  const method = options.method || 'GET';
  const response = await fetch('/api' + path, { ...options, credentials: 'same-origin', headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {}), ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  let value; try { value = await response.json(); } catch { throw new Error('連線暫時中斷，請稍後再試。'); }
  if (!response.ok) { const error = new Error(value.error || '暫時無法完成操作。'); error.status = response.status; throw error; }
  return value;
}
function notice(text) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500); }
function cover(ticket, index = 0) {
  const node = el('div', 'cover fallback tone-' + index % 6);
  if (/^\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(ticket.posterPath || '')) {
    const image = el('img'); image.src = 'https://image.tmdb.org/t/p/w500' + ticket.posterPath; image.alt = ''; image.loading = 'lazy'; image.addEventListener('error', () => { image.remove(); node.append(el('span', 'cover-title', ticket.movieTitle)); }, { once: true }); node.append(image);
  } else { node.append(el('span', 'fallback-art'), el('span', 'cover-title', ticket.movieTitle), el('span', 'cover-number', 'A FILM TO REMEMBER')); }
  return node;
}
function gate(message, canLogin = false) {
  $('gate').hidden = false; $('shelf').hidden = true; $('gate-message').textContent = message;
  $('login').hidden = !canLogin; $('line-link').hidden = false; $('preview-link').hidden = false; $('logout').hidden = true;
  const liffUrl = liffConfig?.liffUrl || '';
  $('liff-link').hidden = !/^https:\/\/(?:miniapp|liff)\.line\.me\/\d+-[A-Za-z0-9]+$/.test(liffUrl);
  if (!$('liff-link').hidden) $('liff-link').href = liffUrl;
}
async function enter(session) {
  csrf = session.csrfToken || ''; $('user-name').textContent = demo ? '電影旅人 / DEMO' : session.user.displayName;
  $('logout').hidden = demo; $('gate').hidden = true; $('shelf').hidden = false;
  await load();
  if (wantsNewTicket() && !newTicketOpened && !$('shelf').hidden) {
    newTicketOpened = true;
    const url = new URL(location.href); url.searchParams.delete('action');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    openEditor();
  }
}
function demoList() {
  const query = $('query').value.trim().toLowerCase(), year = $('year').value;
  const tickets = demoTickets.filter(ticket => (!query || [ticket.movieTitle, ticket.note, ticket.cinema, ticket.companions].some(v => v.toLowerCase().includes(query))) && (!year || ticket.watchedOn.startsWith(year))).sort((a, b) => b.watchedOn.localeCompare(a.watchedOn));
  return { tickets: tickets.slice((page - 1) * 20, page * 20), total: tickets.length, pageCount: Math.max(1, Math.ceil(tickets.length / 20)), years: [...new Set(demoTickets.map(t => t.watchedOn.slice(0, 4)))].sort().reverse(), stats: { total: demoTickets.length, thisYear: demoTickets.filter(t => t.watchedOn.startsWith(today.slice(0, 4))).length, withNotes: demoTickets.filter(t => t.note.trim()).length } };
}
async function load() {
  listController?.abort(); const controller = new AbortController(); listController = controller;
  $('list-status').textContent = '正在整理你的收藏…'; $('retry').hidden = true;
  try {
    const value = demo ? demoList() : await api('/tickets?' + new URLSearchParams({ query: $('query').value.trim(), year: $('year').value, page }), { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (page > value.pageCount) { page = value.pageCount; return load(); }
    $('list-status').textContent = ''; pages = value.pageCount;
    $('total-stat').textContent = value.stats.total; $('year-stat').textContent = value.stats.thisYear; $('notes-stat').textContent = value.stats.withNotes;
    $('result-count').textContent = `${value.total} 張票根`;
    const currentYear = $('year').value;
    $('year').replaceChildren(new Option('所有年份', ''), ...[...new Set([...value.years, ...(currentYear ? [currentYear] : [])])].sort().reverse().map(year => new Option(year + ' 年', year)));
    $('year').value = currentYear;
    $('grid').replaceChildren(...value.tickets.map((ticket, index) => {
      const card = el('button', 'ticket'); card.type = 'button'; card.setAttribute('aria-label', `查看 ${ticket.movieTitle}，${ticket.watchedOn}`);
      const info = el('div', 'ticket-info'); const meta = el('div', 'ticket-meta');
      meta.append(el('span', '', ticket.cinema || '某個放映的地方'), el('span', '', ticket.companions || '未記錄同伴'));
      info.append(el('div', 'ticket-date', ticket.watchedOn.replaceAll('-', ' . ')), el('h3', '', ticket.movieTitle), el('p', 'ticket-note', ticket.note || '還沒寫下心得，留一點空白給回憶。'), meta);
      card.append(cover(ticket, index), info); card.addEventListener('click', () => openDetail(ticket.id)); return card;
    }));
    $('empty').hidden = value.total > 0;
    $('empty-title').textContent = value.stats.total ? '暫時找不到這段回憶' : '第一張票根，從這裡開始';
    $('empty-description').textContent = value.stats.total ? '試試其他關鍵字，或切換年份看看。' : '點一下「新增票根」，記下最近看過的一部電影吧。';
    $('pagination').hidden = pages <= 1; $('page-label').textContent = `${page} / ${pages}`; $('prev').disabled = page <= 1; $('next').disabled = page >= pages;
  } catch (error) {
    if (error.name === 'AbortError') return;
    $('list-status').textContent = error.message; $('retry').hidden = false;
    if (error.status === 401) gate(error.message);
  }
}
async function openDetail(id) {
  try {
    selected = demo ? demoTickets.find(t => t.id === id) : (await api('/tickets/' + id)).ticket;
    if (!selected) throw new Error('找不到這張票根。');
    $('detail-error').textContent = ''; $('detail-content').replaceChildren();
    const hero = el('div', 'detail-hero'), text = el('div');
    const title = el('h2', '', selected.movieTitle); title.id = 'detail-title';
    text.append(el('span', 'eyebrow', 'MY MOVIE TICKET'), title, el('p', '', selected.watchedOn.replaceAll('-', ' . '))); hero.append(cover(selected), text);
    const fields = el('dl', 'detail-fields');
    for (const [label, value] of [['放映的地方', selected.cinema], ['一起看的人', selected.companions]]) { const group = el('div'); group.append(el('dt', '', label), el('dd', '', value || '未填寫')); fields.append(group); }
    $('detail-content').append(hero, fields, el('div', 'detail-note', selected.note || '還沒有心得。把散場後的感受留在這裡吧。'));
    if (selected.movieId) { const source = el('a', 'detail-source', '查看 TMDB 電影資料 ↗'); source.href = `https://www.themoviedb.org/movie/${selected.movieId}`; source.target = '_blank'; source.rel = 'noreferrer'; $('detail-content').append(source); }
    $('detail').showModal();
  } catch (error) { notice(error.message); }
}
function closeEditor() { movieController?.abort(); clearTimeout(movieTimer); $('editor').close(); }
function openEditor(ticket = null) {
  editing = ticket; movieId = ticket?.movieId || null; requestKey = crypto.randomUUID();
  $('ticket-form').reset(); $('form-error').textContent = ''; $('suggestions').replaceChildren();
  $('editor-title').textContent = ticket ? '編輯這段觀影回憶' : '新增一張票根';
  for (const name of ['movieTitle', 'watchedOn', 'cinema', 'companions', 'note']) $('ticket-form').elements[name].value = ticket?.[name] || (name === 'watchedOn' ? today : '');
  $('watched-on').max = today; $('clear-movie').hidden = !movieId;
  $('movie-help').textContent = movieId ? '已選擇電影，儲存時會更新電影名稱與海報。' : '可選擇搜尋結果帶入海報，或直接記下片名。';
  $('note-count').textContent = `${$('note').value.length} / 1500`; $('editor').showModal();
}
function clearMovie() { movieId = null; $('clear-movie').hidden = true; $('movie-help').textContent = '目前為手動填寫，會保留片名並使用票匣封面。'; }
async function searchMovies() {
  const query = $('movie-title').value.trim(); movieController?.abort(); const controller = new AbortController(); movieController = controller;
  $('suggestions').replaceChildren(); if (query.length < 2 || demo) return;
  try {
    const result = await api('/movies?' + new URLSearchParams({ query }), { signal: controller.signal });
    if (controller.signal.aborted || !$('editor').open || query !== $('movie-title').value.trim()) return;
    $('movie-help').textContent = !result.available ? '電影搜尋暫時無法使用，仍可手動填寫片名並儲存。' : result.movies.length ? '選擇一部電影帶入海報；也可以直接儲存手動片名。' : '沒有找到相符電影，仍可直接儲存手動片名。';
    for (const movie of result.movies) {
      const button = el('button', 'suggestion'); button.type = 'button'; button.append(el('span', '', movie.title), el('small', '', movie.releaseDate?.slice(0, 4) || '年份未提供'));
      button.addEventListener('click', () => { clearTimeout(movieTimer); movieController?.abort(); movieId = movie.id; $('movie-title').value = movie.title; $('clear-movie').hidden = false; $('movie-help').textContent = '已選擇電影，儲存時會一併帶入海報。'; $('suggestions').replaceChildren(); }); $('suggestions').append(button);
    }
  } catch (error) { if (error.name !== 'AbortError') $('movie-help').textContent = '電影搜尋暫時無法連線，仍可手動填寫片名。'; }
}
async function saveTicket(event) {
  event.preventDefault(); if (saving) return;
  const value = Object.fromEntries(new FormData($('ticket-form'))); value.movieTitle = value.movieTitle.trim(); value.movieId = movieId;
  if (!value.movieTitle) { $('form-error').textContent = '請填寫電影名稱。'; return; }
  if (value.watchedOn > today) { $('form-error').textContent = '觀影日期不能晚於今天。'; return; }
  saving = true; $('save').disabled = true; $('save').textContent = '儲存中…'; $('form-error').textContent = '';
  // Keep inputs and the idempotency key on failure, so a retry cannot create duplicate tickets.
  try {
    if (demo) {
      if (editing) { const index = demoTickets.findIndex(t => t.id === editing.id); demoTickets[index] = { ...editing, ...value, revision: editing.revision + 1 }; }
      else demoTickets.push({ ...value, id: crypto.randomUUID(), revision: 1, posterPath: null });
    } else await api(editing ? '/tickets/' + editing.id : '/tickets', { method: editing ? 'PATCH' : 'POST', headers: editing ? {} : { 'Idempotency-Key': requestKey }, body: editing ? { ...value, revision: editing.revision } : value });
    closeEditor(); $('detail').close(); page = 1; await load(); notice(demo ? '已更新示範票匣（不會儲存）' : '這段回憶，已經收好了。');
  } catch (error) { $('form-error').textContent = error.message; }
  finally { saving = false; $('save').disabled = false; $('save').textContent = '儲存票根'; }
}
async function deleteTicket() {
  $('confirm-delete').disabled = true; $('delete-error').textContent = '';
  try {
    if (demo) demoTickets = demoTickets.filter(t => t.id !== selected.id);
    else await api('/tickets/' + selected.id, { method: 'DELETE', body: { revision: selected.revision } });
    $('delete-dialog').close(); $('detail').close(); selected = null; await load(); notice(demo ? '已從示範票匣移除' : '票根已刪除');
  } catch (error) { $('delete-error').textContent = error.message; }
  finally { $('confirm-delete').disabled = false; }
}
let liffConfig, sdkLoading, sdkInitializing, loginInFlight = false;
function loginError(message) { const error = new Error(message); error.userMessage = true; return error; }
async function bounded(promise, message, milliseconds = 15000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(loginError(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function loadLineSdk() {
  if (window.liff) return;
  if (!sdkLoading) {
    const script = document.createElement('script'); script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    sdkLoading = bounded(new Promise((resolve, reject) => {
      script.onload = () => window.liff ? resolve() : reject(loginError('LINE 登入元件載入失敗，請再試一次。'));
      script.onerror = () => reject(loginError('LINE 登入元件載入失敗，請檢查連線後再試。'));
      document.head.append(script);
    }), '載入 LINE 登入逾時，請檢查連線後再試。').catch(error => { script.remove(); sdkLoading = null; throw error; });
  }
  await sdkLoading;
}
async function lineLogin() {
  if (loginInFlight) return;
  loginInFlight = true; $('login').disabled = true; $('login').textContent = '登入中…';
  $('gate-message').textContent = '正在確認你的 LINE 身分…';
  try {
    await loadLineSdk();
    if (!sdkInitializing) sdkInitializing = window.liff.init({ liffId: liffConfig.liffId }).catch(error => { sdkInitializing = null; throw error; });
    await bounded(sdkInitializing, 'LINE 回應逾時，請重新在 LINE 開啟票匣後再試。', 20000);
    if (!window.liff.isLoggedIn()) {
      if (window.liff.isInClient?.()) throw loginError('LINE 授權尚未完成，請點「重新在 LINE 開啟」後同意授權。');
      $('gate-message').textContent = '正在前往 LINE 授權頁面…';
      const redirect = new URL('/tickets/', location.origin);
      if (wantsNewTicket()) redirect.searchParams.set('action', 'new');
      window.liff.login({ redirectUri: redirect.href }); return;
    }
    const idToken = window.liff.getIDToken(); let credential;
    if (idToken) credential = { idToken };
    else {
      // Some MINI Apps issue only an access token. Request profile consent if needed; the backend verifies identity independently.
      let permission;
      if (window.liff.permission?.query) {
        try { permission = await bounded(window.liff.permission.query('profile'), '確認 LINE 授權逾時，請稍後重試。'); } catch { /* The server still checks the granted scopes. */ }
      }
      if (permission?.state === 'unavailable') throw loginError('目前尚未開放登入所需的 LINE 授權，請聯絡票匣管理者。');
      if (permission?.state === 'prompt' && window.liff.getProfile) {
        $('gate-message').textContent = '請在 LINE 授權畫面允許取得個人資料，以開啟你的私人票匣。';
        await bounded(window.liff.getProfile(), 'LINE 授權尚未完成，請重新開啟票匣後再試。', 60000);
      }
      const accessToken = window.liff.getAccessToken?.();
      if (!accessToken) throw loginError('LINE 未完成身分授權，請點「重新在 LINE 開啟」後再試。');
      credential = { accessToken };
    }
    $('gate-message').textContent = '正在開啟你的私人票匣…';
    await enter(await api('/auth/line', { method: 'POST', body: credential, signal: AbortSignal.timeout(15000) }));
  } catch (error) {
    if (error.status === 401 && !window.liff?.isInClient?.()) { window.liff?.logout?.(); sdkInitializing = null; }
    gate(error.userMessage || error.status ? error.message : 'LINE 授權暫時無法完成，請再試一次，或重新在 LINE 開啟票匣。', true);
  }
  finally { loginInFlight = false; $('login').disabled = false; $('login').textContent = '使用 LINE 登入'; }
}
$('query').addEventListener('input', () => { clearTimeout(queryTimer); listController?.abort(); queryTimer = setTimeout(() => { page = 1; void load(); }, 250); });
$('year').addEventListener('change', () => { page = 1; void load(); });
$('prev').addEventListener('click', () => { page--; void load(); }); $('next').addEventListener('click', () => { page++; void load(); });
$('retry').addEventListener('click', () => { void load(); }); $('add').addEventListener('click', () => openEditor()); $('edit').addEventListener('click', () => { $('detail').close(); openEditor(selected); });
$('delete').addEventListener('click', () => { $('delete-error').textContent = ''; $('delete-dialog').showModal(); }); $('confirm-delete').addEventListener('click', () => { void deleteTicket(); });
$('ticket-form').addEventListener('submit', saveTicket); $('note').addEventListener('input', () => { $('note-count').textContent = `${$('note').value.length} / 1500`; });
$('movie-title').addEventListener('input', () => { clearMovie(); movieController?.abort(); $('suggestions').replaceChildren(); clearTimeout(movieTimer); movieTimer = setTimeout(searchMovies, 350); });
$('clear-movie').addEventListener('click', () => { clearMovie(); $('suggestions').replaceChildren(); });
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => { if (saving) return; if (button.dataset.close === 'editor') closeEditor(); else $(button.dataset.close).close(); });
$('editor').addEventListener('cancel', event => { if (saving) event.preventDefault(); else { movieController?.abort(); clearTimeout(movieTimer); } });
$('login').addEventListener('click', () => { void lineLogin(); });
$('logout').addEventListener('click', async () => { try { await api('/logout', { method: 'POST', body: {} }); csrf = ''; window.liff?.logout(); selected = null; $('grid').replaceChildren(); $('user-name').textContent = ''; gate('已登出。請回到 LINE 輸入「我的票匣」重新開啟。', !!liffConfig?.lineLoginReady); } catch (error) { notice(error.message); } });
async function start() {
  // Only erase our own entry token. LINE redirect parameters must reach liff.init(), which removes LINE credentials itself.
  const entry = new URLSearchParams(location.hash.slice(1)).get('entry'); if (entry !== null) history.replaceState(null, '', location.pathname + location.search);
  if (demo) { $('demo-banner').hidden = false; await enter({ user: { displayName: '電影旅人' } }); return; }
  try {
    if (entry) { await enter(await api('/auth/entry', { method: 'POST', body: { token: entry } })); return; }
    liffConfig = await api('/config');
    if (liffConfig.lineLoginReady) { gate('正在確認你的 LINE 身分…', true); await lineLogin(); }
    else {
      try { await enter(await api('/session')); return; } catch (error) { if (error.status !== 401) throw error; }
      gate('請在 Zona Movie 聊天室輸入「我的票匣」，\n點開專屬入口，就能查看自己的觀影紀錄。');
    }
  } catch (error) { gate(error.message, !!liffConfig?.lineLoginReady); }
}
void start();
