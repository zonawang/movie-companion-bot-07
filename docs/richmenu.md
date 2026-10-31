# 四格 Rich Menu 設計

承接 Bot 04 的 Published MINI App，讓聊天使用者可以直接找到原本功能。沒有另建一套使用者或票根資料。

## 四格動作

| 位置 | 標籤 | LINE 動作 | ADK 與後續流程 |
| --- | --- | --- | --- |
| 左上 | 電影查詢 | postback `menu:movies` | ADK `open_movie_feature(movies)`，引導片名／上映候選／影城場次；後續呼叫原電影工具 |
| 右上 | 我的票匣 | URI | 直接開 Published MINI App；對話中也能由 ADK `open_movie_feature(shelf)` 取得相同網址 |
| 左下 | 附近影院 | postback `menu:nearby` | ADK `open_movie_feature(nearby)` 提供位置分享按鈕；收到位置後仍由 ADK 呼叫 `nearby_cinemas` |
| 右下 | 幫我挑電影 | postback `menu:recommend` | ADK `open_movie_feature(recommend)` 引導偏好，再呼叫 `recommend_movies` 查資料與篩選 |

查詢／引導使用 `InMemoryRunner` 與 `FunctionTool`，不把 Rich Menu 當作單純的關鍵字固定回覆。入口工具的文案、quick replies 與網址由程式控制；不讓模型憑空產生可點擊的身分驗證連結。

第二、四格依使用者要求直接開啟頁面，不額外等模型回應。四格功能都可由 agent 在對話中開啟，但 URI 點擊本身不是一次 ADK 呼叫，票匣 API 也不需要把每次查閱、修改交給模型。

## 位置與記錄

LINE 的 Location action 只能放在 quick reply，因此左下先進入 ADK 引導，再提供「分享我的位置」。點選前不取得座標；也可用文字輸入地標。後續沿用 Bot 03 的座標驗證、位置期限與 Maps／場次來源。

新票根連結只代表使用者想開表單。前端在 `liff.init()` 及後端登入完成後，讀取 `action=new`；LINE 導回參數交給 SDK 處理，外部瀏覽器登入時保留新建意圖。開表單不寫入資料，只有使用者填好並儲存後才新增。取消或重新整理不會自動重複新增。

## 發佈順序與回復

1. 檢查現有選單與正式 MINI App 設定，準備圖檔與 Rich Menu JSON。
2. 程式通過測試並部署到原服務，保留原 SQLite。
3. 用 LINE 官方驗證 endpoint 驗證 JSON。
4. 建立／復用以內容雜湊命名的選單，上傳 PNG，下載比對雜湊。
5. 圖片驗證成功後才改預設選單，重新讀取確認。

checkpoint 保存原預設 ID 與目前安裝階段，不含 channel access token。`rollback` 恢復原 API 預設，或在原本沒有 API 預設時移除此版本的預設；不刪除舊選單或個別使用者綁定。若其他人已更改預設，停止回復。

## 官方參考

- [建立與使用 Rich Menu](https://developers.line.biz/en/docs/messaging-api/using-rich-menus/)
- [LINE Actions：postback、URI 與 location quick reply](https://developers.line.biz/en/docs/messaging-api/actions/)
- [LIFF URL 與導回參數](https://developers.line.biz/en/docs/liff/opening-liff-app/)
