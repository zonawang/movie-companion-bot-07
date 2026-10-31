# Published MINI App 切換紀錄

日期：2026-10-27（Asia/Taipei）。程式執行版本維持 `afcb7ccf69ab7bd742b612eddd1e98aa642672f5`，本次只更新登入環境設定並重新載入服務。

## 正式設定

| 項目 | 值 |
| --- | --- |
| 環境 | Published |
| Channel ID | `2012222034` |
| LIFF ID | `2012222034-AVyO2nk3` |
| 正式入口 | `https://miniapp.line.me/2012222034-AVyO2nk3` |
| Endpoint URL | `https://movie-bot-03.136-67-154-252.sslip.io/tickets/` |
| LIFF_APP_TYPE | `miniapp` |

LINE 公開入口頁顯示應用名稱 `zona ticket box`，Endpoint URL 已核對為正式票匣網址。目前為未認證 MINI App；Published 環境與 LINE 的認證標章是不同狀態。認證資訊沒有因本次伺服器切換而改變。

## 本次驗證

- 在本機以正式 ID 配對執行設定及 Bot 入口產生邏輯，確認使用 Published URL，並拒絕混用 Developing Channel ID。
- Secret Manager 已改為 Published 的兩個 ID，重跑既有 startup script 後，HTTPS `/api/config` 回傳 `2012222034-AVyO2nk3` 與 `lineLoginReady: true`。
- 從雲端正式環境載入設定，確認 Bot「我的票匣」產生相同 Published URL；沒有推送測試訊息給使用者。
- 以無效測試 ID token 呼叫正式登入 API，經 LINE 驗證後回傳 401；未登入的 `/api/tickets` 同樣為 401。
- `/health`、`/tickets/` 為 200，應用、Caddy、每日備份 timer 均 active。
- 更新前建立 `/var/lib/movie-bot/pre-published-20261027.sqlite` 線上備份，沒有覆蓋 Developing 階段的備份。更新後原有 1 筆票根的 ID、擁有者、完整 payload 與建立時間校驗一致，SQLite `quick_check` 為 `ok`。

程式碼未變更，沿用已通過 84 項測試與 [GitHub CI](https://github.com/zonawang/movie-companion-bot-04-liff/actions/runs/40510722148) 的版本；本次針對正式設定、真實 LINE 入口、服務與資料進行上述檢查。

## 手機 LINE 驗收

公開環境已接入，但尚未代替真人取得 LINE 授權。使用者仍需在手機 LINE 開啟正式入口、同意授權，確認自己的收藏以及新增後重新開啟的持久性。每一個 LINE 帳號仍經後端驗證，只能查自己的資料。

原 [Developing 串接紀錄](miniapp-developing-verification.md) 保留作歷史紀錄，現在以本文件及 [目前設定](liff-setup.md) 為準。
