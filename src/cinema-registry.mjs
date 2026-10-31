import vieshowCinemas from './vieshow-cinemas.json' with { type: 'json' };
import taiwanCinemas from './taiwan-cinemas.json' with { type: 'json' };
import coverage from './taiwan-coverage.json' with { type: 'json' };

export const taiwanCoverage = Object.freeze(coverage);
export const vieshowCoverage = Object.freeze({
  verifiedOn: '2026-10-26', officialCount: 20, muvieCount: 2,
  officialDirectory: 'https://www.vscinemas.com.tw/theater/', muvieDirectory: 'https://www.vscinemas.com.tw/theater/index2.aspx',
});
export const cinemas = Object.freeze([
  {
    id: 'eslite-songyan', brand: '誠品', city: '台北', county: '台北市', district: '信義區', name: '松菸誠品電影院', provider: 'eslite',
    aliases: ['松菸誠品', '誠品松菸', '誠品電影院', '誠品', 'eslite'], directoryTheaterCode: 't02a08', availability: 'verified',
    sourceUrl: 'https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001', bookingUrl: 'https://arthouse.eslite.com/visAgreement.aspx',
  },
  ...vieshowCinemas.map(cinema => ({ ...cinema, county: cinema.city + (['苗栗', '花蓮'].includes(cinema.city) ? '縣' : '市'), availability: 'verified' })),
  ...taiwanCinemas,
].map(cinema => Object.freeze({ ...cinema, aliases: Object.freeze(cinema.aliases), ...(cinema.sourceNames ? { sourceNames: Object.freeze(cinema.sourceNames) } : {}) })));

export const normalizeName = value => value.normalize('NFKC').toLowerCase().replaceAll('臺', '台').replace(/\s+/g, '');
const regions = {
  雙北: ['台北', '新北'], 北部: ['台北', '新北', '基隆', '桃園', '新竹', '宜蘭'], 中部: ['苗栗', '台中', '彰化', '南投', '雲林'],
  南部: ['嘉義', '台南', '高雄', '屏東'], 東部: ['花蓮', '台東'], 離島: ['澎湖', '金門', '連江'],
};
const wholeCountry = ['全台', '全台灣', '台灣', '全國'];
const countyNames = new Set(coverage.counties);
const placeNames = new Set([...countyNames, ...coverage.counties.map(name => name.slice(0, -1)), ...Object.keys(regions), ...wholeCountry]);
const shortBrand = name => name.replace(/(?:影城|電影院|戲院|電影城|電影館)$/, '');
const aliasIndex = new Map(), brandIndex = new Map();
function index(map, key, value) { if (!map.has(key)) map.set(key, []); if (!map.get(key).includes(value)) map.get(key).push(value); }
for (const cinema of cinemas) {
  for (const alias of new Set([cinema.id, cinema.name, ...cinema.aliases].map(normalizeName))) if (!placeNames.has(alias)) index(aliasIndex, alias, cinema);
  for (const alias of [normalizeName(cinema.brand), shortBrand(normalizeName(cinema.brand))]) if (!placeNames.has(alias)) index(brandIndex, alias, cinema);
}
for (const alias of ['vieshow', '威秀影城']) brandIndex.set(alias, brandIndex.get('威秀'));
for (const alias of ['muvie', 'muviecinemas']) brandIndex.set(alias, cinemas.filter(cinema => cinema.subBrand === 'MUVIE'));
for (const alias of ['showtime', 'showtimes', '秀泰影城']) brandIndex.set(alias, brandIndex.get('秀泰'));
for (const alias of ['ambassador', '國賓影城']) brandIndex.set(alias, brandIndex.get('國賓'));
for (const alias of ['in89豪華', 'in89豪華影城']) brandIndex.set(alias, brandIndex.get('in89'));

