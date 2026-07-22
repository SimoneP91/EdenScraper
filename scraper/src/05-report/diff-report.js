import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeText } from '../lib/cache.js';
import { normalizeName, slugify } from '../lib/slugify.js';
import { propName, objectTypeName, REALM as REALM_FULL } from './props.js';
import { log } from '../lib/logger.js';
import { renderHtml } from './render-html.js';

const REALM = { 0: 'Tutti', 1: 'Alb', 2: 'Mid', 3: 'Hib' };

/** Decodifica un item Eden (item.php) nella forma leggibile + tiene il raw. */
function decodeEden(d) {
  const types = String(d.bonus_types || '').split(',').map((x) => x.trim()).filter(Boolean);
  const values = String(d.bonus_values || '').split(',').map((x) => x.trim());
  const bonuses = types
    .map((t, i) => ({ code: Number(t), value: Number(values[i]), name: propName(Number(t)) }))
    .filter((b) => b.code && b.value);

  const KIND = { proc: 'proc', use: 'use/charge', react: 'reattivo', passive: 'passivo' };
  const procs = [];
  for (const f of ['proc1_json', 'proc2_json', 'use1_json', 'use2_json', 'react1_json', 'react2_json', 'passive_json']) {
    if (!d[f]) continue;
    try {
      const p = JSON.parse(d[f]);
      const attrs = Object.fromEntries((p.Attributes || []).map(([k, v]) => [k, v]));
      const base = f.replace(/_json|\d/g, '');
      procs.push({ name: p.Name, type: attrs.Type, value: attrs.Value, level: p.Level, kind: KIND[base] ?? base });
    } catch {
      /* json malformato: ignora */
    }
  }
  return {
    idNb: `eden:${d.id}`,
    name: d.name,
    level: Number(d.level),
    quality: Number(d.quality) || null,
    dpsAf: Number(d.dps_af) || null,
    spdAbs: Number(d.weapon_speed) || null,
    objectType: Number(d.object_type),
    objectTypeName: objectTypeName(Number(d.object_type)),
    itemType: Number(d.item_type),
    realm: Number(d.realm),
    utility: Number(d.utility) || null,
    bonuses,
    procs,
    allowedClasses: d.allowed_classes || '',
    source: 'eden',
    // raw compatto: campi significativi, senza i blob *_json (i proc sono già
    // decodificati sopra) né mobs/merchants/quests — tiene il file leggero.
    raw: {
      id: d.id, name: d.name, level: Number(d.level), quality: Number(d.quality),
      realm: Number(d.realm), object_type: Number(d.object_type), item_type: Number(d.item_type),
      weapon_speed: Number(d.weapon_speed) || undefined, damage_type: Number(d.damage_type) || undefined,
      utility: Number(d.utility) || undefined, bonus_level: Number(d.bonus_level) || undefined,
      bonus_types: d.bonus_types, bonus_values: d.bonus_values,
      allowed_classes: d.allowed_classes || undefined,
    },
  };
}

/**
 * Calcola il diff (DB attuale vs proposta) e genera il report HTML con
 * pannelli espandibili (stat leggibili + JSON grezzo) su entrambe le colonne.
 * Output: data/05-output/diff-report.html
 */
