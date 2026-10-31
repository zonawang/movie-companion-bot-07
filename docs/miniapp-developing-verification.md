# MINI App Developing 串接紀錄

日期：2026-10-27（Asia/Taipei）。執行版本：`afcb7ccf69ab7bd742b612eddd1e98aa642672f5`。

## 設定

| 項目 | 值 |
| --- | --- |
| 環境 | LINE MINI App Developing |
| Channel ID | `2012222030` |
| LIFF ID | `2012222030-OFWyoaEd` |
| 入口 | `https://miniapp.line.me/2012222030-OFWyoaEd` |
| Endpoint URL | `https://movie-bot-03.136-67-154-252.sslip.io/tickets/` |
| LIFF_APP_TYPE | `miniapp` |

使用者已在 LINE Developers 更新並儲存 Endpoint URL；從 LINE 公開入口頁重新讀取的 endpoint 已確認為票匣網址，沒有再指向 LINE 預設示範頁。Secret Manager 已更新成上表配對，服務重新載入後 `/api/config` 回傳指定 LIFF ID 與 `lineLoginReady: true`。

Review Channel `2012222032`、Published Channel `2012222034` 尚未接入；不能用 Developing 的 LIFF ID 配對另一個 Channel ID。程式會拒絕不一致的設定。

## 驗證

- 本機 84 項測試通過；[部署版本 GitHub CI](https://github.com/zonawang/movie-companion-bot-04-liff/actions/runs/40510722148) 的 test 與 browser 全部通過。
- 瀏覽器測試使用測試專用 SDK 與 API 回應，確認 LINE 導回的 URL fragment 會保留至 `liff.init()`，之後由 SDK 清除；已存在的 session 不會略過目前 LINE 帳號驗證；Bot 自己的一次性入口仍在兌換前移除。
- 從雲端執行相同設定的入口產生邏輯，確認 Bot 連結為上表 MINI App URL；沒有發送測試訊息給使用者。
- 雲端使用無效測試 ID token 呼叫正式登入 API，LINE 驗證後回傳 401，不建立 session。未登入的私人票根 API 同樣回傳 401。
- HTTPS `/health`、`/tickets/` 為 200；應用、Caddy、每日備份 timer 正常。
- 更新前透過 SQLite backup API 建立 `/var/lib/movie-bot/pre-miniapp-20261027.sqlite`；更新後既有 1 筆票根的 ID、擁有者、完整 payload 與時間校驗一致，`quick_check` 為 `ok`。

## 真人驗收

上述自動測試與雲端檢查不等於已取得使用者的 LINE 登入授權。仍需使用者在手機 LINE 開啟 MINI App，完成授權後確認自己的票根、新增及重新開啟持久性。

目前是 Developing 環境，僅限已接受測試邀請的帳號；若 LINE 顯示無存取權限，請在 Roles 檢查測試者與登入的 LINE 帳號。Published 尚未啟用，不宣稱已公開給所有使用者。

建立步驟與後續切換說明見 [LIFF / MINI App 設定](liff-setup.md)。先前 [2026-10-26 的驗證紀錄](verification-04.md) 描述首次部署時尚無 LIFF 的狀態，本文件為本次更新後的狀態。
