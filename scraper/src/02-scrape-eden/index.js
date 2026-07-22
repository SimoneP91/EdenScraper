import path from 'node:path';
import fs from 'node:fs';
import { readJson, writeJson, writeText, exists, heartbeat } from '../lib/cache.js';
import { normalizeName, slugify } from '../lib/slugify.js';
import { log } from '../lib/logger.js';
import { sessionPath, isLoggedIn, openEdenContext } from './login.js';

export const HEARTBEAT = (dataDir) => path.join(dataDir, '02-scraped', 'eden-daoc', '.heartbeat');
const PAGE_SIZE = 25;
const API_DELAY_MS = Number(process.env.EDEN_RATE_MS ?? 500);

/**
 * Eden espone un'API JSON interna (scoperta col recon autenticato):
 *  - /itm/search.php?p=N          -> pagina di 25 item (summary), campo total
 *  - /itm/item.php?id=X           -> dettaglio COMPLETO item (stat, bonus, proc)
 *                                    + campo mobs=";id1;id2;" (droppatori!)
 *  - /itm/mob.php?ids=a,b,c       -> risolve id mob in nome/livello/zona
 * Strategia: enumerazione completa degli item, mappa inversa mob->item,
 * filtro sui target del nostro DB. Tutto cacheato e ripristinabile.
 */
