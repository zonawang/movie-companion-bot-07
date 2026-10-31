// Live Google Maps + existing cinema sources. Requires a billed Places API (New) key.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { GoogleMapsSource } from '../src/maps.mjs';
import { NearbyCinemaSource, formatNearby } from '../src/nearby.mjs';
import { CinemaSource } from '../src/cinema.mjs';
if (!process.env.GOOGLE_MAPS_API_KEY?.trim()) throw new Error('請先在本機 .env 設定 GOOGLE_MAPS_API_KEY，並啟用 Places API (New)。此驗證會使用 API 額度。');
const maps = new GoogleMapsSource();
const resolved = await maps.resolve('台北車站');
assert.ok(['ok', 'choose_location'].includes(resolved.status), resolved.message);
const result = await new NearbyCinemaSource({ maps, cinema: new CinemaSource() }).search({}, { latitude: 25.0478, longitude: 121.517 });
assert.equal(result.status, 'ok', result.message);
assert.ok(result.places.length > 0);
console.log(formatNearby(result));
console.log('PASS：真實 Google Maps 影院查詢完成。配對／場次狀態：', result.places.map(place => `${place.name}: ${place.scheduleStatus}`).join('；'));
