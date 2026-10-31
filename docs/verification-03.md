# Bot 03 驗證紀錄

日期：2026-10-26（Asia/Taipei）。基礎來源為 bot-02 的影城擴充版本 `66691a1f1994889baec628ea3d499c46a76e0b91`，新增位置功能於獨立 bot-03 目錄；初版未更動舊服務，後續已完成本文記錄的雲端部署與 LINE 切換。

## 依賴與自動化測試

使用 Node.js 24.22.1，以本版 `package-lock.json` 完成乾淨安裝（`npm ci --ignore-scripts`）。保留 `@google/adk` 2.3.0，未新增執行期套件。

執行 `npm test`，**75 項全部通過**，涵蓋既有電影、票根、分館、場次、圖片來源、清單分頁、LINE 簽章與去重，以及新增：

- Places API (New) 請求格式、必要欄位、台灣語系與距離排序。
- 停業／重複／半徑外地點、缺 key、額度、HTTP 錯誤與異常回應。
- 地址／地標多候選，以及唯一完整名稱解析。
- 精確分館配對、錯縣市／行政區、無法配對與人工 Place ID 對應。
- 最多三館場次、單館失敗隔離、日期／時間／片名參數。
- LINE 定位事件欄位驗證、私訊隔離、重送不重查、事件處理後內容清空。
- 真正 ADK Runner 呼叫新 FunctionTool、模型虛構時間不採用、模型後續失敗保留已取得結果。
- 位置使用者隔離、15 分鐘期限與自動清除、清除位置指令。
- 原始 LINE 經緯度不進模型文字、長 LINE 回覆保留最後一館來源。

完整套件新增 GitHub Actions workflow，在 push／pull request 上執行乾淨安裝與測試。

## 真實 Gemini／ADK：已執行

以 `gemini-3.5-flash-lite` 執行 `smoke:maps:adk:fixture`。此測試 **Google Maps 回應為明確的替代資料**，Gemini／ADK 與開眼場次讀取為真實服務。

1. 模擬 LINE 傳入公開示範位置：模型呼叫 `nearby_cinemas`，地圖 adapter 回傳京站威秀，程式對應 `vieshow-qsquare`，讀取當天剩餘場次。
2. 文字「我在台北車站，附近三公里今晚六點以後有哪些電影可以看？」：模型呼叫同工具，正確帶入地標與 `18:00`，先解析位置再查影院，輸出真實開眼時間與來源。

測試使用記憶體 SQLite，不傳 LINE 訊息、不寫正式票根，驗證後清除定位。通過此測試只能證明真實模型選工具與場次整合，不能當成真實 Google Maps 測試。

## 真實 Google Maps 與雲端部署：已完成

已在 `free-9000` 設定 Places API (New)、建立僅限專用 VM IP 的地圖 key，並透過 Secret Manager 載入執行環境。

- VM 真實 `smoke:maps` 通過：台北車站附近的京站威秀與光點台北成功配對且有來源場次；誠品南西尚無可靠場次來源，明確標示未配對。
- VM 真實 `smoke:maps:adk` 通過，使用真實 Gemini、Maps 與開眼，沒有替代地圖回應。LINE 定位可直接查附近；文字「台北車站」收到多個同名候選時，依設計要求補充或傳定位。
- 光點台北的 Place ID 對應已依官網中山北路二段18號地址核對，並加入回歸測試。
- 應用程式版本 `9a164876ccf9d48b55707c1d542eccdcc8f4048b` 已部署。75 項測試與 GitHub Actions 通過。
- 固定 HTTPS 健康檢查 200，未簽章 webhook 401。
- LINE 官方 webhook 已於 2026-10-26 15:42 切換，驗證 200 OK、active=true。
- 原有 1 筆票根的 ID、actor、完整 payload、created 雜湊一致；使用交易合併並保留切換期間新事件。
- systemd 開機自動啟動、失敗重啟及每日 SQLite 備份 timer 已啟用。

驗證未傳送未經要求的 LINE 推播。使用者可直接在原有 Zona Movie 傳定位；手機畫面與實際個人定位仍待使用者操作確認。主機資源、資料路徑與管理方式見 [部署說明](deployment.md)。
