import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync(resolve('assets'), { recursive: true });
mkdirSync(resolve('docs/images'), { recursive: true });

function ticketHtml({ includeDate = true } = {}) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: "PingFang TC", "Heiti TC", "Noto Sans CJK TC", sans-serif; }
  body { background: #efeae1; width: 880px; height: 480px; display: flex; align-items: center; justify-content: center; }
  .ticket { width: 800px; height: 410px; background: #fffdf8; border: 3.5px solid #243d34; border-radius: 22px; display: flex; overflow: hidden; box-shadow: 0 12px 28px rgba(36,61,52,0.08); }
  .main { flex: 1; display: flex; flex-direction: column; border-right: 3px dashed #8fa199; }
  .header { background: #243d34; color: #fffef5; padding: 20px 32px; font-size: 24px; font-weight: 700; letter-spacing: 1px; }
  .content { padding: 26px 32px; display: flex; flex-direction: column; gap: 18px; flex: 1; }
  .label { font-size: 16px; color: #607169; font-weight: 600; margin-bottom: 4px; }
  .title { font-size: 36px; color: #182b24; font-weight: 800; }
  .row { display: flex; gap: 48px; }
  .val { font-size: 30px; color: #182b24; font-weight: 700; }
  .missing { background: #e3dfd6; color: #736f68; padding: 14px 20px; border-radius: 10px; font-size: 20px; font-weight: 600; }
  .meta { font-size: 20px; color: #384d45; font-weight: 600; margin-top: auto; }
  .fine { font-size: 15px; color: #788780; }
  .stub { width: 220px; padding: 28px 24px; background: #f8f5ec; display: flex; flex-direction: column; gap: 14px; }
  .stub-head { font-size: 20px; font-weight: 700; color: #243d34; border-bottom: 2px solid #d5ddd8; padding-bottom: 10px; }
  .stub-title { font-size: 22px; font-weight: 700; color: #182b24; }
  .stub-info { font-size: 19px; color: #384d45; font-weight: 600; line-height: 1.5; }
  .stub-no { margin-top: auto; font-size: 16px; color: #788780; font-family: monospace; }
</style>
</head>
<body>
  <div class="ticket">
    <div class="main">
      <div class="header">松菸誠品電影院 · ESLITE ART HOUSE</div>
      <div class="content">
        <div>
          <div class="label">電影片名 MOVIE</div>
          <div class="title">進擊的鼓手</div>
        </div>
        ${includeDate ? `
        <div class="row">
          <div>
            <div class="label">觀影日期 DATE</div>
            <div class="val">2026-10-31</div>
          </div>
          <div>
            <div class="label">開演時間 TIME</div>
            <div class="val">19:30</div>
          </div>
        </div>` : `
        <div class="missing">（票面下半部日期區塊裁切／模糊）</div>`}
        <div class="meta">影廳：A 廳 &nbsp;|&nbsp; 座位：5 排 12 號 &nbsp;|&nbsp; 全票 NT$300</div>
        <div class="fine">本券限當日當場次有效，開演後恕不退換 · 測試樣本票根</div>
      </div>
    </div>
    <div class="stub">
      <div class="stub-head">入場存根聯</div>
      <div class="stub-title">進擊的鼓手</div>
      <div class="stub-info">
        ${includeDate ? '2026-10-31<br/>19:30 開演<br/>' : ''}A 廳 5 排 12 號
      </div>
      <div class="stub-no">NO. 004821</div>
    </div>
  </div>
</body>
</html>`;
}

function flowDiagramHtml() {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: "PingFang TC", "Heiti TC", "Noto Sans CJK TC", sans-serif; }
  body { background: #fbf9f4; width: 1200px; padding: 48px 60px; color: #182c34; }
  .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .eyebrow { color: #2d6a54; font-size: 18px; font-weight: 700; letter-spacing: 0.8px; }
  .badge { background: #e6f0ea; color: #2d6a54; padding: 8px 20px; border-radius: 99px; font-size: 17px; font-weight: 600; }
  h1 { font-size: 36px; font-weight: 800; margin-bottom: 8px; color: #182c34; }
  .sub { font-size: 21px; color: #5a686e; margin-bottom: 28px; }
  .step { border-radius: 20px; padding: 22px 28px; display: flex; gap: 22px; align-items: flex-start; border: 2.5px solid #dce3e6; background: #ffffff; }
  .step.blue { background: #eaf1f8; border-color: #cbdced; }
  .step.amber { background: #f8efe0; border-color: #e6d3b3; }
  .step.green { background: #e8f2ec; border-color: #c3dcd0; }
  .num { font-size: 26px; font-weight: 800; color: #2d6a54; min-width: 42px; padding-top: 2px; }
  .stitle { font-size: 24px; font-weight: 700; margin-bottom: 6px; color: #182c34; }
  .sdesc { font-size: 19px; color: #3c4d54; line-height: 1.5; }
  .arrow { text-align: center; color: #7b8c92; font-size: 22px; line-height: 1.1; margin: 6px 0; font-weight: 700; }
  .foot { margin-top: 24px; font-size: 17px; color: #5a686e; }
</style>
</head>
<body>
  <div class="top">
    <div class="eyebrow">MOVIE COMPANION 07 &nbsp;/&nbsp; GOOGLE ADK MULTIMODAL</div>
    <div class="badge">實作流程示意</div>
  </div>
  <h1>拍一張電影票根：Google ADK 如何把圖片變成待確認草稿</h1>
  <div class="sub">同一個 LlmAgent 與 prepare_ticket 工具，同時接住「文字聊天」與「票根照片」</div>

  <div class="step">
    <div class="num">01</div>
    <div>
      <div class="stitle">LINE 收到票根照片（message.type = image）</div>
      <div class="sdesc">驗證 LINE 簽章、限制 5 MB 以內並檢查 JPG / PNG / WebP 檔案魔數；拒絕外部圖片網址。</div>
    </div>
  </div>
  <div class="arrow">↓</div>
  <div class="step blue">
    <div class="num">02</div>
    <div>
      <div class="stitle">Google ADK · InMemoryRunner + LlmAgent（Multimodal inlineData）</div>
      <div class="sdesc">將圖片轉為 inlineData 連同任務提示送入 runAsync，由 Gemini 辨識片名、觀影日期（YYYY-MM-DD）與影院。</div>
    </div>
  </div>
  <div class="arrow">↓</div>
  <div class="step amber">
    <div class="num">03</div>
    <div>
      <div class="stitle">FunctionTool · prepare_ticket（建立待確認草稿）</div>
      <div class="sdesc">自動填入片名、日期與影院；圖片回合強制將同伴與心得留空，防止把票面印刷字、廳別或座位當成心得。</div>
    </div>
  </div>
  <div class="arrow">↓</div>
  <div class="step blue">
    <div class="num">04</div>
    <div>
      <div class="stitle">清除對話記憶體中的原始圖檔（scrubSessionImages）</div>
      <div class="sdesc">當輪完成後立即釋放 session 裡的圖片 base64，只保留工具呼叫結果，後續追問不必重複上傳大圖。</div>
    </div>
  </div>
  <div class="arrow">↓</div>
  <div class="step green">
    <div class="num">05</div>
    <div>
      <div class="stitle">接著打字補上心得，或直接按「確認儲存票根」寫入 SQLite</div>
      <div class="sdesc">可多輪追問補上同伴與逐字心得更新草稿；使用者點按確認後，才透過 SQLite 交易正式寫入私人票匣。</div>
    </div>
  </div>
  <div class="foot">原始票根照片不寫入硬碟與 SQLite；確認前不會新增任何正式票匣紀錄。</div>
</body>
</html>`;
}

function twoTurnsDiagramHtml() {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: "PingFang TC", "Heiti TC", "Noto Sans CJK TC", sans-serif; }
  body { background: #fbf9f4; width: 1200px; padding: 48px 60px; color: #182c34; }
  .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .eyebrow { color: #2d6a54; font-size: 18px; font-weight: 700; letter-spacing: 0.8px; }
  .badge { background: #e6f0ea; color: #2d6a54; padding: 8px 20px; border-radius: 99px; font-size: 17px; font-weight: 600; }
  h1 { font-size: 36px; font-weight: 800; margin-bottom: 8px; color: #182c34; }
  .sub { font-size: 21px; color: #5a686e; margin-bottom: 28px; }
  .card { border-radius: 22px; padding: 28px 32px; border: 2.5px solid #c5ddd0; background: #e9f2ec; }
  .card.blue { background: #eaf1f8; border-color: #cbdced; }
  .ctitle { font-size: 26px; font-weight: 800; margin-bottom: 12px; color: #182c34; }
  .tool { font-size: 22px; font-weight: 700; color: #2d6a54; margin-bottom: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .line { font-size: 20px; color: #2a3e36; line-height: 1.65; margin-bottom: 6px; }
  .arrow { text-align: center; color: #7b8c92; font-size: 26px; margin: 12px 0; font-weight: 700; }
  .foot { margin-top: 24px; font-size: 17px; color: #5a686e; }
</style>
</head>
<body>
  <div class="top">
    <div class="eyebrow">MOVIE COMPANION 07 &nbsp;/&nbsp; GOOGLE ADK SESSION</div>
    <div class="badge">實測紀錄整理</div>
  </div>
  <h1>第一輪拍票根、第二輪補心得：InMemoryRunner 的兩輪協作</h1>
  <div class="sub">票面提供客觀事實（片名、日期、影院），文字對話補上主觀回憶（同伴、逐字心得）</div>

  <div class="card">
    <div class="ctitle">第一輪 &nbsp;/&nbsp; 傳送《進擊的鼓手》票根照片</div>
    <div class="tool">[ADK tool] prepare_ticket（由 inlineData 票根影像觸發）</div>
    <div class="line">• 辨識欄位：電影《進擊的鼓手》 · 日期 2026-10-31 · 影院 松菸誠品電影院</div>
    <div class="line">• 程式邊界：companions = ""、note = ""（禁止把廳別、座位或票面標語當成個人心得）</div>
    <div class="line">• 回覆待確認草稿與「確認儲存票根／取消」按鈕；當輪結束立即清除記憶體中的圖片位元組。</div>
  </div>
  <div class="arrow">↓</div>
  <div class="card blue">
    <div class="ctitle">第二輪 &nbsp;/&nbsp; 接著打字：「我是跟小安一起看的，心得是最後一段鼓聲太震撼了」</div>
    <div class="tool">[ADK tool] prepare_ticket（InMemoryRunner 延續上一輪的片名、日期與影院）</div>
    <div class="line">• 更新草稿：補上同伴「小安」、逐字比對通過心得「最後一段鼓聲太震撼了」</div>
    <div class="line">• 舊草稿自動標為 cancelled；點按「確認儲存票根」後，由 SQLite 交易正式存入私人票匣。</div>
    <div class="line">• 對照測試：傳送裁切掉日期的殘缺票根圖片時，不呼叫 prepare_ticket，主動詢問缺少的觀影日期。</div>
  </div>
  <div class="foot">依真實 Gemini + Google ADK 多模態整合測試（npm run smoke:ticket-photo:adk）整理。</div>
</body>
</html>`;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 880, height: 480 }, deviceScaleFactor: 2 });
  await page.setContent(ticketHtml({ includeDate: true }));
  await page.screenshot({ path: resolve('assets/sample-ticket.png') });

  await page.setContent(ticketHtml({ includeDate: false }));
  await page.screenshot({ path: resolve('assets/sample-ticket-missing-date.png') });

  await page.setViewportSize({ width: 1200, height: 900 });
  await page.setContent(flowDiagramHtml());
  await page.screenshot({ path: resolve('docs/images/01-ticket-photo-adk-flow.png'), fullPage: true });

  await page.setContent(twoTurnsDiagramHtml());
  await page.screenshot({ path: resolve('docs/images/02-ticket-photo-two-turns.png'), fullPage: true });
  console.log('Rendered sample tickets and Bot 07 diagrams successfully.');
} finally {
  await browser.close();
}
