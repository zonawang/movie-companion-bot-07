// Google Maps Platform Places API (New). No result/coordinate cache or request logging.
const fields = 'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.businessStatus,places.attributions';
export const validCoordinates = value => !!value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
  && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
const text = (value, limit = 180) => typeof value === 'string' ? value.replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, limit) : '';
const key = value => value.normalize('NFKC').toLowerCase().replaceAll('臺', '台').replace(/[\s\p{P}\p{S}]/gu, '');
export function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
function placeView(place) {
  if (!place || typeof place.id !== 'string' || !place.id || !place.displayName?.text || !validCoordinates(place.location)) return null;
  const id = text(place.id, 200), name = text(place.displayName.text);
  const supplied = safeUrl(place.googleMapsUri);
  const mapsUrl = supplied && ['maps.google.com', 'www.google.com', 'maps.app.goo.gl'].includes(new URL(supplied).hostname)
    ? supplied : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(id)}`;
  return {
    placeId: id, name, address: text(place.formattedAddress), location: { latitude: place.location.latitude, longitude: place.location.longitude }, mapsUrl,
    businessStatus: text(place.businessStatus, 40),
    attributions: (Array.isArray(place.attributions) ? place.attributions : []).slice(0, 3).map(item => ({ name: text(item.provider, 80), url: safeUrl(item.providerUri) })),
  };
}
export function distanceMeters(a, b) {
  const rad = degrees => degrees * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return Math.round(6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h)))));
}
export class GoogleMapsSource {
  constructor({ apiKey = process.env.GOOGLE_MAPS_API_KEY, fetcher = fetch, timeoutMs = 5000 } = {}) {
    this.apiKey = apiKey?.trim(); this.fetcher = fetcher; this.timeoutMs = timeoutMs;
  }
  async request(method, body) {
    if (!this.apiKey) return { status: 'not_configured', message: '附近影院功能尚未設定 Google Maps 金鑰；目前仍可直接指定影城查場次。' };
    try {
      const response = await this.fetcher(`https://places.googleapis.com/v1/places:${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': fields },
        body: JSON.stringify({ languageCode: 'zh-TW', ...body }), signal: AbortSignal.timeout(this.timeoutMs), redirect: 'error',
      });
      // Never expose upstream error bodies, request URLs, coordinates or API keys.
      if (!response.ok) return { status: 'unavailable', message: response.status === 429 ? '地圖查詢額度暫時不足，請稍後再試。' : '地圖服務暫時無法使用；可直接指定影城查場次。' };
      const data = await response.json();
      if (data.places !== undefined && !Array.isArray(data.places)) throw new Error('invalid response');
      const raw = data.places || [], places = raw.map(placeView).filter(Boolean);
      if (raw.length && !places.length) throw new Error('invalid places');
      return { status: 'ok', places: [...new Map(places.map(place => [place.placeId, place])).values()] };
    } catch { return { status: 'unavailable', message: '地圖服務連線失敗或逾時；請稍後再試，或直接指定影城。' }; }
  }
  async resolve(query) {
    if (typeof query !== 'string' || !query.trim() || query.length > 200) return { status: 'invalid', message: '請提供城市、地址或明確地標。' };
    const result = await this.request('searchText', { textQuery: query.trim(), regionCode: 'TW', pageSize: 5 });
    if (result.status !== 'ok') return result;
    const places = result.places.filter(place => !place.businessStatus.startsWith('CLOSED_'));
    if (!places.length) return { status: 'location_not_found', message: '查不到這個位置，請補上城市、完整地址或傳送 LINE 定位。' };
    const exact = places.filter(place => key(place.name) === key(query) || key(place.address) === key(query));
    if (places.length === 1 || exact.length === 1) return { status: 'ok', place: exact[0] || places[0] };
    return { status: 'choose_location', message: '找到多個位置，請用城市與完整地標名稱重新指定，或傳送 LINE 定位。', choices: places };
  }
  async nearby(location, radiusMeters = 3000) {
    if (!validCoordinates(location) || !Number.isFinite(radiusMeters) || radiusMeters < 100 || radiusMeters > 10000) {
      return { status: 'invalid', message: '位置或範圍無效；搜尋範圍需介於 100 公尺至 10 公里。' };
    }
    const result = await this.request('searchNearby', { includedTypes: ['movie_theater'], maxResultCount: 20, rankPreference: 'DISTANCE',
      locationRestriction: { circle: { center: { latitude: location.latitude, longitude: location.longitude }, radius: radiusMeters } } });
    if (result.status !== 'ok') return result;
    const places = result.places.filter(place => !place.businessStatus.startsWith('CLOSED_'))
      .map(place => ({ ...place, distanceMeters: distanceMeters(location, place.location) }))
      .filter(place => place.distanceMeters <= radiusMeters).sort((a, b) => a.distanceMeters - b.distanceMeters);
    return { status: 'ok', places };
  }
}
