import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../lib/cache.js';
import { slugify } from '../lib/slugify.js';

export const sqlq = (s) => "'" + String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";

const ABS_BY_ARMOR = { 32: 0, 33: 10, 34: 19, 35: 27, 36: 34, 37: 19, 38: 27 };
function deriveDpsAf(ot, level) {
  if (ot >= 32 && ot <= 38) return level;
  if (ot === 42) return level;
  if (ot >= 1 && ot <= 31) return Math.round((1.2 + 0.3 * level) * 10);
  return 0;
}
function deriveSpdAbs(d, ot) {
  if (ot >= 32 && ot <= 38) return ABS_BY_ARMOR[ot] ?? 0;
  return Number(d.weapon_speed) || 0;
}

/** Colonne itemtemplate per un item nuovo, da dati Eden (oggetto colonna->valore). */
export function buildItemCols(idNb, d) {
  const level = Number(d.level) || 0;
  const ot = Number(d.object_type) || 0;
  const cols = {
    Id_nb: idNb,
    Name: d.name,
    Level: level,
    Quality: Number(d.quality) || 100,
    DPS_AF: deriveDpsAf(ot, level),
    SPD_ABS: deriveSpdAbs(d, ot),
    Hand: Number(d.weapon_hand) || 0,
    Type_Damage: Number(d.damage_type) || 0,
    Object_Type: ot,
    Item_Type: Number(d.item_type) || 0,
    Model: Number(d.model) || 0,
    Realm: Number(d.realm) || 0,
    BonusLevel: Number(d.bonus_level) || 0,
    IsPickable: 1,
    IsDropable: 1,
    CanDropAsLoot: 1,
    IsTradable: Number(d.is_tradable) ? 1 : 0,
    AllowedClasses: d.allowed_classes || '',
  };
  const types = String(d.bonus_types || '').split(',').map((x) => x.trim()).filter(Boolean);
  const values = String(d.bonus_values || '').split(',').map((x) => Number(x.trim()));
  for (let i = 0; i < Math.min(10, types.length); i++) {
    cols[`Bonus${i + 1}`] = values[i] || 0;
    cols[`Bonus${i + 1}Type`] = Number(types[i]) || 0;
  }
  return cols;
}

/** Rende un oggetto colonne in una INSERT (con ON DUPLICATE per idempotenza). */
export function colsToInsert(table, cols, { onDup } = {}) {
  const names = Object.keys(cols);
  const vals = names.map((n) => (typeof cols[n] === 'number' ? cols[n] : sqlq(cols[n])));
  let s = `INSERT INTO ${table} (${names.join(', ')}) VALUES (${vals.join(', ')})`;
  if (onDup) s += `\n  ON DUPLICATE KEY UPDATE ${onDup}`;
  return s + ';';
}

/**
 * Piano di mapping condiviso — modalità ADD-ONLY (non distruttiva).
 * Regole (dalla revisione del collaboratore):
 *  - NON si cancella e NON si riscrive nulla di esistente (chance -3, DropCount, ecc. restano intatti).
 *  - Si aggiungono SOLO gli item che il mob NON droppa già, sul suo template esistente
 *    (o su un template nuovo = nome mob se il mob non ha ancora loot).
 *  - Chance dei nuovi drop = placeholder (default 100), da tarare come fronte separato.
 * Ritorna: { mobs:[{mob, template, isNewTemplate, items:[{idNb,name,chance,count,source,kind}]}],
 *            newItemCols: Map<idNb, colsObj>, skipped, stats }
 */
