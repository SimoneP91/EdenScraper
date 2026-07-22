import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, writeText } from '../lib/cache.js';
import { slugify } from '../lib/slugify.js';
import { log } from '../lib/logger.js';

/**
 * Genera i file di esportazione su disco (in data/05-output/export/), affidabili
 * a prescindere dalla sandbox dell'Artifact. Il collaboratore li riceve come file.
 *  - drop_merged_full.json  : tutti i mob con proposta risolta
 *  - items_eden.json        : catalogo item Eden (stat complete)
 *  - items_allakhazam.json  : item solo-nome da Allakhazam
 *  - drops.csv              : una riga per item (mob, lato, fonte, ...)
 *  - per-mob/<slug>.json    : un file per mob (solo mob cambiati)
 */
export function runExport({ dataDir, extractedDir }) {
  const merged = readJson(path.join(dataDir, '03-merged', 'drop_merged.json'));
  const dbLoot = readJson(path.join(extractedDir, 'db_loot.json'));
  const dbItems = readJson(path.join(extractedDir, 'db_items.json'));
  const itemExisting = readJson(path.join(extractedDir, 'item_existing.json'));
  if (!merged || !dbLoot) throw new Error('Mancano merge/db_loot: lancia --merge --extract-loot');

  const catalog = new Map();
  for (const it of itemExisting?.items ?? []) if (it.nameNorm && !catalog.has(it.nameNorm)) catalog.set(it.nameNorm, it.idNb);
  const edenItemDir = path.join(dataDir, '02-scraped', 'eden-daoc', 'items');
  const outDir = path.join(dataDir, '05-output', 'export');
  const perMobDir = path.join(outDir, 'per-mob');

  const edenItems = new Map(); // id -> item eden raw
  const allakItems = new Map(); // citem -> {name, citem}
  const mobsOut = [];
  const csv = ['mob,reame,zone,categoria,lato,item,fonte,in_catalogo'];
  const csvEsc = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';

  const REALM = { 0: 'Tutti', 1: 'Alb', 2: 'Mid', 3: 'Hib' };

  for (const [key, m] of Object.entries(merged.mobs)) {
    const current = dbLoot.mobs[key]?.items ?? [];
    const proposed = (m.items ?? []).filter((i) => !i.legacy);
    if (!current.length && !proposed.length) continue;

    const curNames = new Set(current.map((i) => i.nameNorm));
    const propNames = new Set(proposed.map((i) => i.nameNorm));
    let category = 'confirmed';
    if (!current.length && proposed.length) category = 'new';
    else if (proposed.some((i) => !curNames.has(i.nameNorm)) || current.some((i) => i.nameNorm && !propNames.has(i.nameNorm))) category = 'modified';
    if (!proposed.length) continue;

    const realm = (m.realm ?? []).map((r) => REALM[r]).filter((x) => x && x !== 'Tutti');
    const locStr = (m.locations?.length ? m.locations : (m.regions ?? []).map((r) => ({ zone: null, region: r })))
      .map((l) => (l.zone ? `${l.zone} (reg ${l.region})` : `region ${l.region}`))
      .join(' | ');
    const proposedOut = proposed.map((i) => {
      let stats = null;
      if (i.edenId) {
        const f = path.join(edenItemDir, `${i.edenId}.json`);
        if (fs.existsSync(f)) {
          const d = readJson(f);
          if (!edenItems.has(i.edenId)) edenItems.set(i.edenId, d);
          stats = { edenId: i.edenId, level: Number(d.level), quality: Number(d.quality), realm: Number(d.realm), bonus_types: d.bonus_types, bonus_values: d.bonus_values };
        }
      } else if (i.citem && !allakItems.has(i.citem)) allakItems.set(i.citem, { name: i.name, citem: i.citem });
      const inCatalog = catalog.has(i.nameNorm);
      csv.push([m.mob, realm.join('|'), locStr, category, 'proposto', i.name, i.sources.join('+'), inCatalog].map(csvEsc).join(','));
      return { name: i.name, sources: i.sources, inCatalog, catalogId: catalog.get(i.nameNorm) ?? null, stats };
    });
    for (const i of current) csv.push([m.mob, realm.join('|'), locStr, category, 'db_attuale', i.name ?? '(mancante)', 'db', ''].map(csvEsc).join(','));

    const mobObj = {
      mob: m.mob, realm, regions: m.regions, locations: m.locations ?? [], minLevel: m.minLevel, maxLevel: m.maxLevel, category,
      currentDb: current.map((i) => ({ name: i.name, idNb: i.idNb, chance: i.chance, count: i.count })),
      proposed: proposedOut,
    };
    mobsOut.push(mobObj);
    if (category !== 'confirmed') writeJson(path.join(perMobDir, `${slugify(m.mob)}.json`), mobObj);
  }

  writeJson(path.join(outDir, 'drop_merged_full.json'), { generatedAt: new Date().toISOString(), count: mobsOut.length, mobs: mobsOut });
  writeJson(path.join(outDir, 'items_eden.json'), { count: edenItems.size, items: [...edenItems.values()] });
  writeJson(path.join(outDir, 'items_allakhazam.json'), { count: allakItems.size, items: [...allakItems.values()] });
  writeText(path.join(outDir, 'drops.csv'), csv.join('\n'));

  log.info(`Export scritto in ${outDir}`);
  log.info(`  mob ${mobsOut.length} · item Eden ${edenItems.size} · item Allakhazam ${allakItems.size} · righe CSV ${csv.length - 1}`);
  return outDir;
}
