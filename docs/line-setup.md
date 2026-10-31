# LINE 設定與切換到 Bot 03

可沿用既有電影 Bot 帳號，或依下方步驟建立新帳號。程式不會自動更改原帳號 webhook。

## 沿用既有帳號

1. 在本機為 bot-03 建立 `.env`，使用同一個 LINE channel 的 secret、access token，以及 Gemini／TMDB 設定；新增 GOOGLE_MAPS_API_KEY，啟用 Places API (New)。不要把金鑰貼在聊天或提交 GitHub。
2. 停止目前 bot-02 服務；若要保留既有票根，先備份 SQLite，再設定 `SQLITE_PATH` 指向原資料庫，或在舊服務關閉後複製到新版 `data/`。不要讓兩個程式同時處理同一份資料。
3. 啟動 bot-03。若使用同一個本機連接埠且原 tunnel 仍在，原 webhook 可能可繼續使用；否則更新到新 tunnel 的 `/webhook`，執行 Verify 並確認 Use webhook。
4. 在手機問「信義威秀今晚六點後有哪些片？」、「比較信義和西門威秀今晚場次」，再查回原有票根，確認切換結果。

2026-10-26 本次已設定 Maps key 並將既有 Zona Movie 切到雲端 bot-03，官方 webhook 驗證 200，原有 1 筆票根內容核對一致。詳細資源見 [部署說明](deployment.md)。以下為自行部署或更換其他帳號的操作步驟；本版 .env.example 使用 3002。

以下為建立新帳號的選用步驟。

## 1. 建立官方帳號

開啟 [LINE Official Account Manager](https://manager.line.biz/)，用 LINE Business ID 登入並建立新帳號。可先取名「電影夥伴」，依畫面填寫必要資料。

進入新帳號的「設定 → Messaging API」，選擇啟用 Messaging API，再選擇你的 Provider。未來電影服務若有 LINE Login 或 MINI App，應規劃放在相同 Provider，方便使用者身分對應。

Provider 選擇後不能任意更換，請確認這是你要用於電影服務的 Provider。這是 LINE 官方平台設定，不是本專案的程式限制。

參考：[官方建立流程](https://developers.line.biz/en/docs/messaging-api/getting-started/)。

## 2. 把新帳號的金鑰填入本機

到 [LINE Developers Console](https://developers.line.biz/console/)，開啟剛才 Provider 裡的新 Messaging API channel。

- Basic settings：找到 **Channel secret**，填入本機 `.env` 的 `LINE_CHANNEL_SECRET`。
- Messaging API：在 **Channel access token** 區域核發測試使用的 token，填入 `LINE_CHANNEL_ACCESS_TOKEN`。開發練習可使用長效 token；正式服務再規劃符合需求的權杖期限與輪替方式。
- 同一份 `.env` 填入 `GEMINI_API_KEY`。可以使用你已有、仍有效的 Gemini key，也可以從 [Google AI Studio](https://aistudio.google.com/api-keys) 建立。

**金鑰只填本機檔案，不要貼給別人。** 不必使用舊 Cafe Bot 的 LINE token，這次要填新帳號的兩個 LINE 設定。

## 3. 啟動這個 repo

在 repo 資料夾執行：

```bash
npm ci --ignore-scripts
cp .env.example .env
```

如果 `.env` 已經填好，請跳過 `cp`，避免蓋掉設定。填好後執行：

```bash
npm start
```

瀏覽器開啟 `http://127.0.0.1:3002/health`，應看到 `{"status":"ok","app":"movie-companion-bot"}`。

保留這個終端機開著。缺少金鑰時，程式會直接列出缺少的變數名稱，不會顯示金鑰值。

## 4. 給 LINE 一個 HTTPS webhook URL

本機測試可使用 [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。先依官方文件安裝 `cloudflared`；macOS 如果已有 Homebrew，可用 `brew install cloudflared`。

在另一個終端機執行：

```bash
cloudflared tunnel --url http://127.0.0.1:3002
```

它會輸出一個臨時 HTTPS 網址，例如 `https://example.trycloudflare.com`。這是範例，請使用你自己的實際網址。

到 LINE Developers → Messaging API → Webhook URL 填入：

```text
https://你的實際網址.trycloudflare.com/webhook
```

按 **Verify**，成功後啟用 **Use webhook**。tunnel 重新啟動時網址可能改變，屆時要重新設定。Quick Tunnel 只供開發測試；終端機或電腦關閉後 bot 就無法接收訊息。

參考：[LINE Bot 的 webhook 設定](https://developers.line.biz/en/docs/messaging-api/building-bot/)。

## 5. 加好友並測試

在 Messaging API 頁面找到新帳號 QR Code，用自己的 LINE 加好友。

到官方帳號的回應設定檢查自動回覆與歡迎訊息；這份程式已處理加好友歡迎訊息，若平台也開著同類訊息，可能會收到兩則。初次測試可關閉平台預設的自動回覆，方便觀察 agent 的回答。

先傳 LINE 的「位置」，再問「改找五公里內的影院」。也可傳「我在台北車站，附近三公里今晚六點後有哪些電影？」；新功能需要 Maps key。

若使用 demo 模式，可再傳「最近有什麼電影可以查？」。終端機應依序看到 ADK 發出模型請求與 `[ADK tool] now_playing`，LINE 應收到明確標示的示範電影。此時尚未接 TMDB，不是真實上映資料。

再傳「我 2026-10-25 跟小安看了月台上的貓，心得是配樂很好聽」，檢查下方草稿，點確認，再問「我跟小安看過什麼？」。

## 常見狀況

| 狀況 | 先檢查 |
| --- | --- |
| Verify 失敗 | server 與 tunnel 是否都在執行；網址結尾是否是 `/webhook`；secret 是否屬於這個新 channel |
| Verify 成功但沒回覆 | Use webhook 是否開啟、token 是否正確、終端機是否有 ADK 或 LINE 錯誤 |
| AI 連線逾時 | Gemini key、模型與網路；此版有時間上限與失敗提示，不會無限等待 |
| 票根沒有存入 | 是否真的按了確認、是否超過 10 分鐘、是否由建立草稿的同一人操作 |
| 出現 SQLite 提示 | Node 版本可能標示內建 SQLite 為實驗功能；若程式可執行可繼續；先確認 Node 24.13 以上 |
| 群組裡沒有回覆 | 第一版只支援一對一聊天，避免把私人票根送到群組 |

實際 LINE 帳號、金鑰與外部網址還沒設定前，測試通過僅代表本機流程可用，不代表手機已經能收到訊息。