export function buildPlan({ dataDir, extractedDir }) {
  const merged = readJson(path.join(dataDir, '03-merged', 'drop_merged.json'));
  const dbLoot = readJson(path.join(extractedDir, 'db_loot.json'));
  const itemExisting = readJson(path.join(extractedDir, 'item_existing.json'));
  if (!merged || !dbLoot || !itemExisting) throw new Error('Mancano merge/db_loot/item_existing');

  const NEW_CHANCE = Number(process.env.NEW_CHANCE ?? 100); // placeholder per i nuovi drop

  const catalog = new Map();
  for (const it of itemExisting.items) if (it.nameNorm && !catalog.has(it.nameNorm)) catalog.set(it.nameNorm, it.idNb);
  const existingIds = new Set(itemExisting.items.map((i) => i.idNb));
  const edenItemDir = path.join(dataDir, '02-scraped', 'eden-daoc', 'items');
  const edenCache = new Map();
  const loadEden = (id) => {
    if (edenCache.has(id)) return edenCache.get(id);
    const f = path.join(edenItemDir, `${id}.json`);
    const d = fs.existsSync(f) ? readJson(f) : null;
    edenCache.set(id, d);
    return d;
  };

  const newItemCols = new Map();
  const usedSynthIds = new Set();
  const synthId = (name) => {
    const base = 'scrp_' + slugify(name).replace(/-/g, '_').slice(0, 40);
    let id = base, n = 1;
    while (existingIds.has(id) || usedSynthIds.has(id)) id = `${base}_${n++}`;
    usedSynthIds.add(id);
    return id;
  };

  const mobs = [];
  const skipped = [];
  let reused = 0, created = 0, newLinks = 0;

  for (const [key, m] of Object.entries(merged.mobs)) {
    const proposed = (m.items ?? []).filter((i) => !i.legacy);
    if (!proposed.length) continue;
    const dbEntry = dbLoot.mobs[key];
    const current = dbEntry?.items ?? [];
    const curNames = new Set(current.map((i) => i.nameNorm));

    // ADD-ONLY: solo gli item che il mob NON droppa già
    const toAdd = proposed.filter((i) => !curNames.has(i.nameNorm));
    if (!toAdd.length) continue;

    // aggancio: template esistente del mob, altrimenti nuovo = nome mob
    const template = dbEntry?.templates?.[0] ?? m.mob;
    const isNewTemplate = !dbEntry?.templates?.length;
    if (isNewTemplate) newLinks++;

    const items = [];
    for (const it of toAdd) {
      const nn = it.nameNorm;
      let idNb = catalog.get(nn);
      let kind = 'reuse';
      if (idNb) {
        reused++;
      } else if (it.edenId) {
        const d = loadEden(it.edenId);
        if (!d) { skipped.push({ mob: m.mob, item: it.name, why: 'eden cache mancante' }); continue; }
        idNb = synthId(it.name);
        catalog.set(nn, idNb);
        newItemCols.set(idNb, buildItemCols(idNb, d));
        kind = 'create';
        created++;
      } else {
        skipped.push({ mob: m.mob, item: it.name, why: 'solo Allakhazam, nessuna stat' });
        continue;
      }
      const source = it.sources.includes('eden') ? (it.sources.includes('allakhazam') ? 'E+A' : 'E') : 'A';
      items.push({ idNb, name: it.name, chance: NEW_CHANCE, count: 1, source, kind });
    }
    if (!items.length) continue;
    mobs.push({ mob: m.mob, template, isNewTemplate, minLevel: m.minLevel, maxLevel: m.maxLevel, items });
  }

  return {
    mobs,
    newItemCols,
    skipped,
    newChance: NEW_CHANCE,
    stats: { mobs: mobs.length, reused, created, newLinks, skipped: skipped.length },
  };
}

/** INSERT idempotente add-only (non tocca righe esistenti): salta se la coppia esiste già. */
export function lootInsertGuarded(tpl, item, chance, count) {
  return (
    `INSERT INTO loottemplate (TemplateName, ItemTemplateID, Chance, Count)\n` +
    `SELECT * FROM (SELECT ${sqlq(tpl)} AS TemplateName, ${sqlq(item)} AS ItemTemplateID, ${chance} AS Chance, ${count} AS Count) AS t\n` +
    `WHERE NOT EXISTS (SELECT 1 FROM loottemplate l WHERE l.TemplateName = ${sqlq(tpl)} AND l.ItemTemplateID = ${sqlq(item)});`
  );
}
export function mobxInsertGuarded(mob, tpl, dropCount = 1) {
  return (
    `INSERT INTO mobxloottemplate (MobName, LootTemplateName, DropCount)\n` +
    `SELECT * FROM (SELECT ${sqlq(mob)} AS MobName, ${sqlq(tpl)} AS LootTemplateName, ${dropCount} AS DropCount) AS t\n` +
    `WHERE NOT EXISTS (SELECT 1 FROM mobxloottemplate x WHERE x.MobName = ${sqlq(mob)} AND x.LootTemplateName = ${sqlq(tpl)});`
  );
}
