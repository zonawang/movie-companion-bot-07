import { config } from './config.mjs';
import { Store } from './store.mjs';
import { MovieSource } from './movies.mjs';
import { MovieCompanion } from './agent.mjs';
import { createWebhookServer } from './app.mjs';
import { replyToLine } from './line.mjs';
import { GoogleMapsSource } from './maps.mjs';
import { ShelfAuth } from './shelf-auth.mjs';
import { ShelfCatalog } from './shelf-catalog.mjs';
import { TicketShelf } from './shelf.mjs';
import { CinemaCards } from './cinema-cards.mjs';
import { MovieCardCatalog } from './movie-card-catalog.mjs';
import { MovieNavigation } from './navigation.mjs';
import { fetchLineImage } from './ticket-photo.mjs';

try {
  const settings = config(process.env, { line: true });
  const store = new Store(settings.database);
  const movies = new MovieSource({ mode: settings.mode, token: settings.tmdbToken });
  const shelf = new TicketShelf({ store, auth: new ShelfAuth({ channelId: settings.loginChannelId, baseUrl: settings.publicBaseUrl, secureCookies: settings.publicBaseUrl.startsWith('https:') }), catalog: new ShelfCatalog({ token: settings.tmdbToken }), liffId: settings.liffId, liffAppType: settings.liffAppType });
  const navigation = new MovieNavigation({ liffUrl: shelf.liffUrl });
  const cards = new CinemaCards({ fallbackPosterUrl: new URL('/tickets/assets/poster-fallback-v1.jpg', settings.publicBaseUrl).href, catalog: new MovieCardCatalog({ token: settings.tmdbToken }) });
  const bot = new MovieCompanion({ store, movies, model: settings.model, maps: new GoogleMapsSource({ apiKey: settings.mapsApiKey }), navigation, cards });
  const server = createWebhookServer({
    secret: settings.channelSecret, store, bot,
    shelf, navigation, cards,
    fetchImage: messageId => fetchLineImage(settings.channelToken, messageId),
    reply: (replyToken, messages) => replyToLine(settings.channelToken, replyToken, messages),
  });
  server.listen(settings.port, '127.0.0.1', () => {
    console.log(`電影 Bot 已啟動：http://127.0.0.1:${settings.port}/health`);
    console.log(`LINE webhook 路徑：/webhook；電影資料模式：${settings.mode}`);
    console.log('請使用 HTTPS tunnel 對外連線，再到 LINE Developers 設定 Webhook URL。');
  });
} catch (error) { console.error(error.message); process.exitCode = 1; }
