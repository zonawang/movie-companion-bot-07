import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { CinemaCards } from '../src/cinema-cards.mjs';
import { flexFixture } from '../examples/flex-fixture.mjs';
const cards = new CinemaCards();
const reply = await cards.present('preview-fixture', [flexFixture]);
const actions = new Map();
const collect = async value => {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'postback' && !actions.has(value.data)) {
    actions.set(value.data, null); const result = await cards.handle('preview-fixture', value.data); actions.set(value.data, result); await collect(result);
  }
  for (const child of Object.values(value)) if (child && typeof child === 'object') for (const item of Array.isArray(child) ? child : [child]) await collect(item);
};
await collect(reply);
const fallbackImage = 'data:image/jpeg;base64,' + (await readFile(new URL('../public/assets/poster-fallback-v1.jpg', import.meta.url))).toString('base64');
const fallbackUrl = cards.fallbackPosterUrl;
const payload = JSON.stringify({ reply, actions: Object.fromEntries(actions) }).replaceAll('<', '\\u003c');
const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zona Movie 電影卡片預覽</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#e5e9e3;color:#243d34;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif}.page{max-width:1100px;margin:auto;padding:24px 16px}.brand{font-size:12px;letter-spacing:3px;color:#677466}h1{font-size:26px;margin:12px 0 8px}.note{font-size:13px;line-height:1.8;color:#677466;margin:0 0 22px}.message{white-space:pre-wrap;overflow-wrap:anywhere;background:#fffef5;border-radius:16px;padding:18px;font-size:13px;line-height:1.8;max-width:650px;margin-bottom:16px}.track{display:flex;gap:14px;overflow-x:auto;padding:0 0 16px;scroll-snap-type:x mandatory;align-items:stretch}.bubble{flex:0 0 260px;max-width:260px;border-radius:16px;overflow:hidden;background:#f6f4ed;display:flex;flex-direction:column;scroll-snap-align:start;box-shadow:0 5px 20px #243d3412}.bubble>.body{flex:1}.node-box{display:flex;flex-direction:column}.node-text{margin:0;white-space:pre-line;overflow-wrap:anywhere;line-height:1.5}.node-separator{border:0;border-top:1px solid #d7dccf;width:100%}.node-button{width:100%;border:0;border-radius:7px;min-height:38px;font:inherit;font-size:14px;cursor:pointer;background:#e8ecdf;color:#243d34}.node-button.primary{background:#243d34;color:#fffef5}.quick{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 20px}.quick button{border:1px solid #b9c5b7;background:#fffef5;border-radius:24px;padding:10px 16px;color:#243d34;cursor:pointer}.bubble>img.hero{width:100%;display:block;aspect-ratio:3/4;object-fit:cover}@media(max-width:500px){.page{padding:20px 12px}h1{font-size:23px}.bubble{flex-basis:260px}.note{font-size:12px}}
</style><main class="page"><div class="brand">ZONA MOVIE / FLEX MESSAGE</div><h1>今天，想看哪一部？</h1><p class="note">虛構電影與場次・開發用版面預覽<br>可左右滑動並點按介紹、完整場次與分頁。實際 LINE 畫面依裝置呈現。</p><section id="conversation"></section></main>
<script>
const data=${payload};
const fallbackImage=${JSON.stringify(fallbackImage)}, fallbackUrl=${JSON.stringify(fallbackUrl)};
const sizes={xs:'11px',sm:'13px',md:'15px',lg:'18px',xl:'23px',xxl:'32px'};const spaces={xs:3,sm:6,md:10,lg:16,xl:22};
function component(value,cls=''){
 let el=document.createElement(value.type==='button'?'button':value.type==='image'?'img':value.type==='separator'?'hr':value.type==='text'?'p':'div');el.className='node-'+value.type+' '+cls;
 if(value.type==='text'){el.textContent=value.text;if(value.maxLines){el.style.display='-webkit-box';el.style.webkitLineClamp=value.maxLines;el.style.webkitBoxOrient='vertical';el.style.overflow='hidden'}}
 if(value.type==='image'){el.src=value.url===fallbackUrl?fallbackImage:value.url;el.alt=value.url===fallbackUrl?'電影院主題插畫（預設封面）':'電影海報';}
 if(value.type==='button'){el.textContent=value.action.label;if(value.style==='primary')el.classList.add('primary');el.onclick=()=>show(data.actions[value.action.data]);el.dataset.action=value.action.data}
 if(value.contents)for(const child of value.contents)el.append(component(child));
 if(value.spacing)el.style.gap=(spaces[value.spacing]||0)+'px';if(value.margin)el.style.marginTop=(spaces[value.margin]||0)+'px';
 if(value.paddingAll)el.style.padding=value.paddingAll;if(value.backgroundColor)el.style.background=value.backgroundColor;if(value.color){if(value.type==='button')el.style.background=value.color;else el.style.color=value.color;}if(value.height)el.style.height=value.height;if(value.justifyContent)el.style.justifyContent=value.justifyContent;
 if(value.size&&sizes[value.size])el.style.fontSize=sizes[value.size];if(value.weight==='bold')el.style.fontWeight=700;if(value.align)el.style.textAlign=value.align;return el;
}
function quick(items,root){const q=document.createElement('div');q.className='quick';for(const item of items||[]){const b=document.createElement('button');b.textContent=item.action.label;b.onclick=()=>show(data.actions[item.action.data]);q.append(b)}root.append(q)}
function show(reply){if(!reply)return;const root=document.getElementById('conversation');root.replaceChildren();const messages=reply.messages||[{type:'text',text:reply.text,quickReply:reply.quickReplies?{items:reply.quickReplies.map(action=>({action}))}:undefined}];for(const message of messages){if(message.type==='text'){const p=document.createElement('div');p.className='message';p.textContent=message.text;root.append(p)}else if(message.type==='flex'){const track=document.createElement('div');track.className='track';for(const bubble of message.contents.contents){const b=document.createElement('article');b.className='bubble';for(const key of ['hero','body','footer'])if(bubble[key])b.append(component(bubble[key],key));track.append(b)}root.append(track)}if(message.quickReply)quick(message.quickReply.items,root)}}
show(data.reply);
</script></html>`;
await mkdir('browser-results', { recursive: true });
await writeFile('browser-results/flex-preview.html', html);
await writeFile('browser-results/flex-sample.json', JSON.stringify(reply.messages, null, 2) + '\n');
console.log('Generated browser-results/flex-preview.html and flex-sample.json (fictional fixtures only).');
