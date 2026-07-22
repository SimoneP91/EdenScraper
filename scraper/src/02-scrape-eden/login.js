import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { log } from '../lib/logger.js';

const ITEMS_URL = 'https://eden-daoc.net/items';

// phpBB valida la sessione contro il browser string: DEVE essere identico
// tra login e scraping (headed o headless), altrimenti la sessione viene
// distrutta lato server. Non cambiare mai questo UA senza rifare il login.
export const EDEN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

export function sessionPath(dataDir) {
  return path.join(dataDir, '.auth', 'eden-session.json');
}

export function profileDir(dataDir) {
  return path.join(dataDir, '.auth', 'eden-profile');
}

export async function openEdenContext(dataDir, { headless = true } = {}) {
  return chromium.launchPersistentContext(profileDir(dataDir), {
    headless,
    userAgent: EDEN_UA,
    viewport: headless ? { width: 1400, height: 900 } : null,
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

/** La pagina items senza login mostra "Please log in with your Discord account". */
export async function isLoggedIn(page) {
  await page.goto(ITEMS_URL, { waitUntil: 'domcontentloaded' });
  const body = await page.textContent('body');
  return !/log in with your Discord account/i.test(body ?? '');
}

/**
 * Login manuale una tantum nel profilo persistente. L'utente completa l'OAuth
 * nella sua scheda; il controllo sessione avviene in una scheda separata.
 * Se c'è una checkbox "Remember me" nel form di login, spuntarla.
 */
export async function runEdenLogin({ dataDir }) {
  const statePath = sessionPath(dataDir);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });

  const context = await openEdenContext(dataDir, { headless: false });
  const userPage = context.pages()[0] ?? (await context.newPage());
  await userPage.goto(ITEMS_URL, { waitUntil: 'domcontentloaded' });

  log.info('>>> Completa il login Discord nella finestra aperta (spunta "Remember me" se presente). <<<');
  log.info('Controllo la sessione in una scheda separata ogni 15s (max 10 minuti)...');

  const deadline = Date.now() + 10 * 60_000;
  let ok = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15_000));
    const probe = await context.newPage();
    try {
      if (await isLoggedIn(probe)) ok = true;
    } catch {
      /* rete/navigazione in corso: riprova al giro dopo */
    } finally {
      await probe.close();
    }
    if (ok) break;
  }

  if (!ok) {
    await context.close();
    throw new Error('Login non completato entro 10 minuti. Rilancia --eden-login.');
  }

  await context.storageState({ path: statePath });
  await context.close();
  log.info(`Sessione salvata (profilo persistente in ${profileDir(dataDir)})`);
}
