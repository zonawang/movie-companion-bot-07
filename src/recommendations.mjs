import { z } from 'zod';
import { tmdbAttribution } from './attribution.mjs';

// TMDB movie genre IDs; descriptions are labels, not ratings or content guarantees.
export const genres = {
  action: [28, '動作'], adventure: [12, '冒險'], animation: [16, '動畫'], comedy: [35, '喜劇'],
  crime: [80, '犯罪'], documentary: [99, '紀錄'], drama: [18, '劇情'], family: [10751, '家庭'],
  fantasy: [14, '奇幻'], history: [36, '歷史'], horror: [27, '恐怖'], music: [10402, '音樂'],
  mystery: [9648, '懸疑'], romance: [10749, '愛情'], science_fiction: [878, '科幻'],
  thriller: [53, '驚悚'], war: [10752, '戰爭'], western: [37, '西部'],
};
const moods = { light: ['comedy', 'animation', 'family'], warm: ['drama', 'romance', 'family'],
  exciting: ['action', 'adventure', 'science_fiction', 'thriller'], thoughtful: ['drama', 'mystery', 'documentary'], any: [] };
export const recommendationSchema = z.object({
  mood: z.enum(['light', 'warm', 'exciting', 'thoughtful', 'any']).describe('輕鬆、溫馨、刺激、思考或不限；依使用者說法，不猜偏好'),
  genres: z.array(z.enum(Object.keys(genres))).max(6).describe('使用者指定想看的類型；未指定填空陣列'),
  excludeGenres: z.array(z.enum(Object.keys(genres))).max(18).describe('使用者排除的類型；保留本段對話先前的限制'),
  matchAll: z.boolean().describe('明確要求同時符合所有指定類型時 true，否則 false'),
});
export async function recommendMovies(source, input) {
  const preferences = recommendationSchema.parse(input);
  const result = await source.recommendationCandidates();
  if (!['ok', 'demo'].includes(result.status)) return { status: 'unavailable', movies: [] };
  const preferred = (preferences.genres.length ? preferences.genres : moods[preferences.mood]).map(key => genres[key][0]);
  const excluded = preferences.excludeGenres.map(key => genres[key][0]);
  const selected = result.movies.filter(movie => {
    if (excluded.length && !movie.genreIds.length) return false;
    if (excluded.some(id => movie.genreIds.includes(id))) return false;
    return !preferred.length || (preferences.matchAll ? preferred.every(id => movie.genreIds.includes(id)) : preferred.some(id => movie.genreIds.includes(id)));
  }).map(movie => ({ ...movie, score: preferred.filter(id => movie.genreIds.includes(id)).length }))
    .sort((a, b) => b.score - a.score || b.popularity - a.popularity || a.id - b.id).slice(0, 3)
    .map(({ score, popularity, ...movie }) => ({ ...movie,
      reason: preferred.length ? `資料類型含${Object.values(genres).filter(([id]) => preferred.includes(id) && movie.genreIds.includes(id)).map(([, label]) => label).join('、')}，符合你指定的方向。` : '在這次取得的上映候選中，依 TMDB 人氣排序挑選。',
      genreLabels: Object.values(genres).filter(([id]) => movie.genreIds.includes(id)).map(([, label]) => label),
    }));
  return { ...result, movies: selected, preferences };
}
export function formatRecommendations(result) {
  if (result.status === 'unavailable') return '這次無法取得上映候選，請稍後再試。我沒有用猜測的片單補上。';
  const text = [result.status === 'demo' ? '【虛構示範電影，非目前上映】' : '幫你挑的上映候選：'];
  if (!result.movies.length) text.push('這次取得的候選中沒有符合條件的電影。想放寬類型或換個心情再找嗎？');
  for (const [i, movie] of result.movies.entries()) text.push(`${i + 1}. ${movie.title}\n${movie.reason}\n類型：${movie.genreLabels.join('、') || '未提供'}${movie.url ? '\n' + movie.url : ''}`);
  if (result.partial) text.push('部分資料讀取失敗，本次只使用成功取得的候選。');
  text.push('心情是依類型配對的方向；排除條件依 TMDB 類型標記篩選。上映候選不代表特定影城今天有場次，可以再告訴我城市與分館查時間。');
  if (result.source === 'TMDB') text.push(tmdbAttribution());
  return text.join('\n\n');
}
