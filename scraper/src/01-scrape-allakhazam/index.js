import path from 'node:path';
import * as cheerio from 'cheerio';
import { fetchHtml, BlockedError, setCookie } from '../lib/http.js';
import { readJson, writeJson, writeText, exists, heartbeat } from '../lib/cache.js';
import { normalizeName, slugify } from '../lib/slugify.js';
import { log } from '../lib/logger.js';
import { cookieHeader } from './login.js';

const BASE = 'https://camelot.allakhazam.com';
export const HEARTBEAT = (dataDir) => path.join(dataDir, '02-scraped', 'allakhazam', '.heartbeat');

/**
 * Strategia:
 *  1. /db/mobsbyzone.html -> elenco zone (cmzone)
 *  2. per ogni zona /db/search.html?cmzone=N -> indice nome mob -> cmob
 *  3. per ogni mob target presente nell'indice: /db/search.html?cmob=ID
 *     -> parse "Known Loot" (item name + citem id)
 * Tutto cacheato su disco: i rerun non rifanno richieste già fatte.
 */
export async function runAllakhazam({ dataDir, extractedDir, limit, only, force }) {
  const outDir = path.join(dataDir, '02-scraped', 'allakhazam');
  const rawDir = path.join(outDir, 'raw');

  const cookie = cookieHeader(dataDir);
  if (cookie) {
    setCookie(cookie);
    log.info('Sessione allakhazam caricata (soglia di blocco più alta; pausa periodica attiva).');
  } else {
    log.warn('Nessuna sessione allakhazam: crawl anonimo soggetto a blocchi. Usa --allakhazam-login.');
  }

  // --- 1. elenco zone ---
  const zonesFile = path.join(outDir, '_zones.json');
  let zones = force ? null : readJson(zonesFile);
  if (!zones) {
    log.info('Scarico elenco zone...');
    const html = await fetchHtml(`${BASE}/db/mobsbyzone.html`);
    if (!html) throw new Error('mobsbyzone.html non raggiungibile');
    writeText(path.join(rawDir, 'mobsbyzone.html'), html);
    const $ = cheerio.load(html);
    zones = [];
    $('a[href*="cmzone="]').each((_, a) => {
      const href = $(a).attr('href') ?? '';
      const m = href.match(/cmzone=(\d+)/);
      const name = $(a).text().trim();
      if (m && name) zones.push({ id: Number(m[1]), name });
    });
    // dedup per id
    zones = [...new Map(zones.map((z) => [z.id, z])).values()];
    writeJson(zonesFile, zones);
  }
  log.info(`Zone note: ${zones.length}`);

  // --- 2. indice mob per zona ---
  const indexFile = path.join(outDir, '_mob-index.json');
  let mobIndex = readJson(indexFile, {}); // normName -> [{cmob, name, zoneId, zoneName}]
  const doneZones = new Set(readJson(path.join(outDir, '_zones-done.json'), []));
  for (const zone of zones) {
    if (doneZones.has(zone.id) && !force) continue;
    heartbeat(HEARTBEAT(dataDir));
    log.info(`Zona ${zone.id} (${zone.name})...`);
    const html = await fetchHtml(`${BASE}/db/search.html?cmzone=${zone.id}`);
    if (html) {
      writeText(path.join(rawDir, 'zones', `${zone.id}.html`), html);
      const $ = cheerio.load(html);
      let found = 0;
      $('a[href*="cmob="]').each((_, a) => {
        const href = $(a).attr('href') ?? '';
        const m = href.match(/cmob=(\d+)/);
        const name = $(a).text().trim();
        if (!m || !name) return;
        const key = normalizeName(name);
        const list = (mobIndex[key] ??= []);
        if (!list.some((e) => e.cmob === Number(m[1])))
          list.push({ cmob: Number(m[1]), name, zoneId: zone.id, zoneName: zone.name });
        found++;
      });
      log.info(`  -> ${found} link mob`);
    } else {
      log.warn(`  zona ${zone.id}: 404`);
    }
    doneZones.add(zone.id);
    writeJson(path.join(outDir, '_zones-done.json'), [...doneZones]);
    writeJson(indexFile, mobIndex);
  }
  log.info(`Indice mob allakhazam: ${Object.keys(mobIndex).length} nomi`);

  // --- 3. pagine mob per i target ---
  const targets = readJson(path.join(extractedDir, 'mob_targets.json'));
  if (!targets) throw new Error('mob_targets.json mancante: lancia prima --extract');

  let list = targets.mobs;
  if (only) list = list.filter((m) => normalizeName(m.name) === normalizeName(only));
  const report = { matched: 0, scraped: 0, cached: 0, notFound: [], ambiguous: [] };
  let processed = 0;

  for (const target of list) {
    if (limit && processed >= limit) break;
    const key = normalizeName(target.name);
    const entries = mobIndex[key];
    if (!entries || entries.length === 0) {
      report.notFound.push(target.name);
      continue;
    }
    report.matched++;
    // stesso nome in più zone = di norma lo stesso mob logico; scrapiamo ogni cmob distinto
    const cmobs = [...new Set(entries.map((e) => e.cmob))];
    if (cmobs.length > 1) report.ambiguous.push({ name: target.name, cmobs });

    const outFile = path.join(outDir, 'mobs', `${slugify(target.name)}.json`);
    if (exists(outFile) && !force) {
      report.cached++;
      continue;
    }
    processed++;
    heartbeat(HEARTBEAT(dataDir));

    const results = [];
    try {
      for (const cmob of cmobs) {
        const html = await fetchHtml(`${BASE}/db/search.html?cmob=${cmob}`);
        if (!html) continue;
        writeText(path.join(rawDir, 'mobs', `${cmob}.html`), html);
        results.push({ cmob, ...parseMobPage(html) });
      }
    } catch (err) {
      if (err instanceof BlockedError) {
        log.warn(`Blocco del sito rilevato su "${target.name}": mi fermo qui, progressi salvati. Riprendi più tardi.`);
        break;
      }
      throw err;
    }
    writeJson(outFile, {
      targetName: target.name,
      scrapedAt: new Date().toISOString(),
      source: 'allakhazam',
      pages: results,
    });
    report.scraped++;
    log.info(`[${report.scraped}] ${target.name}: ${results.map((r) => r.loot.length).join('+')} drop`);
  }

  writeJson(path.join(outDir, '_report.json'), {
    generatedAt: new Date().toISOString(),
    ...report,
    notFoundCount: report.notFound.length,
  });
  log.info(
    `Allakhazam: match ${report.matched}, scrapati ora ${report.scraped}, già in cache ${report.cached}, senza risultato ${report.notFound.length}`
  );
}

