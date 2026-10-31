# 幫我挑電影

四格選單現在是「電影查詢／我的票匣／附近影院／幫我挑電影」。電影查詢適合已有片名；幫我挑電影適合還沒決定想看什麼。新增心得仍在 MINI App 票匣內，也保留聊天開啟表單的能力。

點第四格會送出 `menu:recommend`，由 Google ADK 的 `LlmAgent`、`InMemoryRunner` 呼叫 `open_movie_feature(recommend)`，回覆心情／類型的問題與三個快速選項。使用者說出偏好後，ADK 將對話轉成 `recommend_movies` 的結構化參數；後續修改類型時要保留先前的排除條件。沒有偏好時先詢問；明確要求隨便推薦則按人氣選取。

`MovieSource.recommendationCandidates()` 查詢 TMDB `movie/now_playing` 的 `region=TW` 前兩頁，最多讀取 40 筆，去除重複與無效 ID、成人標記，保留電影類型。程式依指定類型、心情對應類型及排除類型篩選，最多回傳三部；同分使用 TMDB 人氣排序。明確要求同時符合多種類型時，使用交集。

推薦片名、網址和理由由工具結果產生，模型不能自行添加電影或保證評價。理由描述類型配對；心情不是電影品質或內容保證，同行者也不等於已確認年齡分級。排除類型時，缺少類型的電影不列入。候選不足只列實際符合的數量；查無結果或連線失敗如實說明，不切換成虛構示範資料。部分頁面失敗會明示候選不完整。

這是 TMDB 上映候選，不等於特定影城今日場次、即時座位或票價。使用者可接著指定城市與分館，沿用既有 ADK 場次工具查詢。推薦不讀取私人票根，也不新增草稿或儲存紀錄。

資料介面依據：[Now Playing](https://developer.themoviedb.org/reference/movie-now-playing-list)、[電影類型](https://developer.themoviedb.org/reference/genre-movie-list)。

驗證：`node --test test/*.test.mjs`；正式環境可執行 `node --env-file=/etc/movie-bot/environment examples/recommendation-adk-smoke.mjs`，使用真實 Gemini 與 TMDB、記憶體資料庫測試入口、喜劇排除恐怖與多輪改選動作片，不發送 LINE 訊息。

更新選單時使用新的 checkpoint，保留前版預設選單：

```sh
node --env-file=/etc/movie-bot/environment scripts/richmenu.mjs apply --state-file /var/lib/movie-bot/richmenu-install-05-recommend.json
# 如需恢復前一版
node --env-file=/etc/movie-bot/environment scripts/richmenu.mjs rollback --state-file /var/lib/movie-bot/richmenu-install-05-recommend.json
```

`verification-05.md` 記錄的是首次上線的舊版四格選單；本文件描述推薦改版。

## 2026-10-30 正式環境驗證

- 部署來源：`71645d9f81641359483d7fe70a41e9265bf9b3d8`；[GitHub CI](https://github.com/zonawang/movie-companion-bot-05-richmenu/actions/runs/41049117708) 的 100 項測試與 Chromium 票匣流程全部通過，並檢查新增票根表單截圖。
- 真正 Gemini / Google ADK / TMDB 實測：先開啟推薦引導，再推薦喜劇、排除恐怖，取得三部候選；下一輪改成動作片時保留排除恐怖限制，同樣取得三部。工具序列為 `open_movie_feature → recommend_movies → recommend_movies`。使用隔離的記憶體資料庫，票根寫入數為零。
- Zona Movie 的 LINE 預設選單已切換為 `richmenu-84a49e99500597707f98168075c09c7f`，核對四格定義與下載圖片 SHA-256：`947a02120245d7343ab495256eba637cf927cef5315b83bc5aeeafd1933bb810`。
- 前版選單 `richmenu-64267f4e8b458bcfbae74a0d20df99c3` 保留，checkpoint 記錄可供回復。
- 四種入口訊息經 LINE `validate/reply` 全部回傳 200；沒有向使用者推播測試訊息。簽章空事件 Webhook 回傳 200。
- 正式服務為 active，公開 `/health` 與 `/tickets/` 回傳 200。更新前後兩筆正式票根的完整資料雜湊相同，SQLite `quick_check=ok`。更新前備份為 `/var/lib/movie-bot/pre-recommend-20261030.sqlite`。
- 尚未由使用者在手機上確認新版選單；LINE API 的設定與內容已核對完成。
