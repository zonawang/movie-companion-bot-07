import { cinemas, normalizeName } from './cinema-registry.mjs';
import placeIds from './maps-place-ids.json' with { type: 'json' };
import { GoogleMapsSource, validCoordinates } from './maps.mjs';
import { formatCinemaSchedule, taipeiDateTime } from './cinema.mjs';
import { validDate, validTime } from './atmovies.mjs';

const nameKey = value => normalizeName(value).replace(/[\p{P}\p{S}]/gu, '');
// Strict aliases + county check. No fuzzy brand matching or nearest-branch guessing.
export function matchMapCinema(place, registry = cinemas, overrides = placeIds) {
  const override = overrides[place.placeId];
  if (override) return registry.find(cinema => cinema.id === override);
  const address = nameKey(place.address || ''), name = nameKey(place.name || '');
  if (!name || !address) return undefined;
  const matches = registry.filter(cinema => address.includes(nameKey(cinema.county || '\u0000'))
    && (!cinema.district || address.includes(nameKey(cinema.district)))
    && [cinema.name, ...(cinema.aliases || []), ...(cinema.sourceNames || [])].some(alias => {
      const candidate = nameKey(alias);
      return candidate.length >= 4 && candidate === name;
    }));
  return matches.length === 1 ? matches[0] : undefined;
}

export class NearbyCinemaSource {
  constructor({ maps = new GoogleMapsSource(), cinema, registry = cinemas, overrides = placeIds, now = () => new Date() } = {}) {
    this.maps = maps; this.cinema = cinema; this.registry = registry; this.overrides = overrides; this.now = now;
  }
  async search({ locationQuery = '', radiusMeters = 3000, limit = 3, includeShowtimes = true,
    date = '', afterTime = '', onlyUpcoming = true, movieTitle = '' } = {}, sharedLocation) {
    const today = taipeiDateTime(this.now()).date;
    if (typeof locationQuery !== 'string' || locationQuery.length > 200 || !Number.isFinite(radiusMeters) || radiusMeters < 100 || radiusMeters > 10000
      || !Number.isInteger(limit) || limit < 1 || limit > 5 || typeof includeShowtimes !== 'boolean' || typeof onlyUpcoming !== 'boolean'
      || typeof date !== 'string' || (date && !validDate(date)) || typeof afterTime !== 'string' || (afterTime && !validTime(afterTime))
      || typeof movieTitle !== 'string' || movieTitle.length > 150) return { status: 'invalid', message: '請提供有效位置、日期與時間；最多列 5 間，範圍 100 公尺至 10 公里。' };
    if (date && date < today) return { status: 'past_date', message: '附近影院僅查目前公告，不提供已過日期的歷史場次。' };
    let location = sharedLocation, origin = { name: '你分享的位置' };
    if (locationQuery.trim()) {
      const resolved = await this.maps.resolve(locationQuery.trim());
      if (resolved.status !== 'ok') {
        return { ...resolved, choices: resolved.choices?.map(({ location: _coordinates, ...place }) => place) };
      }
      location = resolved.place.location;
      const { name, address, mapsUrl, attributions } = resolved.place;
      origin = { name, address, mapsUrl, attributions };
    }
    if (!validCoordinates(location)) return { status: 'needs_location', message: '請傳送 LINE 定位，或告訴我城市、地址或明確地標，再查附近電影院。' };
    const nearby = await this.maps.nearby(location, radiusMeters);
    if (nearby.status !== 'ok') return { ...nearby, origin };
    const fetchedAt = this.now().toISOString();
    if (!nearby.places.length) return { status: 'no_results', origin, radiusMeters, fetchedAt, message: '這次地圖查詢在指定範圍內沒有找到可列出的影院；可以擴大範圍或指定影城。' };
    let scheduleCount = 0;
    const entries = nearby.places.slice(0, limit).map(({ location: _coordinates, ...place }) => {
      const branch = matchMapCinema(place, this.registry, this.overrides);
      const shouldQuery = includeShowtimes && !!branch && scheduleCount++ < 3;
      return { ...place, cinemaId: branch?.id, cinemaName: branch?.name,
        scheduleStatus: !branch ? 'unmatched' : !includeShowtimes ? 'not_requested' : shouldQuery ? 'pending' : 'limit', shouldQuery };
    });
    const places = await Promise.all(entries.map(async ({ shouldQuery, ...place }) => {
      if (!shouldQuery) return place;
      try {
        const schedule = await this.cinema.schedule({ cinema: place.cinemaId, date, afterTime, onlyUpcoming, movieTitle });
        return { ...place, scheduleStatus: schedule.status, schedule };
      } catch { return { ...place, scheduleStatus: 'unavailable', schedule: { status: 'unavailable', cinema: place.cinemaName, message: '這間影城的場次暫時無法讀取，請查看影城或來源網站。' } }; }
    }));
    return { status: 'ok', source: 'Google Maps', origin, radiusMeters, fetchedAt, places, totalFound: nearby.places.length,
      date: date || today, includeShowtimes, onlyUpcoming, afterTime };
  }
}

function sourceLines(place) {
  return [place.mapsUrl ? `Google Maps：${place.mapsUrl}` : '', ...(place.attributions || []).map(item => `地圖資料提供者：${item.name}${item.url ? ' ' + item.url : ''}`)].filter(Boolean);
}
export function formatNearby(result) {
  const lines = [];
  if (result.origin?.mapsUrl) lines.push(`搜尋起點：${result.origin.name}`, ...sourceLines(result.origin), '');
  if (result.status === 'choose_location') {
    lines.push(result.message);
    for (const [index, place] of (result.choices || []).entries()) lines.push(`${index + 1}. ${place.name}｜${place.address}`, ...sourceLines(place));
    return lines.join('\n');
  }
  if (result.status !== 'ok') return [...lines, result.message || '附近影院查詢暫時無法完成。', result.fetchedAt ? '地點資料來源：Google Maps' : ''].filter(Boolean).join('\n');
  lines.push(`附近電影院｜半徑 ${result.radiusMeters / 1000} 公里，顯示 ${result.places.length} 間`, '距離為直線估算；未查詢交通時間。');
  if (result.includeShowtimes) lines.push(`場次日期：${result.date}${result.afterTime ? `，${result.afterTime} 起` : ''}${result.onlyUpcoming ? '；今天排除已開演場次' : ''}。`);
  const time = taipeiDateTime(new Date(result.fetchedAt));
  lines.push(`地圖讀取：${time.date} ${time.time}（台灣時間）`);
  // LINE delivery splits long replies; keep enough space for movies AND source links.
  const perPlace = 1000;
  for (const [index, place] of result.places.entries()) {
    const distance = place.distanceMeters < 1000 ? `${place.distanceMeters} 公尺` : `${(place.distanceMeters / 1000).toFixed(1)} 公里`;
    lines.push('', `${index + 1}. ${place.name}｜約 ${distance}`, place.address, ...sourceLines(place));
    if (place.schedule) lines.push(formatCinemaSchedule(place.schedule, { maxChars: perPlace }));
    else if (place.scheduleStatus === 'unmatched') lines.push('尚未可靠對應到場次資料，請由地圖入口核對影城；目前無法確認這裡上映的電影。');
    else if (place.scheduleStatus === 'limit') lines.push('本次最多自動查 3 間的場次，可再指定這間影城查詢。');
    else lines.push(`可指定「${place.cinemaName}」與日期查場次。`);
  }
  lines.push('', '地點資料：Google Maps。場次來源另列；有場次不代表仍有座位。');
  return lines.filter(value => value !== undefined).join('\n');
}
