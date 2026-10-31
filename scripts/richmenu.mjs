import 'dotenv/config';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { MovieNavigation } from '../src/navigation.mjs';
import { RichMenuClient, planRichMenu } from '../src/richmenu.mjs';

try {
  const command = process.argv[2] || 'plan';
  const option = name => { const index = process.argv.indexOf(name); return index < 0 ? '' : process.argv[index + 1] || ''; };
  if (!['plan', 'inspect', 'apply', 'rollback'].includes(command)) throw new Error('使用 plan、inspect、apply 或 rollback');
  const stateFile = resolve(option('--state-file') || './data/richmenu-install.json');
  const checkpoint = async state => { await mkdir(dirname(stateFile), { recursive: true, mode: 0o700 }); await writeFile(stateFile + '.tmp', JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); await rename(stateFile + '.tmp', stateFile); };
  const loadState = async () => { try { return JSON.parse(await readFile(stateFile, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
  const client = command === 'plan' ? null : new RichMenuClient({ token: process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() });
  if (command === 'inspect') console.log(JSON.stringify(await client.inspect(), null, 2));
  else if (command === 'rollback') console.log(JSON.stringify(await client.rollback(await loadState()), null, 2));
  else {
    const liffUrl = option('--liff-url') || (process.env.LIFF_ID ? `https://${process.env.LIFF_APP_TYPE === 'miniapp' ? 'miniapp' : 'liff'}.line.me/${process.env.LIFF_ID.trim()}` : '');
    const image = await readFile(new URL('../assets/richmenu.png', import.meta.url));
    const plan = planRichMenu(new MovieNavigation({ liffUrl }), image);
    console.log(JSON.stringify(command === 'plan' ? plan : await client.apply({ plan, image, state: await loadState(), checkpoint }), null, 2));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
