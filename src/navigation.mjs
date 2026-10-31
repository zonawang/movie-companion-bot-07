export const menuFeatures = ['movies', 'shelf', 'nearby', 'recommend'];
const labels = { movies: '電影查詢', shelf: '我的票匣', nearby: '附近影院', new_ticket: '記錄心得', recommend: '幫我挑電影' };
export const featureForText = text => ({ '電影查詢': 'movies', '我的票匣': 'shelf', '票匣': 'shelf', '開啟票匣': 'shelf', '附近影院': 'nearby', '記錄心得': 'new_ticket', '幫我挑電影': 'recommend', '推薦電影': 'recommend' })[text.trim()] || '';
export class MovieNavigation {
  constructor({ liffUrl = '' } = {}) {
    if (liffUrl && !/^https:\/\/(?:miniapp|liff)\.line\.me\/\d+-[A-Za-z0-9]+$/.test(liffUrl)) throw new Error('票匣入口必須是正式 LIFF 或 MINI App 網址');
    this.liffUrl = liffUrl;
  }
  prompt(feature) {
    if (![...menuFeatures, 'new_ticket'].includes(feature)) throw new Error('Unknown movie feature');
    return `我想開啟「${labels[feature]}」的功能入口。請呼叫 open_movie_feature，feature=${feature}，讓我選擇下一步；這一則只需要入口，不要先查資料或建立草稿。`;
  }
  open(feature) {
    if (feature === 'movies') return { status: 'ok', feature, text: '想查哪部電影？直接輸入片名，我可以幫你查簡介與評論；也可以先看上映候選，或指定影城查場次。', quickReplies: [
      { type: 'message', label: '上映候選', text: '請查詢台灣目前上映候選電影，並附資料來源。' },
      { type: 'message', label: '查影城場次', text: '我想查影城場次，請先問我想找的城市與分館。' },
    ] };
    if (feature === 'nearby') return { status: 'ok', feature, text: '你想從哪裡找附近影院？點下方「分享我的位置」，或直接輸入城市與完整地標。我會透過地圖工具找附近三公里的影院，再查可取得的場次。', quickReplies: [
      { type: 'location', label: '分享我的位置' },
      { type: 'message', label: '改用地標', text: '我想用文字地標找附近影院，請先問我城市與地標。' },
    ] };
    if (feature === 'recommend') return { status: 'ok', feature, text: '今天想看什麼心情或類型的電影？也可以告訴我和誰一起看、想避開哪些類型。我會從上映候選幫你挑最多三部，附上挑選原因。', quickReplies: [
      { type: 'message', label: '輕鬆喜劇', text: '想跟朋友看輕鬆喜劇，不要恐怖片，幫我推薦電影。' },
      { type: 'message', label: '刺激動作', text: '想看刺激的動作片，幫我推薦電影。' },
      { type: 'message', label: '溫馨感動', text: '想看溫馨感動的電影，幫我推薦電影。' },
    ] };
    if (feature === 'shelf' || feature === 'new_ticket') {
      if (!this.liffUrl) return { status: 'unavailable', feature, text: '票匣入口尚未設定，請稍後再試。' };
      const url = new URL(this.liffUrl); if (feature === 'new_ticket') url.searchParams.set('action', 'new');
      return { status: 'ok', feature, text: feature === 'shelf' ? '你的私人票匣在這裡。使用 LINE 登入後，就能翻閱自己的電影回憶。' : '打開新增票根表單，記下電影、日期與散場心得。填好並按下儲存後才會新增紀錄。', actions: [{ label: feature === 'shelf' ? '開啟我的票匣' : '新增票根與心得', uri: url.href }] };
    }
    throw new Error('Unknown movie feature');
  }
}

export function richMenuDefinition(navigation) {
  if (!navigation.liffUrl) throw new Error('啟用 Rich Menu 前必須設定正式票匣入口');
  return { size: { width: 2500, height: 1686 }, selected: true, name: 'Zona Movie 05 — 四格選單', chatBarText: '電影夥伴選單', areas: [
    { bounds: { x: 0, y: 0, width: 1250, height: 843 }, action: { type: 'postback', label: '電影查詢', data: 'menu:movies', displayText: '電影查詢', inputOption: 'openKeyboard' } },
    { bounds: { x: 1250, y: 0, width: 1250, height: 843 }, action: { type: 'uri', label: '我的票匣', uri: navigation.open('shelf').actions[0].uri } },
    { bounds: { x: 0, y: 843, width: 1250, height: 843 }, action: { type: 'postback', label: '附近影院', data: 'menu:nearby', displayText: '附近影院', inputOption: 'closeRichMenu' } },
    { bounds: { x: 1250, y: 843, width: 1250, height: 843 }, action: { type: 'postback', label: '幫我挑電影', data: 'menu:recommend', displayText: '幫我挑電影', inputOption: 'openKeyboard' } },
  ] };
}
