import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { richMenuDefinition } from './navigation.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && /^richmenu-[a-zA-Z0-9_-]+$/.test(value);
export function planRichMenu(navigation, image) {
  const menu = richMenuDefinition(navigation);
  if (!Buffer.isBuffer(image) || image.length > 1_000_000 || image.length < 24 || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || image.readUInt32BE(16) !== menu.size.width || image.readUInt32BE(20) !== menu.size.height) throw new Error('Rich Menu 圖片必須是 2500×1686 PNG，且小於 1 MB');
  const fingerprint = digest(Buffer.concat([Buffer.from(JSON.stringify(menu)), image]));
  menu.name = 'ZonaMovie05-' + fingerprint.slice(0, 12);
  return { menu, fingerprint, imageHash: digest(image), imageBytes: image.length };
}
export class RichMenuClient {
  constructor({ token, fetcher = fetch }) {
    if (!token) throw new Error('缺少 LINE_CHANNEL_ACCESS_TOKEN');
    this.token = token; this.fetcher = fetcher;
  }
  async request(path, { method = 'GET', json, image, binary = false, allowMissing = false } = {}) {
    const host = path.endsWith('/content') ? 'https://api-data.line.me' : 'https://api.line.me';
    let response;
    try { response = await this.fetcher(host + path, { method, headers: { Authorization: `Bearer ${this.token}`, ...(json ? { 'Content-Type': 'application/json' } : {}), ...(image ? { 'Content-Type': 'image/png' } : {}) },
      body: json ? JSON.stringify(json) : image, redirect: 'error', signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error(`LINE 連線失敗：${method} ${path}；請先檢查目前狀態再重試`); }
    if (response.status === 404 && allowMissing) return null;
    if (!response.ok) throw new Error(`LINE HTTP ${response.status}：${method} ${path}`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  }
  async current() { return (await this.request('/v2/bot/user/all/richmenu', { allowMissing: true }))?.richMenuId || null; }
  async inspect() { return { defaultRichMenuId: await this.current(), menus: (await this.request('/v2/bot/richmenu/list')).richmenus || [] }; }
  async apply({ plan, image, state = null, checkpoint = async () => {} }) {
    if (state?.fingerprint === plan.fingerprint && state.previousDefault !== null && !validId(state.previousDefault)) throw new Error('Rich Menu checkpoint 無效，請保留檔案並檢查原預設選單');
    await this.request('/v2/bot/richmenu/validate', { method: 'POST', json: plan.menu });
    const before = await this.inspect();
    const previousDefault = state?.fingerprint === plan.fingerprint ? state.previousDefault : before.defaultRichMenuId;
    let record = { fingerprint: plan.fingerprint, imageHash: plan.imageHash, previousDefault, newRichMenuId: null, stage: 'prepared' };
    await checkpoint(record);
    const candidate = before.menus.find(menu => menu.name === plan.menu.name && ['size', 'selected', 'name', 'chatBarText', 'areas'].every(key => isDeepStrictEqual(menu[key], plan.menu[key])));
    let id = candidate?.richMenuId;
    if (!id) id = (await this.request('/v2/bot/richmenu', { method: 'POST', json: plan.menu })).richMenuId;
    if (!validId(id)) throw new Error('LINE 未回傳可用的 Rich Menu ID，尚未切換預設選單');
    record = { ...record, newRichMenuId: id, stage: 'created' }; await checkpoint(record);
    const existingImage = await this.request(`/v2/bot/richmenu/${id}/content`, { binary: true, allowMissing: true });
    if (existingImage && digest(existingImage) !== plan.imageHash) throw new Error('同名 Rich Menu 圖片不一致，尚未切換預設選單');
    if (!existingImage) await this.request(`/v2/bot/richmenu/${id}/content`, { method: 'POST', image });
    const uploaded = await this.request(`/v2/bot/richmenu/${id}/content`, { binary: true });
    if (digest(uploaded) !== plan.imageHash) throw new Error('LINE 圖片校驗不一致，尚未切換預設選單');
    record = { ...record, stage: 'image_verified' }; await checkpoint(record);
    if (await this.current() !== id) await this.request(`/v2/bot/user/all/richmenu/${id}`, { method: 'POST' });
    if (await this.current() !== id) throw new Error('無法確認預設選單，請保留 checkpoint 並檢查 LINE 後台');
    record = { ...record, stage: 'active' }; await checkpoint(record);
    return { ...record, reused: !!candidate, imageBytes: image.length };
  }
  async rollback(state) {
    if (!validId(state?.newRichMenuId) || state.previousDefault && !validId(state.previousDefault)) throw new Error('缺少可用的 Rich Menu checkpoint');
    const current = await this.current();
    if (current === state.previousDefault) return { restored: current, alreadyRestored: true };
    if (current !== state.newRichMenuId) throw new Error('目前預設選單已由其他操作變更，停止回復以保留該設定');
    if (state.previousDefault) await this.request(`/v2/bot/user/all/richmenu/${state.previousDefault}`, { method: 'POST' });
    else await this.request('/v2/bot/user/all/richmenu', { method: 'DELETE' });
    if (await this.current() !== state.previousDefault) throw new Error('無法確認 Rich Menu 回復結果');
    return { restored: state.previousDefault, alreadyRestored: false };
  }
}
