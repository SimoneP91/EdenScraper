import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { log } from '../lib/logger.js';

const LOGIN_URL =
  'https://secure.allakhazam.com/login.html?action=login&goto=https://camelot.allakhazam.com/';

export function sessionPath(dataDir) {
  return path.join(dataDir, '.auth', 'allakhazam-session.json');
}

/** Estrae l'header Cookie per il dominio allakhazam dalla sessione salvata. */
export function cookieHeader(dataDir) {
  const file = sessionPath(dataDir);
  if (!fs.existsSync(file)) return null;
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cookies = (state.cookies ?? []).filter((c) => c.domain.includes('allakhazam'));
  if (!cookies.length) return null;
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Login automatico all'account allakhazam (credenziali via env AK_USER/AK_PASS).
 * Salva i cookie di sessione: da loggati la soglia di blocco CloudFront sparisce.
 */
export async function runAllakhazamLogin({ dataDir }) {
  const un = process.env.AK_USER;
  const pw = process.env.AK_PASS;
  if (!un || !pw)
    throw new Error('Imposta le credenziali: AK_USER e AK_PASS (env o .env) prima di --allakhazam-login');

  const statePath = sessionPath(dataDir);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const p = await ctx.newPage();

  log.info('Login allakhazam...');
  await p.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await p.fill('input[name="un"]', un);
  await p.fill('input[name="pw"]', pw);
  await p.check('input[name="pt"]').catch(() => {}); // "resta connesso"
  await Promise.all([
    p.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
    p.evaluate(() => {
      const f = [...document.querySelectorAll('form')].find((x) => /zamlogin/.test(x.action));
      f.submit();
    }),
  ]);
  await p.waitForTimeout(3000);

  // Verifica robusta: il login è riuscito se sono presenti i cookie di sessione.
  // (Non controllo il testo della homepage: se l'IP è temporaneamente bloccato da
  //  CloudFront quella pagina dà 403 e darebbe un falso negativo.)
  const cookies = await ctx.cookies();
  const hasSession = cookies.some(
    (c) => c.domain.includes('allakhazam') && /^SessionID/i.test(c.name) && c.value
  );
  if (!hasSession) {
    await browser.close();
    throw new Error('Login allakhazam fallito: nessun cookie di sessione (verifica AK_USER/AK_PASS).');
  }
  await ctx.storageState({ path: statePath });
  await browser.close();
  log.info(`Login riuscito, sessione salvata in ${statePath}`);
}
