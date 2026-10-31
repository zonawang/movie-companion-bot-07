# 電影夥伴 Bot 04 LIFF 隱私說明

本專案提供電影查詢、附近影院與使用者確認後的個人票根收藏。這是可自行執行的開源學習專案；部署者負責保管本機資料並提供聯絡方式。

## 位置與對話

- 提供地址、地標或傳送 LINE 位置時，查詢所需資訊會送至 Google Maps Platform，以找出位置與附近影院。
- LINE 的經緯度由程式傳給地圖服務，不加入 Gemini 的文字提示或工具結果；模型會看到查詢問題、影院地址、來源連結與距離。文字輸入的地址／地標會和一般訊息一起交由 Gemini 處理。
- LINE 定位的座標在對話記憶體最多保留 15 分鐘；到期會清除該對話，停止或重新啟動服務時也會清除。輸入「清除位置」可立即清除目前對話與定位，已儲存票根另行保留。
- LINE webhook 待處理事件會暫存在部署主機的 SQLite，包含事件 ID、使用者 ID、reply token 與座標；完成、失敗或事件過期後清空內容，只保留去重 ID、狀態與時間。服務停止期間尚未處理的事件會留待下次啟動清除。需清除磁碟備份或 SQLite 歷史頁面的使用者，應由部署者另行管理保存期限。
- Google Maps 查詢結果不由本程式建立持久快取；必要的結果會留在 ADK 記憶體對話供後續問答使用。未含 LINE 定位的對話最多 20 回合，閒置超過 30 分鐘後於後續處理時清除。

## 票根

票根由你提供資料並按確認後儲存於部署者的 SQLite。LINE 原始經緯度不加入票根；你自行在文字訊息輸入的地址可能成為原始訊息的一部分，並隨票根草稿確認保存。模型不能直接替你確認。各使用者只能經 Bot 或登入後的票匣查自己的票根。

票匣表單按下儲存後直接寫入同一 SQLite，新增與編輯不呼叫 Gemini。搜尋電影名稱會傳給 TMDB；不傳送心得、同伴或 LINE 使用者 ID 給 TMDB。手動填寫片名則不需要電影資料查詢。

票匣使用 HttpOnly、Secure、SameSite=Lax cookie 保存短期 session；session 與單次入口只存在伺服器記憶體，不寫入瀏覽器 localStorage。正式 LIFF 登入會將 ID token 送至 LINE 官方驗證；未提供 ID token 時，後端驗證使用者 access token 的 Channel ID、有效期及授權，再向 LINE 取得必要的使用者 ID 與顯示名稱。token 不寫入日誌或資料庫，且不信任前端自行提供的使用者身分。未設定 LIFF 時使用 Bot 發出的兩分鐘單次專屬入口，請勿轉傳。登入 session 最長一小時，重啟服務即失效。

刪除票根時同步刪除資料庫中的票根與對應聊天草稿；去重請求 ID 仍保留，防止舊請求重新新增。SQLite 歷史頁面與每日備份可能保留舊內容；目前每日備份保留最近七份，且與主資料庫位於同一磁碟。若需處理備份中的資料刪除，請聯絡部署者。示範模式只使用頁面記憶體中的虛構資料，重新整理即還原。

## 第三方服務

- [Google 隱私權政策](https://policies.google.com/privacy)
- [Google Maps／Google Earth 額外服務條款](https://maps.google.com/help/terms_maps/)
- [LINE 隱私權政策](https://terms.line.me/line_rules/)
- [TMDB 隱私權政策](https://www.themoviedb.org/privacy-policy)

部署者須依實際使用的 Gemini／Google Cloud 服務方案確認資料處理與保存設定。本程式不在日誌輸出金鑰、精確定位或上游錯誤內文。
