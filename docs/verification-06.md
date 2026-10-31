# Bot 06 Flex Message 驗證紀錄

日期：2026-10-30（Asia/Taipei）。部署來源：`66037c4509b3c1309a972b30d4287b6da5bc09d1`。

## 範圍

本版把 Google ADK `cinema_schedule`／`cinema_compare` 的成功結果改成 LINE Flex carousel，每頁五部電影，含介紹、版本、時間與分頁按鈕。多版本保留在同一作品卡片內，不混合時間；無資料或無法解析時仍回覆現況及來源。一般全台推薦與附近影院的彙整沿用既有格式。

原有四格 Rich Menu、Published MINI App、私人票匣 API 與草稿確認保留，不增加資料庫欄位。

## 自動測試與版面檢查

- [部署版本 GitHub CI](https://github.com/zonawang/movie-companion-bot-06-flex-message/actions/runs/41079363673)：test、browser 均成功，109 項 Node 測試全部通過。
- 瀏覽器測試包含既有票匣登入及操作，另測五張卡片／第二頁、介紹、完整場次與返回、手機頁面無橫向溢出，以及主按鈕文字可讀。
- 已下載檢查手機、桌面預覽截圖。預覽使用虛構電影及實際 Flex JSON 的 HTML 版面，不是 LINE 官方渲染器。公開的 [手機版面預覽](images/flex-mobile-preview.png) 有標示示範資料。
- 其他測試涵蓋 actor 綁定、過期、錯誤索引、重送事件、來源 URL、同名作品歧義、TMDB 暫時失敗、快取、訊息大小、卡片與票根確認並存，以及呈現失敗時保留真正場次的文字回覆。

## 真實 Gemini / ADK / 資料與 LINE 格式

在切換前的獨立 release 執行 `examples/flex-adk-smoke.mjs`，使用真正的 `gemini-3.5-flash-lite`、ADK Runner、誠品公開時刻表與 TMDB；票根資料庫為隔離的記憶體資料庫。

- 「誠品現在有哪些電影好看？」確實呼叫 `cinema_schedule`；未使用 `now_playing` 或 `recommend_movies` 的全台候選替代影城片單。最終版本取得文字說明與 Flex 回覆，LINE 格式驗證為 200。
- 明確指定公告日期及完整片單時取得三張真實電影卡片；電影介紹與完整場次皆通過 LINE `validate/reply`。
- 同一查詢的虛構多頁 fixture 另驗證首／次頁 Flex JSON；不將它當成真實影城片單。
- 確認測試 actor 沒有新增票根或待確認草稿；沒有向使用者推播或送出測試訊息。

查詢時間較晚時，依模型產生的時間條件及來源公告，可能沒有剩餘場次；此時以實際工具狀態說明，不補造電影。以上是指定案例的驗證，未宣稱所有自然語言問法都會產生相同工具順序。

## 正式服務與資料保存

- Google Compute Engine 原主機來源更新為 Bot 06；systemd `movie-bot` 為 active，release symlink 指向上述部署版本。
- 公開 `/health` 與 `/tickets/` 為 200，`X-Movie-Bot-Version: 06`；簽章空事件 Webhook 為 200。
- Published LIFF ID 仍是 `2012222034-AVyO2nk3`；未登入讀取私人票匣 API 回傳 401。
- LINE Bot 仍為 Zona Movie `@796qcwyz`，Rich Menu 預設仍是 `richmenu-84a49e99500597707f98168075c09c7f`。這次沒有替換圖稿或個別使用者綁定。
- 更新前建立 `/var/lib/movie-bot/pre-flex-20261030.sqlite`；更新後兩筆正式票根的 ID、擁有者、完整內容與建立時間雜湊一致，SQLite `quick_check=ok`。

新版 Flex 已在 LINE API 驗證完成並啟用後端。真人手機上的字體、海報、滑動及按鈕操作，仍待使用者實際確認。

## 同日調整：每頁十張

使用者要求每次顯示十張卡片，已將 `PAGE_SIZE` 改為 10。以上五張的說明是首次上線紀錄，目前以本段的十張設定為準。

- 部署來源：`b55b15a68b8e902960f2de040561a8290df6afdb`；[GitHub CI](https://github.com/zonawang/movie-companion-bot-06-flex-message/actions/runs/41081501408) 的 109 項測試、票匣及卡片瀏覽器測試全部通過。
- fixture 擴充到十二部，驗證第一頁十張、第二頁兩張、返回上一頁十張；更新說明與手機預覽圖。
- 預設封面與海報兩種樣式的十張／兩張訊息，共四組 LINE `validate/reply` 均回傳 200。十張 carousel 分別為 15,012／12,372 bytes，低於 50 KB；海報樣式使用明確的示範資料，只驗證 JSON，不傳送訊息或宣稱示範海報是實際電影資料。
- 正式 release 的呈現模組再次確認每頁十張及分頁正常。服務 active，health、票匣與簽章空事件 Webhook 正常，Rich Menu 與 Published MINI App 設定一致。
- 更新前備份 `/var/lib/movie-bot/pre-flex-ten-20261030.sqlite`；兩筆原有票根完整資料校驗一致，SQLite `quick_check=ok`。
- 舊聊天室訊息維持原本的卡片數量，重新查詢後使用新設定。實際作品不足十部時，只顯示查到的數量。真人手機顯示仍待使用者確認。

## 同日調整：卡片列末尾的換批入口

- 部署來源：`277a94de5bed2f30ff42d87b3cc46fd6d8b5f9c4`；[GitHub CI](https://github.com/zonawang/movie-companion-bot-06-flex-message/actions/runs/41082342367) 的 111 項測試與瀏覽器測試均通過。
- 每批保留最多十部電影，另加一張同寬導航卡。第一批提供「下一批電影 →」，中間批可前後切換，最後一批提供「← 上一批電影」並標示已到最後。只有一批時不加換批卡；十、二十部等整數邊界不會產生空白下一批。
- 使用二十一部虛構電影驗證首／中／末批，預設封面與海報兩種樣式共六組 LINE `validate/reply` 均為 200。十部電影加導航共十一個 bubbles，最大的範例為 16,595 bytes，低於十二個 bubbles 與 50 KB 限制。示範海報僅驗證 JSON，不傳送訊息。
- 瀏覽器測試直接滑到導航卡並點換批，檢查最後一批返回正常；已檢視 [換批卡片預覽](images/flex-navigation-mobile.png) 與 [最後一批預覽](images/flex-last-page-mobile.png)。圖片使用虛構資料的開發用 HTML，非 LINE 官方渲染截圖。
- 仍使用相同 actor 綁定與十分鐘 snapshot，不增加模型呼叫或讀寫私人票根；保留原快速分頁按鈕。
- 正式服務 active，部署模組確認十張電影卡加一張導航卡及前後切換；公開 health、票匣、私有 API 權限與簽章空事件 Webhook 正常，Rich Menu／Published MINI App 保留。
- 更新前備份 `/var/lib/movie-bot/pre-flex-navigation-20261030.sqlite`，兩筆票根完整資料雜湊一致，SQLite `quick_check=ok`。舊訊息維持原樣，重新查詢後才出現新導航卡；手機實際呈現仍待使用者確認。

## 同日調整：無海報時的電影主題插畫

- 部署來源：`da4227e6eed18f18f863e68ebc2bcc3fdd3d9f34`；[GitHub CI](https://github.com/zonawang/movie-companion-bot-06-flex-message/actions/runs/41083939165) 的 112 項 Node 測試與瀏覽器測試均成功。
- 缺少明確配對的海報時，改用內建 image_gen 產生的無文字電影院插畫，已移除原本的標語文字封面；已配對海報繼續優先顯示。素材及完整提示見 [封面圖片](../public/assets/poster-fallback-v1.jpg) 與 [生成紀錄](../assets/poster-fallback-v1.prompt.md)。
- 選定插畫輸出為 768×1024 JPEG、210,958 bytes，符合 LINE Flex 圖片尺寸與格式限制；僅做交付尺寸及 JPEG 格式轉換，沒有修改插畫內容。
- 前端預覽內嵌相同 JPEG，瀏覽器確認十張圖片解碼成功、舊標語消失，且分頁、介紹與完整場次操作正常。已更新並檢視手機預覽圖；仍屬開發用 HTML，非 LINE 官方渲染器。
- 正式公開網址 `/tickets/assets/poster-fallback-v1.jpg` 的 GET／HEAD 皆回傳 200，MIME 為 `image/jpeg`，公開版本化快取、不設定登入 cookie。下載圖片與部署檔案的 SHA-256 相同：`e4993b058d9570a4b5863c2c252a824b5f67c9517d1dee2b2106acfa574485c7`。
- 替代插畫與海報樣式的 LINE 格式驗證皆為 200，部署後亦再次驗證使用正式公開圖片網址的訊息格式。未推送測試訊息。
- 服務 active，health、票匣、私有 API 權限與簽章空事件 Webhook 正常，Rich Menu／Published MINI App 保留。更新前備份 `/var/lib/movie-bot/pre-flex-artwork-20261030.sqlite`；原有兩筆票根完整校驗一致，SQLite `quick_check=ok`。
- 重新查詢後才套用新封面；既有聊天室訊息保留原本內容。實際手機端仍待使用者確認。
