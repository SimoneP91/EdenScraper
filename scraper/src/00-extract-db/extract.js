import fs from 'node:fs';
import path from 'node:path';
import { extractColumns, extractRows } from './sql-parser.js';
import { writeJson } from '../lib/cache.js';
import { normalizeName } from '../lib/slugify.js';
import { log } from '../lib/logger.js';

/**
 * Fase 0: dal dump SQL produce
 *  - config/target-zones.json     (region Expansion 0/1)
 *  - data/01-extracted/mob_targets.json
 *  - data/01-extracted/item_existing.json
 */
export function runExtract({ dumpPath, outDir, configDir }) {
  log.info(`Leggo dump: ${dumpPath}`);
  const sql = fs.readFileSync(dumpPath, 'utf8');

  const pick = (table, wanted) => {
    const cols = extractColumns(sql, table);
    const idx = Object.fromEntries(wanted.map((w) => [w, cols.indexOf(w)]));
    for (const [k, v] of Object.entries(idx))
      if (v === -1) throw new Error(`Colonna ${k} non trovata in ${table}`);
    return idx;
  };

  // --- regions in scope (Expansion 0/1) ---
  const rIdx = pick('regions', ['RegionID', 'Name', 'Expansion']);
  const targetRegions = new Map(); // RegionID -> {name, expansion}
  for (const row of extractRows(sql, 'regions')) {
    const exp = Number(row[rIdx.Expansion]);
    if (exp === 0 || exp === 1)
      targetRegions.set(String(row[rIdx.RegionID]), { name: row[rIdx.Name], expansion: exp });
  }
  log.info(`Region in scope (Expansion 0/1): ${targetRegions.size}`);

  // --- zone (nomi veri delle location; la tabella regions ha solo placeholder) ---
  // Una region può contenere più zone: la zona esatta di uno spawn si ricava dalle
  // sue coordinate (zx = floor(X/8192); zona dove OffsetX <= zx < OffsetX+Width).
  const zIdx = pick('zones', ['RegionID', 'Name', 'OffsetX', 'OffsetY', 'Width', 'Height']);
  const regionZones = new Map(); // regionId -> [{name, ox, oy, w, h}]
  for (const row of extractRows(sql, 'zones')) {
    const region = Number(row[zIdx.RegionID]);
    if (!targetRegions.has(String(region))) continue;
    if (!regionZones.has(region)) regionZones.set(region, []);
    regionZones.get(region).push({
      name: row[zIdx.Name],
      ox: Number(row[zIdx.OffsetX]),
      oy: Number(row[zIdx.OffsetY]),
      w: Number(row[zIdx.Width]),
      h: Number(row[zIdx.Height]),
    });
  }
  const resolveZone = (region, x, y) => {
    const zs = regionZones.get(region);
    if (!zs || !zs.length) return null;
    if (zs.length === 1) return zs[0].name;
    const zx = Math.floor(Number(x) / 8192);
    const zy = Math.floor(Number(y) / 8192);
    for (const z of zs) if (zx >= z.ox && zx < z.ox + z.w && zy >= z.oy && zy < z.oy + z.h) return z.name;
    return null; // spawn fuori da tutte le zone note della region
  };

  writeJson(path.join(configDir, 'target-zones.json'), {
    generatedAt: new Date().toISOString(),
    regions: [...targetRegions.entries()].map(([id, r]) => ({
      regionId: Number(id),
      ...r,
      zones: (regionZones.get(Number(id)) ?? []).map((z) => z.name),
    })),
  });

  // --- nomi mob con loot esplicito già in DB ---
  const mxIdx = pick('mobxloottemplate', ['MobName']);
  const hasLoot = new Set();
  for (const row of extractRows(sql, 'mobxloottemplate')) hasLoot.add(normalizeName(row[mxIdx.MobName]));
  log.info(`Nomi mob con loot esplicito esistente: ${hasLoot.size}`);

  // --- mob univoci in scope ---
  const mIdx = pick('mob', ['Name', 'Region', 'Level', 'Realm', 'X', 'Y']);
  const mobs = new Map(); // normName -> aggregato
  let spawnCount = 0;
  for (const row of extractRows(sql, 'mob')) {
    if (!targetRegions.has(String(row[mIdx.Region]))) continue;
    spawnCount++;
    const name = row[mIdx.Name];
    const key = normalizeName(name);
    const lvl = Number(row[mIdx.Level]);
    const realm = Number(row[mIdx.Realm]);
    const region = Number(row[mIdx.Region]);
    const zone = resolveZone(region, row[mIdx.X], row[mIdx.Y]);
    let m = mobs.get(key);
    if (!m) {
      m = {
        name,
        minLevel: lvl,
        maxLevel: lvl,
        realms: new Set(),
        regions: new Set(),
        locations: new Map(), // "zone|region" -> {zone, region}
        spawns: 0,
        hasExistingLoot: hasLoot.has(key),
      };
      mobs.set(key, m);
    }
    m.minLevel = Math.min(m.minLevel, lvl);
    m.maxLevel = Math.max(m.maxLevel, lvl);
    m.realms.add(realm);
    m.regions.add(region);
    m.locations.set(`${zone ?? '?'}|${region}`, { zone: zone ?? null, region });
    m.spawns++;
  }
  log.info(`Mob-spawn in scope: ${spawnCount} — nomi univoci: ${mobs.size}`);

  const mobTargets = [...mobs.values()]
    .map((m) => ({ ...m, realms: [...m.realms], regions: [...m.regions], locations: [...m.locations.values()] }))
    .sort((a, b) => a.name.localeCompare(b.name));
  writeJson(path.join(outDir, 'mob_targets.json'), {
    generatedAt: new Date().toISOString(),
    dump: path.basename(dumpPath),
    count: mobTargets.length,
    mobs: mobTargets,
  });

  // --- itemtemplate esistenti (per matching Fase 4) ---
  const iIdx = pick('itemtemplate', ['Id_nb', 'Name', 'Level', 'Object_Type', 'Item_Type', 'Realm']);
  const items = [];
  for (const row of extractRows(sql, 'itemtemplate')) {
    items.push({
      idNb: row[iIdx.Id_nb],
      name: row[iIdx.Name],
      nameNorm: normalizeName(row[iIdx.Name] ?? ''),
      level: Number(row[iIdx.Level]),
      objectType: Number(row[iIdx.Object_Type]),
      itemType: Number(row[iIdx.Item_Type]),
      realm: Number(row[iIdx.Realm]),
    });
  }
  log.info(`itemtemplate esistenti: ${items.length}`);
  writeJson(path.join(outDir, 'item_existing.json'), {
    generatedAt: new Date().toISOString(),
    count: items.length,
    items,
  });

  log.info('Fase 0 completata.');
  return { regions: targetRegions.size, mobNames: mobs.size, spawns: spawnCount, items: items.length };
}
