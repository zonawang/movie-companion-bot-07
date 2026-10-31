export const creditsUrl = 'https://github.com/zonawang/movie-companion-bot-06-flex-message/blob/main/docs/credits.md';

export function tmdbAttribution(sources = []) {
  const links = [...new Set(sources)].filter(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'www.themoviedb.org'; }
    catch { return false; }
  }).slice(0, 3);
  return [
    '資料來源：TMDB（https://www.themoviedb.org）',
    ...links,
    `關於與資料來源：${creditsUrl}`,
  ].join('\n');
}

export function aboutReply() {
  return { text: [
    '電影夥伴｜關於與資料來源',
    '電影資料來自 TMDB；評論是使用者評論，不代表專業影評或整體共識。',
    '已登錄開眼 2026-10-26 目錄的 108 個據點：102 個可解析場次、6 個僅圖片入口；非全台完整營業名冊。誠品場次來自官方；其他影城主要使用開眼第三方資料，大巨蛋秀泰、文心秀泰、長春國賓與澎湖 in89 另有官方公開場次備援；大巨蛋另有場次通第三方備援，可能延遲或缺少版本，實際場次以影城為準。回覆附資料來源與讀取時間，沒有即時座位或票價資訊。',
    '個人票根由你確認後儲存。',
    '附近影院的名稱、地址與位置來自 Google Maps；距離為直線估算，場次仍由原有來源提供。傳送位置或提供地址即用於查詢 Google Maps；相關問題與結果交由 Gemini 處理。',
    'LINE 精確定位於記憶體最多保留 15 分鐘；待處理事件會暫存 SQLite，處理後清空內容。輸入「清除位置」可清除目前對話與定位。',
    '隱私：https://github.com/zonawang/movie-companion-bot-03/blob/main/docs/privacy.md',
    '使用條款：https://github.com/zonawang/movie-companion-bot-03/blob/main/docs/terms.md',
    'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    creditsUrl,
  ].join('\n') };
}