export async function runEden({ dataDir, extractedDir, limit, only, force, recon }) {
  const statePath = sessionPath(dataDir);
  if (!fs.existsSync(statePath))
    throw new Error('Nessuna sessione Eden salvata: lancia prima --eden-login');

  const outDir = path.join(dataDir, '02-scraped', 'eden-daoc');
  const context = await openEdenContext(dataDir, { headless: true });
  const page = await context.newPage();

  try {
    if (!(await isLoggedIn(page))) throw new Error('Sessione Eden scaduta: rilancia --eden-login');
    log.info('Sessione Eden valida.');
    await page.goto('https://eden-daoc.net/items', { waitUntil: 'domcontentloaded' });

    if (recon) {
      await reconMode(page, outDir);
      return;
    }

    const api = async (url) => {
      const res = await page.evaluate(async (u) => {
        const r = await fetch(u);
        if (!r.ok) return { __err: r.status };
        return r.json();
      }, url);
      if (res && res.__err) throw new Error(`Eden API ${url} -> HTTP ${res.__err}`);
      heartbeat(HEARTBEAT(dataDir));
      await page.waitForTimeout(API_DELAY_MS);
      return res;
    };

    // --- 1. enumerazione pagine search ---
    const pagesDir = path.join(outDir, 'pages');
    const first = readJson(path.join(pagesDir, 'p0000.json')) ?? (await api('/itm/search.php?p=0'));
    writeJson(path.join(pagesDir, 'p0000.json'), first);
    const total = Number(first.total);
    const totalPages = Math.ceil(total / PAGE_SIZE);
    log.info(`Eden: ${total} item totali, ${totalPages} pagine`);

    for (let p = 1; p < totalPages; p++) {
      const file = path.join(pagesDir, `p${String(p).padStart(4, '0')}.json`);
      if (exists(file) && !force) continue;
      const data = await api(`/itm/search.php?p=${p}`);
      writeJson(file, data);
      if (p % 50 === 0) log.info(`  pagine: ${p}/${totalPages}`);
    }
    log.info('Enumerazione pagine completata.');

    // --- 2. dettaglio per ogni item ---
    const allIds = [];
    for (let p = 0; p < totalPages; p++) {
      const data = readJson(path.join(pagesDir, `p${String(p).padStart(4, '0')}.json`));
      if (data?.items) for (const it of data.items) allIds.push(String(it.id));
    }
    log.info(`Item id raccolti: ${allIds.length}`);

    const itemsDir = path.join(outDir, 'items');
    let fetched = 0;
    let processed = 0;
    for (const id of allIds) {
      const file = path.join(itemsDir, `${id}.json`);
      if (exists(file) && !force) continue;
      if (limit && processed >= limit) break;
      processed++;
      const detail = await api(`/itm/item.php?id=${id}`);
      writeJson(file, detail);
      fetched++;
      if (fetched % 100 === 0) log.info(`  dettagli item: +${fetched} (id ${id})`);
    }
    const cachedCount = allIds.filter((id) => exists(path.join(itemsDir, `${id}.json`))).length;
    log.info(`Dettagli item in cache: ${cachedCount}/${allIds.length} (+${fetched} in questo run)`);
    if (cachedCount < allIds.length) {
      log.info('Dettagli incompleti: rilancia --eden per proseguire (riprende dalla cache).');
      return;
    }

    // --- 3. risoluzione mob id -> nome ---
    const mobIds = new Set();
    for (const id of allIds) {
      const d = readJson(path.join(itemsDir, `${id}.json`));
      for (const m of parseIdList(d?.mobs)) mobIds.add(m);
    }
    log.info(`Mob droppatori distinti su Eden: ${mobIds.size}`);
    const mobsFile = path.join(outDir, '_mobs.json');
    let mobInfo = readJson(mobsFile, {});
    const missing = [...mobIds].filter((m) => !mobInfo[m]);
    for (let i = 0; i < missing.length; i += 50) {
      const batch = missing.slice(i, i + 50);
      const res = await api(`/itm/mob.php?ids=${batch.join(',')}`);
      for (const m of res ?? []) mobInfo[m.id] = m;
      writeJson(mobsFile, mobInfo);
      if (i % 500 === 0 && i > 0) log.info(`  mob risolti: ${i}/${missing.length}`);
    }
    log.info(`Mob risolti: ${Object.keys(mobInfo).length}`);

    // --- 4. mappa inversa mob->item, filtrata sui target ---
    const targets = readJson(path.join(extractedDir, 'mob_targets.json'));
    if (!targets) throw new Error('mob_targets.json mancante: lancia prima --extract');
    const targetByNorm = new Map(targets.mobs.map((m) => [normalizeName(m.name), m]));

    const byMob = new Map(); // normName -> {mob, items:[]}
    for (const id of allIds) {
      const d = readJson(path.join(itemsDir, `${id}.json`));
      if (!d) continue;
      for (const mid of parseIdList(d.mobs)) {
        const info = mobInfo[mid];
        if (!info) continue;
        const key = normalizeName(info.name);
        if (!targetByNorm.has(key)) continue;
        let e = byMob.get(key);
        if (!e) {
          e = { mobEden: info, items: [] };
          byMob.set(key, e);
        }
        e.items.push(d);
      }
    }

    let written = 0;
    for (const [key, e] of byMob) {
      const t = targetByNorm.get(key);
      if (only && normalizeName(only) !== key) continue;
      writeJson(path.join(outDir, 'mobs', `${slugify(t.name)}.json`), {
        targetName: t.name,
        scrapedAt: new Date().toISOString(),
        source: 'eden-daoc',
        mobEden: e.mobEden,
        items: e.items,
      });
      written++;
    }
    writeJson(path.join(outDir, '_report.json'), {
      generatedAt: new Date().toISOString(),
      edenItemsTotal: allIds.length,
      edenMobsWithDrops: mobIds.size,
      targetsMatched: written,
      targetsTotal: targets.mobs.length,
    });
    log.info(`Eden completato: ${written}/${targets.mobs.length} target con drop su Eden.`);
  } finally {
    await context.close();
  }
}

function parseIdList(s) {
  if (!s) return [];
  return String(s)
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Salva la pagina items e le risposte JSON per studiare la struttura reale. */
async function reconMode(page, outDir) {
  log.info('Modalità recon: salvo struttura di /items...');
  await page.goto('https://eden-daoc.net/items', { waitUntil: 'networkidle' });
  writeText(path.join(outDir, 'recon', 'items-page.html'), await page.content());
  await page.screenshot({ path: path.join(outDir, 'recon', 'items-page.png'), fullPage: true });
  log.info(`Recon salvato in ${path.join(outDir, 'recon')}`);
}
