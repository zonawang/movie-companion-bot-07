# Bot 03：位置 → 附近影院 → 實際場次

## 與現有 ADK 的整合

bot-02 已使用 `@google/adk` 2.3.0、`LlmAgent`、`InMemoryRunner` 與九個工具。本版新增第十個 `nearby_cinemas`，以結構化的 Google Maps 地點結果對應既有分館 ID，再呼叫 `CinemaSource.schedule`。分館核對、時間篩選、來源與失敗處理由程式控制。

這是以地圖資料為依據回答的 map grounding 實作；沒有使用 Gemini 原生 `google_maps_grounding` 或 Grounding Lite MCP，不需遷移模型端點。

## 資料流程

1. 文字地址／地標由 ADK 提取為 `locationQuery`，以 Places Text Search (New) 解析。同名多候選時要求補充；只有唯一完整名稱／地址相符或只回一個結果時自動採用。
2. LINE 定位由 webhook schema 驗證，透過 `respond(..., {location})` 第四個參數傳入。座標不在模型可填的工具參數中。
3. Nearby Search (New) 使用 `includedTypes=[movie_theater]`、距離排序與圓形半徑。排除標示停業、重複 Place ID 與半徑外地點。
4. 座標用於計算直線距離，列出最近 1～5 間，不宣稱完整名冊、交通時間或座位。
5. 先查人工驗證的 Place ID 對應表，否則以完整名稱／精確別名、縣市及已有行政區配對。多候選、位置資料不足或不同名稱不猜測。
6. 最多對三個已配對分館平行查既有場次來源；一館失敗保留其他館資料，未知影院只提供地圖入口。
7. 程式固定輸出地圖與場次，保留 Google Maps 連結、第三方 attribution、各館場次來源與讀取時間。模型場次文字不覆蓋結果。

## 工具參數與狀態

`nearby_cinemas` 接受 `locationQuery`（LINE 定位時為空）、`radiusMeters`、`limit`、`includeShowtimes`、`date`、`afterTime`、`onlyUpcoming` 與 `movieTitle`。

預設 3000 公尺、3 間、今天未開演場次。範圍 100～10000 公尺，最多列 5 間，每回合重複附近工具呼叫合併成同一個 Promise。每個地圖請求上限 5 秒，不自動重試；既有場次來源沿用原有逾時、快取與日期核對。

整體狀態包括 `ok`、`needs_location`、`choose_location`、`location_not_found`、`no_results`、`not_configured`、`unavailable`、`invalid`、`past_date`。每館另有配對與場次狀態，不把查不到解讀為沒有電影／售完。

## 補充 Place ID 對應

`src/maps-place-ids.json` 保存經人工核對的 Place ID。2026-10-26 已對照 [光點台北官網](https://www.spot.org.tw/) 的中山北路二段18號地址，加入該分館對應。當 Google 地圖與場次來源名稱不同時，可人工核對名稱、完整地址、官網及分館，加入：

```json
{
  "經核對的_Google_Place_ID": "vieshow-qsquare"
}
```

只保存 Place ID 與本地分館 ID 的對應，不持久保存 Google Maps 名稱、地址或座標。新增後應以真實地圖與場次查詢重新核對，不能只看品牌或距離。

## Google Cloud 設定

啟用 Google Maps Platform 專案帳務與 Places API (New)，將伺服器用 API key 填入本機 `GOOGLE_MAPS_API_KEY`。Text Search 和 Nearby Search 只要求 ID、名稱、地址、位置、地圖連結、營業狀態及第三方 attribution，沒有查照片、評論或評分。

此欄位組合會依 Places API 價目計費，請參考 [官方價格](https://developers.google.com/maps/billing-and-pricing/pricing)。金鑰缺少、API 禁用或額度不足時，新工具回傳明確狀態，原有工具繼續運作。

## 位置與來源標示

LINE 精確座標用於地圖請求、待處理事件及有期限的使用者記憶體。15 分鐘後計時器清除定位與該段 ADK 對話；「清除位置」也會刪除對話，避免繼續引用先前位置。票根仍需使用者確認。文字地址、磁碟佇列與第三方處理細節見 [隱私說明](privacy.md)。

每筆地點附 Google Maps 文字標示與來源連結，第三方地圖提供者一併列出。長內容拆成最多五則 LINE 訊息。若改成網頁／地圖介面，應按實際介面套用官方標誌與地圖顯示規範。

## 官方參考

- [ADK](https://adk.dev/)
- [Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
- [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Places API 政策與來源標示](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Google Maps Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id)

既有影城覆蓋與資料限制見 [全台覆蓋表](taiwan-coverage.md)。
