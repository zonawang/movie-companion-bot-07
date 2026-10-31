# Bot 04 票匣驗證紀錄

日期：2026-10-26（Asia/Taipei）。正式執行版本：`035efbfc4acee86718ceb8ad8f96a6cd2254905b`。

## 程式與畫面

- 本機 83 項測試通過，包含原有 75 項 ADK／影院／地圖測試與新增票匣驗證。
- [正式版本 GitHub CI](https://github.com/zonawang/movie-companion-bot-04-liff/actions/runs/40295332732) 的 test、browser 兩個 job 全部通過。
- 瀏覽器測試實際操作桌面與 390px 手機視窗：新增、編輯、刪除、搜尋、年份篩選、未登入入口、心得換行與惡意 script 文字。沒有 JavaScript 錯誤或頁面水平溢出。
- 從 CI 下載並檢視桌面、手機及表單截圖；修正預設封面片名重疊。截圖可在同一 CI 的 `ticket-shelf-screenshots` artifact 下載。
- API 測試涵蓋使用者隔離、LINE 官方 ID token 驗證與 audience／expiry 檢查、一次性入口期限、CSRF／Origin、重複儲存、不同內容重試衝突、編輯版本衝突、日期與大小限制、舊資料及超過 200 筆收藏分頁，以及畸形 URL 不使服務中斷。

## 雲端

- 沿用 `free-9000` 的 `movie-bot-03` VM、既有 HTTPS 網址與 SQLite。公開入口為 `/tickets/`，原 LINE webhook 路徑不變。
- 更新前以 SQLite backup API 建立 `/var/lib/movie-bot/pre-bot04.sqlite`，僅新增票匣 metadata 表；沒有覆蓋原資料庫。
- 更新後原有 1 筆票根的 ID、擁有者、完整 payload、建立時間經 SHA-256 核對一致；SQLite `quick_check` 為 `ok`。
- `movie-bot`、Caddy、每日備份 timer 均為 active，程式連結指向上述完整版本。
- HTTPS `/health`、`/tickets/`、JS、CSS、`/api/config` 均為 200；未登入的 `/api/tickets`、`/api/session` 為 401。
- 未簽章 webhook 為 401；使用現有 secret 的已簽章空事件為 200，未發送測試訊息給使用者。
- 使用雲端既有 TMDB token 真實搜尋電影並取得電影詳情、海報路徑，確認可用；測試不寫入正式收藏。

## 登入狀態與待完成事項

目前沒有 LIFF app，`LIFF_ID`、`LINE_LOGIN_CHANNEL_ID` 留空；`/api/config` 的 `lineLoginReady` 為 false。正式 LINE LIFF 登入尚未做真人端到端驗收，不應視為已完成 channel 註冊。

已部署的使用方式是在 Zona Movie 一對一聊天室輸入「我的票匣」，由已驗簽事件產生兩分鐘、單次的私人入口；開啟後有最長一小時 session。請勿轉傳連結。票匣實際 LINE 客戶端的開啟與互動仍需使用者自行驗收。

正式 LIFF 登入程式已備妥，待在相同 Provider 建立 channel、設定兩個公開 ID、重新載入服務，並以實際 LINE 帳號測試。逐欄設定見 [LIFF 設定](liff-setup.md)。

公開示範模式只使用虛構資料，不讀取或寫入正式票根。
