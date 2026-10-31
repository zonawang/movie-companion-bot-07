# Bot 05 Rich Menu 驗證紀錄

日期：2026-10-30（Asia/Taipei）。正式執行版本：`f62b60691f45fd278808f021591e5821e38d5c66`。

## 四格選單

- 左上「電影查詢」：`menu:movies` postback 交給 ADK；開啟鍵盤，讓使用者輸入片名或選擇後續查詢。
- 右上「我的票匣」：直接進 Published MINI App `2012222034-AVyO2nk3`。
- 左下「附近影院」：`menu:nearby` postback 交給 ADK；收起選單後顯示位置分享 quick reply。實際位置事件沿用 ADK 的地圖與場次工具。
- 右下「記錄心得」：開啟相同 MINI App 的 `?action=new`，驗證登入後打開新增表單；未按儲存不新增票根。

Google ADK 新增 `open_movie_feature` FunctionTool，四項 feature 均可在對話中由 agent 開啟。URI 按鈕直接開網頁，不額外產生一次模型呼叫；私人資料操作仍由已驗證 session 與 API 控制。完整內容的聊天記錄保留草稿確認機制。

## 自動與真實服務測試

- [部署版本 GitHub CI](https://github.com/zonawang/movie-companion-bot-05-richmenu/actions/runs/41046822985) 的 test 與 browser 均成功，96 項測試通過。
- 使用真實 ADK Runner 與替代模型驗證四 feature 工具回傳、已簽章 Rich Menu postback、事件去重、位置 quick reply，以及模型不能替換程式控制的網址。
- 安裝工具測試涵蓋先上傳驗證圖片再切換、失敗保留舊預設、重試復用、checkpoint 與回復；不刪除原選單或個別使用者綁定。
- 瀏覽器測試確認 LINE 導回 `liff.state` 後打開新增表單、外部瀏覽器登入保留意圖、取消後重開不再自動開表單，且開表單本身不寫資料。手機表單截圖已下載檢視。
- 雲端使用真正的 `gemini-3.5-flash-lite` 與 Google ADK，對 movies、shelf、nearby、new_ticket 四種需求分別驗證，全部實際呼叫 `open_movie_feature` 並回傳 `ok`。採用測試 actor、記憶體 SQLite，未傳送 LINE 訊息、未寫正式票根。
- 四種入口回覆分別通過 LINE `POST /v2/bot/message/validate/reply`，均為 200，沒有推送訊息給使用者。

## 發佈結果

- 確認目標 LINE Bot 為 Zona Movie `@796qcwyz`，發佈前無 API 預設 Rich Menu、API 選單清單為空。
- 圖片為程式繪製的 2500×1686 PNG，280,880 bytes；四個點擊區與圖格一致。
- LINE 物件驗證通過，建立及上傳後再下載核對 SHA-256，最後才設預設。
- 正式預設 Rich Menu：`richmenu-64267f4e8b458bcfbae74a0d20df99c3`，名稱 `ZonaMovie05-467ddd465284`，`selected: true`，聊天列文字「電影夥伴選單」。重新讀取的動作、網址與區域均正確。
- 安裝 checkpoint：`/var/lib/movie-bot/richmenu-install-05.json`，原預設為 null，階段 active。可用 `rollback` 解除本次 API 預設，不刪除選單物件。
- 沿用原 VM、Secret Manager、HTTPS、Published MINI App 與 SQLite，只有程式來源改為 Bot 05。Caddy 版本 header 為 05，health 與新前端為 200，服務正常。
- 更新前建立 `/var/lib/movie-bot/pre-richmenu-20261030.sqlite`；更新後原有 2 筆票根的 ID、擁有者、完整內容與建立時間校驗一致，SQLite `quick_check` 為 ok。
- 正式 webhook 的已簽章空事件為 200，沒有替使用者新增任何觀影紀錄。

手機上的 Rich Menu 顯示與四格實際點擊仍需使用者操作確認；LINE 客戶端若仍保留舊畫面，可關閉後重開 Zona Movie 一對一聊天室。LINE API 成功與模擬瀏覽器測試不視為已完成全部真人端到端驗收。