// Marcatori delle sezioni che possono seguire "Known Loot" nelle pagine bestiario ZAM.
const NEXT_SECTIONS =
  /Known Habitats|Related Quests|Quest Starter|Sold by|Screenshots?|Post Comment|Send a correction|Allakhazam Full Bio/i;

export function parseMobPage(html) {
  const $ = cheerio.load(html);
  const text = $.root().text();

  const title = $('title').text().split('::')[0].trim();
  const lvlMatch = text.match(/Level:?\s*(\d+)(?:\s*[-–]\s*(\d+))?/i);

  // Solo i link citem DENTRO la sezione "Known Loot": senza sezione, niente loot
  // (le pagine mercante elencano la merce in vendita con gli stessi link item).
  const loot = [];
  const start = html.search(/Known Loot/i);
  if (start !== -1) {
    let section = html.slice(start);
    const end = section.slice(10).search(NEXT_SECTIONS);
    if (end !== -1) section = section.slice(0, end + 10);
    const $s = cheerio.load(section);
    $s('a[href*="citem="]').each((_, a) => {
      const href = $s(a).attr('href') ?? '';
      const m = href.match(/citem=(\d+)/);
      const name = $s(a).text().trim();
      if (m && name && !loot.some((l) => l.citem === Number(m[1])))
        loot.push({ citem: Number(m[1]), name });
    });
  }

  return {
    name: title,
    level: lvlMatch ? Number(lvlMatch[1]) : null,
    levelMax: lvlMatch?.[2] ? Number(lvlMatch[2]) : null,
    hasKnownLootSection: start !== -1,
    loot,
  };
}