function cityMatches(cinema, input) {
  const key = normalizeName(input);
  if (!key || wholeCountry.includes(key)) return true;
  if (countyNames.has(key)) return cinema.county === key;
  if (regions[key]) return regions[key].includes(cinema.city);
  return cinema.city === key || (cinema.district && [cinema.district, cinema.district.slice(0, -1)].includes(key));
}
function brandMatches(cinema, input) {
  const key = normalizeName(input);
  return !key || (brandIndex.get(key) || brandIndex.get(shortBrand(key)) || []).includes(cinema);
}
export function matchCinemas(name) {
  const key = normalizeName(name);
  if (!key) return [];
  if (brandIndex.has(key) || brandIndex.has(shortBrand(key))) return brandIndex.get(key) || brandIndex.get(shortBrand(key));
  if (aliasIndex.has(key)) return aliasIndex.get(key);
  if (placeNames.has(key)) return cinemas.filter(cinema => cityMatches(cinema, key));
  // 只接受「地區＋品牌」或「品牌＋地區」，不作任意包含比對。
  for (const brand of [...brandIndex.keys()].sort((a, b) => b.length - a.length)) {
    for (const tag of new Set([brand, shortBrand(brand)])) {
      const place = key.startsWith(tag) ? key.slice(tag.length) : key.endsWith(tag) ? key.slice(0, -tag.length) : '';
      if (place) {
        const matches = (brandIndex.get(brand) || []).filter(cinema => cityMatches(cinema, place));
        if (matches.length) return matches;
      }
    }
  }
  return [];
}
export function findCinema(name) { const matches = matchCinemas(name); return matches.length === 1 ? matches[0] : undefined; }

export function listCinemas({ brand = '', city = '', page = 1 } = {}) {
  const matches = cinemas.filter(cinema => brandMatches(cinema, brand) && cityMatches(cinema, city));
  const pageSize = 25, pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const brandCounts = [...new Set(matches.map(cinema => cinema.brand))].map(name => ({ brand: name, count: matches.filter(cinema => cinema.brand === name).length })).sort((a, b) => b.count - a.count);
  const notice = `依 ${coverage.verifiedOn} 開眼目錄登錄 ${coverage.directoryCount} 個據點，${coverage.structuredCount} 個可解析場次、${coverage.imageOnlyCount} 個僅圖片入口；未保證涵蓋全台所有營業場所或之後的新開據點。`;
  const meta = { total: matches.length, page, pageSize, pageCount, hasMore: page < pageCount, brandCounts, query: { brand, city }, notice };
  if (!Number.isInteger(page) || page < 1 || page > pageCount) return { ...meta, status: 'invalid_page', cinemas: [], message: `目前符合條件共 ${matches.length} 間、${pageCount} 頁，請指定有效頁碼。` };
  return {
    ...meta, status: 'ok', cinemas: matches.slice((page - 1) * pageSize, page * pageSize).map(({ id, brand, subBrand, city, county, name, sourceUrl, bookingUrl, availability }) => ({ id, brand, subBrand, city, county, name, sourceUrl, bookingUrl, availability })),
  };
}
export function formatCinemaList(result) {
  if (result.status !== 'ok') return [result.message, result.notice].filter(Boolean).join('\n');
  const lines = [`影城清單（符合 ${result.total} 間；第 ${result.page}/${result.pageCount} 頁，本頁 ${result.cinemas.length} 間）：`];
  if (!result.query.brand && result.brandCounts.length) lines.push('品牌／名稱分組：' + result.brandCounts.slice(0, 12).map(item => `${item.brand} ${item.count}`).join('、') + (result.brandCounts.length > 12 ? '等' : ''));
  for (const county of [...new Set(result.cinemas.map(cinema => cinema.county))]) lines.push(`${county}：`, ...result.cinemas.filter(cinema => cinema.county === county).map(cinema => `・${cinema.name}${cinema.availability === 'image_only' ? '【僅圖片場次入口】' : ''}`));
  lines.push(result.hasMore ? '可說「下一頁」，或指定品牌、縣市縮小清單。' : '可指定分館與日期查詢，或換品牌／縣市。', result.notice);
  return lines.join('\n');
}