export function runReport({ dataDir, extractedDir }) {
  const merged = readJson(path.join(dataDir, '03-merged', 'drop_merged.json'));
  const dbLoot = readJson(path.join(extractedDir, 'db_loot.json'));
  const dbItems = readJson(path.join(extractedDir, 'db_items.json'));
  const zonesCfg = readJson(path.join(process.cwd(), 'config', 'target-zones.json'));
  if (!merged || !dbLoot) throw new Error('Manca drop_merged.json o db_loot.json: lancia --merge --extract-loot');
  if (!dbItems) throw new Error('Manca db_items.json: rilancia --extract-loot');

  const regionName = new Map((zonesCfg?.regions ?? []).map((r) => [r.regionId, r.name]));
  const edenItemDir = path.join(dataDir, '02-scraped', 'eden-daoc', 'items');

  // catalogo itemtemplate esistente (34.546 item) per il segnale "già in catalogo / da creare"
  const itemExisting = readJson(path.join(extractedDir, 'item_existing.json'));
  const catalog = new Map(); // nameNorm -> Id_nb esistente
  for (const it of itemExisting?.items ?? []) if (it.nameNorm && !catalog.has(it.nameNorm)) catalog.set(it.nameNorm, it.idNb);

  // dizionario item deduplicato, riferito per chiave dalle righe
  const dict = {};
  const edenCache = new Map();
  const loadEden = (id) => {
    if (edenCache.has(id)) return edenCache.get(id);
    const f = path.join(edenItemDir, `${id}.json`);
    const d = fs.existsSync(f) ? decodeEden(readJson(f)) : null;
    edenCache.set(id, d);
    return d;
  };

  const rows = [];
  const stats = { changed: 0, newLoot: 0, modified: 0, confirmed: 0, added: 0, removed: 0, legacy: 0 };

  for (const [key, m] of Object.entries(merged.mobs)) {
    const current = dbLoot.mobs[key]?.items ?? [];
    const proposedAll = m.items ?? [];
    const proposed = proposedAll.filter((i) => !i.legacy);
    const legacy = proposedAll.filter((i) => i.legacy);
    if (!current.length && !proposedAll.length) continue;

    const curByName = new Map(current.map((i) => [i.nameNorm, i]));
    const propByName = new Map(proposed.map((i) => [i.nameNorm, i]));
    const added = proposed.filter((i) => !curByName.has(i.nameNorm));
    const removed = current.filter((i) => i.nameNorm && !propByName.has(i.nameNorm));

    let category;
    if (!proposedAll.length) continue;
    if (!current.length) category = 'new';
    else if (added.length || removed.length) category = 'modified';
    else category = 'confirmed';

    if (category === 'confirmed') stats.confirmed++;
    else {
      stats.changed++;
      if (category === 'new') stats.newLoot++;
      else stats.modified++;
      stats.added += added.length;
      stats.removed += removed.length;
      stats.legacy += legacy.length;
    }

    // colonna DB attuale: aggancia le stat del dizionario (chiave D:<idNb>)
    const curOut = current.map((i) => {
      const dkey = `D:${i.idNb}`;
      if (dbItems.items[i.idNb] && !dict[dkey]) dict[dkey] = { ...dbItems.items[i.idNb], source: 'db' };
      if (dict[dkey] && dict[dkey].resolvedId === undefined) {
        dict[dkey].resolvedId = i.idNb; // Id_nb reale del DB
        dict[dkey].idKind = 'existing';
      }
      const hasKey = !!dict[dkey];
      return {
        name: hasKey ? undefined : i.name ?? '(item mancante)', // nome dal dizionario se c'è la scheda
        level: i.level,
        removed: i.nameNorm ? !propByName.has(i.nameNorm) : true,
        key: hasKey ? dkey : null,
      };
    });

    // colonna proposta: Eden -> scheda completa; solo-Allakhazam -> scheda minima
    const propOut = proposed.map((i) => {
      let ikey = null;
      if (i.edenId) {
        ikey = `E:${i.edenId}`;
        if (!dict[ikey]) {
          const dec = loadEden(i.edenId);
          if (dec) dict[ikey] = dec;
          else ikey = null;
        }
      }
      if (!ikey && i.citem) {
        // item solo-Allakhazam: scheda minima (nome, citem, link) senza stat
        ikey = `A:${i.citem}`;
        if (!dict[ikey]) dict[ikey] = { name: i.name, source: 'allakhazam', citem: i.citem };
      }
      const catalogId = catalog.get(i.nameNorm) ?? null; // già in itemtemplate?
      // Id_nb che verrà usato: riuso quello esistente, oppure sintetico scrp_, oppure non creabile
      if (ikey && dict[ikey] && dict[ikey].resolvedId === undefined) {
        if (catalogId) {
          dict[ikey].resolvedId = catalogId;
          dict[ikey].idKind = 'reuse';
        } else if (ikey[0] === 'E') {
          dict[ikey].resolvedId = 'scrp_' + slugify(i.name).replace(/-/g, '_').slice(0, 40);
          dict[ikey].idKind = 'create';
        } else {
          dict[ikey].resolvedId = null;
          dict[ikey].idKind = 'skip'; // solo-Allakhazam, nessuna stat: non creabile
        }
      }
      return {
        name: ikey && dict[ikey] ? undefined : i.name,
        level: ikey && dict[ikey] && dict[ikey].level != null ? undefined : i.level ?? null,
        src: i.sources.includes('eden') ? (i.sources.includes('allakhazam') ? 'E+A' : 'E') : 'A',
        isNew: !curByName.has(i.nameNorm),
        inCatalog: !!catalogId,
        key: ikey,
      };
    });

    rows.push({
      mob: m.mob,
      realm: (m.realm ?? []).map((r) => REALM[r] ?? r).filter((x) => x !== 'Tutti'),
      // "Nome zona (region #)" dalle coordinate; fallback al solo region id
      zones: (m.locations?.length ? m.locations : (m.regions ?? []).map((r) => ({ zone: null, region: r }))).map(
        (l) => (l.zone ? `${l.zone} (reg ${l.region})` : `region ${l.region}`)
      ),
      level: m.minLevel === m.maxLevel ? `${m.minLevel}` : `${m.minLevel}-${m.maxLevel}`,
      category,
      current: curOut,
      proposed: propOut,
      legacy: legacy.map((i) => ({ name: i.name })),
    });
  }

  const order = { modified: 0, new: 1, confirmed: 2 };
  rows.sort((a, b) => order[a.category] - order[b.category] || a.mob.localeCompare(b.mob));

  const html = renderHtml({
    rows,
    dict,
    stats,
    meta: { generatedAt: new Date().toISOString(), total: merged.targetCount, dictSize: Object.keys(dict).length },
  });
  const outFile = path.join(dataDir, '05-output', 'diff-report.html');
  writeText(outFile, html);
  log.info(`Diff report scritto: ${outFile} (dizionario item: ${Object.keys(dict).length})`);
  log.info(
    `  cambiati ${stats.changed} (nuovo loot ${stats.newLoot}, modificati ${stats.modified}), confermati ${stats.confirmed}`
  );
  log.info(`  item aggiunti ${stats.added}, rimossi ${stats.removed}, legacy ${stats.legacy}`);
  return outFile;
}
