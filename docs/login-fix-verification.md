# MINI App 登入相容性修正

日期：2026-10-27（Asia/Taipei）。部署版本：`26a4e1bab739b082cf510a2c0b208ca5ac8f723c`。

## 使用者回報與原因

手機開啟 Published 票匣後，點「使用 LINE 登入」仍顯示「登入未提供身分資訊，請確認 LIFF 的 openid 權限」。這個分支表示 SDK 已回報登入成功，但 `getIDToken()` 為空；舊流程只接受 ID token，因此再按按鈕仍走到同一個錯誤，沒有其他身分驗證途徑。

這個訊息不能單獨證明 channel 的 openid 設定錯誤。修正改為相容 LINE 官方支援的兩種憑證，避免要求使用者反覆點擊無效的登入流程。

## 修正

- 優先驗證 ID token；沒有 ID token 時，改用 SDK 的使用者 access token。必要時先透過 SDK 取得 profile 授權。
- 後端先向 LINE 驗證 access token，核對 `client_id` 必須是 Published Channel `2012222034`、有效期及 profile scope，再使用同一 token 向 LINE 取得 profile。只有 LINE 伺服器回傳的 userId 能成為資料擁有者。
- 不接受瀏覽器傳入的 userId、profile 或同時混用兩種憑證。錯誤 channel、過期、缺少 scope、錯誤 profile 與上游失敗都不建立 session。
- 登入按鈕會顯示進度，防止同時重複操作。SDK 載入及初始化有等待上限，失敗後恢復按鈕，載入失敗也能重新下載 SDK。
- 失敗畫面提供正式 MINI App 的「重新在 LINE 開啟」連結。
- token 不寫入資料庫、日誌或額外的瀏覽器持久儲存，原 HttpOnly session、Origin／CSRF 與使用者資料隔離維持不變。

參考：[LINE 官方的伺服器身分驗證方式](https://developers.line.biz/en/docs/liff/using-user-profile/)。

## 驗證

- 本機 87 項測試通過；[部署版本 CI](https://github.com/zonawang/movie-companion-bot-04-liff/actions/runs/40513959747) 的 test 與 browser 全數通過。
- 手機瀏覽器回歸測試以測試 SDK 重現 `isLoggedIn() = true`、`getIDToken() = null`：確認 access token 送往後端、profile 同意後重新讀取 token、前端 profile 不作為身分依據，以及第一次後端失敗後點登入可成功重試。
- 另測試 SDK 網路失敗後重新點擊可載入成功；原 ID token 流程、LINE 導回參數與一次性入口仍通過。
- 雲端正式 API 對無效的 ID token、access token 均回 401，沒有發出 session cookie；未登入私人 API 亦為 401。
- Published ID 及正式入口維持 `2012222034-AVyO2nk3`。線上 JS 已包含修正，health 與票匣頁面為 200，systemd、Caddy、備份 timer 均正常。
- 更新前建立 `/var/lib/movie-bot/pre-login-fix-20261027.sqlite`；更新後既有 1 筆票根校驗一致，SQLite `quick_check` 為 `ok`。

自動回歸測試使用模擬授權憑證，沒有取得或代替真人的 LINE 授權。修正部署後，使用者已於 2026-10-27 回報手機登入成功。本次真人回報確認登入可用，尚未另行記錄全部新增、編輯、刪除及重新開啟持久性的人工驗收。
