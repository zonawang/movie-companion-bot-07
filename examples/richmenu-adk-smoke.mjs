// Real Gemini/ADK, fixture user, in-memory database; no LINE messages and no production ticket writes.
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { MovieCompanion } from '../src/agent.mjs';
import { MovieNavigation, menuFeatures } from '../src/navigation.mjs';
const settings = config(process.env);
const prefix = settings.liffAppType === 'miniapp' ? 'miniapp' : 'liff';
const navigation = new MovieNavigation({ liffUrl: settings.liffId ? `https://${prefix}.line.me/${settings.liffId}` : '' });
const store = new Store();
try {
  for (const feature of menuFeatures) {
    const calls = []; const bot = new MovieCompanion({ store, movies: new MovieSource(), model: settings.model, navigation, trace: name => calls.push(name) });
    const result = await bot.respond('richmenu-smoke-fixture', navigation.prompt(feature));
    assert.ok(calls.includes('open_movie_feature'), feature + ' did not use the ADK navigation tool');
    assert.equal(result.feature, feature); assert.equal(store.list('richmenu-smoke-fixture').length, 0);
    console.log(JSON.stringify({ feature, tools: calls, status: result.status }));
  }
} finally { store.close(); }
