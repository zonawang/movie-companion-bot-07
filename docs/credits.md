# 電影夥伴｜關於與資料來源

電影夥伴是使用 Google ADK 與 LINE Messaging API 的個人學習專案，提供電影查詢與個人觀影票根紀錄。

## 電影資料

<a href="https://www.themoviedb.org"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg" alt="TMDB" width="140"></a>

This product uses the TMDB API but is not endorsed or certified by TMDB.

電影片名、簡介、上映候選清單與使用者評論連結來自 [The Movie Database（TMDB）](https://www.themoviedb.org)。本專案不宣稱擁有這些資料或圖片的著作權，也不代表 TMDB 背書。

上映清單使用 `region=TW` 與 `language=zh-TW` 查詢，不代表台灣所有影院目前都有場次。場次仍需到影城官網確認。

評論目前查詢繁中使用者評論，只提供作者與原文連結；原文可能包含劇透。這些內容不代表專業影評、全面調查或整體觀眾共識。沒有評論時會如實告知。

## 松菸誠品的場次

松菸誠品電影片單與時間來自 [誠品電影院官方時刻表](https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001)，使用 [官方訂票入口](https://arthouse.eslite.com/visAgreement.aspx) 連回售票網站。與 TMDB 的一般上映清單分開處理。

只整理必要的片名、日期與公告場次，不複製完整電影介紹或海報。回覆附上更新與讀取時間，可能使用 5 分鐘快取；場次異動與售票狀況以誠品官方為準。本專案與誠品沒有合作或背書關係。

## 全台威秀與 MUVIE 的場次

全台 20 間威秀及 2 間 MUVIE 的來源與官方入口列於 [分館覆蓋表](vieshow-coverage.md)。例如 [開眼電影網信義分館時刻表](https://www.atmovies.com.tw/showtime/t02a01/a02/) 與 [西門分館時刻表](https://www.atmovies.com.tw/showtime/t02b08/a02/)，是第三方資料，不是威秀官方 API。程式目前直接讀取威秀官網收到 HTTP 403，因此以公開開眼分館頁面實作。

回覆附來源與讀取時間，不虛構官方更新時間，並提供 [信義威秀官方入口](https://www.vscinemas.com.tw/theater/detail.aspx?id=1) 與 [西門威秀官方入口](https://www.vscinemas.com.tw/theater/detail.aspx?id=31)。第三方資料可能延遲、版本不完整，實際場次與售票仍以威秀為準。沒有座位、票價或代訂票。

僅整理片名、日期、版本與場次，不複製海報或完整介紹。與開眼及威秀沒有合作或背書關係。

## 其他品牌與地方戲院

已依開眼目錄登錄 108 個影城／放映場館，完整來源與能力見 [全台覆蓋表](taiwan-coverage.md)。102 個有可解析場次，6 個僅圖片時刻表；圖片入口不自動生成時間。其他據點主要使用開眼第三方資料；文心秀泰、長春國賓與澎湖 in89 另有下列官方公開場次備援。

其他影城的網站連結由來源頁提供，回覆會明確標示。品牌／名稱分組不是股權或經營權認定。本版未宣稱已取得各品牌官方 API 或涵蓋全台所有營業場所。

## 指定分館的官方備援（2026-10-31）

開眼回傳舊日期、無法讀取或查無有效當日場次時，以下分館會使用獨立核對的官方公開資料：

- [台中文心秀泰官方場次表](https://www.showtimes.com.tw/cinemas/56/)：讀取頁面顯示的所有日期與版本；JSON-LD 只作年份依據，避免被前一百個事件的截斷範圍限制。
- [台北長春國賓官方時刻表](https://www.ambassador.com.tw/home/Showtime?ID=453b2966-f7c2-44a9-b2eb-687493855d0e)：帶入查詢日期，核對分館 UUID 與實際選中的日期。
- [澎湖 in89 官方電影時刻](https://www.in89cinemax.com/film_list.aspx?TheaterId=14)：使用該公開頁面載入的 `getStagesByDate` 只讀資料，核對專用主機、影城識別與名稱；無須登入、cookie 或會員 session。

回覆標示實際使用的來源，不混用舊日期或同品牌其他分館。僅回傳片名、版本、日期與時間，不提供座位、票價或代訂票；仍以影城最新公告為準。本專案與上述影城沒有合作或背書關係。

## 你的票根

個人票根由你提供片名、日期、同伴與心得，確認後才儲存。原始心得與電影資料分開處理，模型不會自行替你確認。對話內容與工具結果會送交 Gemini 處理；金鑰不會交給模型。

目前使用部署主機的 SQLite 保存票根。bot-03 已部署至 Google Compute Engine 持久磁碟，詳見 [部署說明](deployment.md)。

## 參考

- [TMDB API 與標示規範](https://developer.themoviedb.org/docs/faq)
- [TMDB 官方標誌](https://www.themoviedb.org/about/logos-attribution)
- [Google ADK](https://adk.dev/)
- [LINE Messaging API](https://developers.line.biz/en/docs/messaging-api/overview/)

## 附近影院與 Google Maps

Bot 03 透過 Google Maps Platform Places API (New) 的 Text Search 與 Nearby Search 查詢地標、地址及影院。這是現有 ADK Agent 的自訂 FunctionTool，不是 Gemini 內建的 Google Maps grounding 工具，也沒有啟用 Grounding Lite MCP。

地點名稱、地址與位置來源標示為 Google Maps，保留地圖入口及回傳的第三方提供者。距離由程式依座標估算直線距離。場次不由地圖提供，仍使用上面列出的來源。

- [附近影院設計與設定](map-grounding.md)
- [Google Maps Places API](https://developers.google.com/maps/documentation/places/web-service/overview)
- [Google Maps 來源標示規範](https://developers.google.com/maps/documentation/places/web-service/policies)
- [使用條款](terms.md) 與 [隱私說明](privacy.md)
