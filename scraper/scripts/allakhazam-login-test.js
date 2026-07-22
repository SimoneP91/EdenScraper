import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statePath = path.join(root, 'data', '.auth', 'allakhazam-session.json');
const UN = process.env.AK_USER;
const PW = process.env.AK_PASS;

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext();
const p = await ctx.newPage();

console.log('Vado al form di login...');
await p.goto('https://secure.allakhazam.com/login.html?action=login&goto=https://camelot.allakhazam.com/', {
  waitUntil: 'domcontentloaded',
});
await p.fill('input[name="un"]', UN);
await p.fill('input[name="pw"]', PW);
await p.check('input[name="pt"]').catch(() => {});
await Promise.all([
  p.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
  p.evaluate(() => {
    const f = [...document.querySelectorAll('form')].find((x) => /zamlogin/.test(x.action));
    f.submit();
  }),
]);
await p.waitForTimeout(3000);
console.log('URL dopo login:', p.url());

// verifica login: la homepage dovrebbe mostrare "Logout" o lo username
await p.goto('https://camelot.allakhazam.com/', { waitUntil: 'domcontentloaded' });
const loggedIn = await p.evaluate(
  (un) => /logout|log ?out/i.test(document.body.innerText) || document.body.innerText.includes(un),
  UN
);
console.log('LOGGED IN:', loggedIn);
const cookies = await ctx.cookies();
console.log('COOKIES:', cookies.map((c) => c.name).join(', '));
await ctx.storageState({ path: statePath });

// --- test soglia blocco: 200 richieste rapide DA LOGGATO ---
console.log('\nTest blocco: 200 fetch consecutivi (via browser loggato)...');
let ok = 0;
let firstBlock = null;
for (let i = 1; i <= 200; i++) {
  const status = await p.evaluate(async (id) => {
    const r = await fetch(`/db/search.html?cmob=${id}`);
    return r.status;
  }, 100 + i);
  if (status === 200) ok++;
  else if (!firstBlock) {
    firstBlock = { i, status };
    console.log(`  PRIMO BLOCCO alla richiesta #${i}: HTTP ${status}`);
    break;
  }
  if (i % 25 === 0) console.log(`  #${i}: ok=${ok}`);
}
if (!firstBlock) console.log('  NESSUN BLOCCO in 200 richieste — il login aiuta!');
await b.close();
