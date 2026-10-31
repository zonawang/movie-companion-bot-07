import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { draftText } from '../src/line.mjs';

console.log('離線工具示範：不會呼叫 Gemini，也不代表 ADK 已連線。');
const store = new Store();
try {
  console.log(await new MovieSource().movies());
  const draft = store.prepare('demo-user', 'demo-event', {
    movieTitle: '月台上的貓', watchedOn: '2026-10-25', cinema: '', companions: '小安', note: '配樂很好聽',
  }, ['我 2026-10-25 跟小安看了月台上的貓，心得是配樂很好聽']);
  console.log(draftText(draft));
  console.log('確認前票根數：', store.list('demo-user').length);
  console.log('模擬使用者按下確認：', store.decide('demo-user', draft.id, 'confirm').status);
  console.log('確認後票根數：', store.list('demo-user').length);
  console.log('以同伴找票根：', store.list('demo-user', '小安'));
} finally { store.close(); }
