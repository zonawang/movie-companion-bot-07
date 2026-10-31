# Bot 06 Flex Message

## 資料與回覆路徑

LINE 驗簽 → 已去重事件佇列 → Google ADK `MovieCompanion` → `cinema_schedule` / `cinema_compare` → `CinemaCards` → `lineMessages` → LINE reply。

`CinemaCards` 只處理查詢成功且有場次的結果，保留影城來源原片名、版本、日期、過濾後時間與來源網址。僅圖片時刻表、查不到分館、未公告與無符合時間等狀態沿用文字回覆與來源，避免用空卡片或 TMDB 全台上映名單代替。

同一影城、同一原片名與介紹 URL 的多個版本合併為一張卡，版本與時間各自保留；不同影城分開。每頁最多十張電影卡；有多頁時，末尾另加一張導航卡（整列最多十一張）。首批可往下一批，中間批可前後切換，最後一批只有返回上一批；僅一批不加導航卡。最多保存前 150 筆電影／影城組合，超出明示可縮小分館或見來源。多館查詢最多三館，成功與失敗狀態可同時呈現。

卡片前有精簡文字說明影城、日期、讀取時間、來源名稱與頁碼，來源 URL 放在快速按鈕；完整場次仍保留來源更新時間與連結；卡片列每版本前三個時間，最多先展示兩版本。完整場次按鈕顯示同一作品全部版本的查詢結果，過長時保留來源入口。凌晨場維持來源日期，未提供即時座位或票價。

## 海報與簡介

`MovieCardCatalog` 以 TMDB `search/movie` 補資料，`include_adult=false`、繁中、region TW。只有正規化後的片名／原片名精確符合且唯一時採用；同名多作、非精確搜尋命中、跨頁可能另有同名作品、連線失敗，都保留預設封面。未用搜尋第一筆當作必然正確作品。

海報只由受限制的 poster path 組成 `https://image.tmdb.org/t/p/w500/...`；不接受外部任意圖片 URL。影城來源／介紹只使用已有來源的 HTTPS 主機。卡片有短簡介，點介紹才看較長內容與連結；TMDB 補資料成功時附上來源與既有 credits。

每頁最多十個補資料請求並行，單次 2.5 秒逾時；標題快取成功十分鐘、未命中三十秒，最多 300 筆，合併同時查詢且最多 20 個進行中。補資料失敗不影響場次本身。

缺少正確海報時使用 [電影院主題插畫](../public/assets/poster-fallback-v1.jpg)，已移除原本的「每一場電影／都是一段故事」文字封面。圖片由內建 image_gen 生成，提示記錄於 [prompt](../assets/poster-fallback-v1.prompt.md)，輸出為 768×1024 JPEG、約 206 KiB。

正式服務使用 `PUBLIC_BASE_URL` 下的 `/tickets/assets/poster-fallback-v1.jpg`；這個明確白名單路徑公開供 LINE 載入，支援 GET／HEAD，版本化圖片採一年 immutable 快取。其他票匣 API 繼續要求登入。單獨使用 `CinemaCards` 時預設引用同一 repo 的 raw 圖片；前端預覽將相同位元組內嵌為 data URI，方便離線檢查。

## 分頁與按鈕

`flex:page:<token>:<page>`、`flex:info:<token>:<index>`、`flex:times:<token>:<index>` 的 token 為 12 bytes 隨機值。後端依已驗簽 LINE actor 取得 snapshot，按鈕不帶 userId、私人資料或可更換的查詢 URL。

snapshot 保存十分鐘、最多 100 份，不落 SQLite；到期、服務重啟、錯誤索引或換人使用會要求重新查詢。翻頁延續同一份來源資料及查詢條件，不冒充每次即時刷新。模型、卡片瀏覽與介紹皆不寫票根。票匣與 Rich Menu 設定沿用前版。

目前 actor 綁定為同一個 LINE 使用者；分享給另一人時不能讀取該 snapshot。快取僅保存公開電影／影城資料，身分只作按鈕存取控制，不加入 Flex JSON。

## 驗證與預覽

- `test/cinema-cards.test.mjs`：分頁、版本、完整時間、actor 隔離、失效、外部 URL、補資料失敗、精確配對與同名歧義、ADK 工具輸出、驗簽按鈕及事件去重。
- `scripts/flex-browser-qa.mjs`：以實際 JSON 產生的開發用 HTML 測手機寬度、十張／兩張分頁、介紹與完整場次按鈕，產出截圖。這不是 LINE 官方渲染器。
- `examples/flex-adk-smoke.mjs`：真實 Gemini、ADK、來源場次與 TMDB；LINE `validate/reply` 驗證訊息，不對使用者推播，不寫正式票匣。

LINE 官方規格：[Flex Message 元件](https://developers.line.biz/en/docs/messaging-api/flex-message-elements/)、[Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/)。本版每頁最多十張電影卡加一張導航卡，共十一個 bubbles，小於 carousel 的十二個上限，輸出保留 altText。
