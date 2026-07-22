import fs from 'node:fs';
import path from 'node:path';
import { extractColumns, extractRows } from './sql-parser.js';
import { writeJson } from '../lib/cache.js';
import { normalizeName } from '../lib/slugify.js';
import { propName, objectTypeName } from '../05-report/props.js';
import { log } from '../lib/logger.js';

/**
 * Estrae il loot ESPLICITO attuale di ogni mob dal dump:
 *   mobxloottemplate -> loottemplate -> itemtemplate
 * Output:
 *   data/01-extracted/db_loot.json   (mob -> item base, per il diff)
 *   data/01-extracted/db_items.json  (Id_nb -> stat complete decodificate, per il pannello)
 */
export function runExtractLoot({ dumpPath, outDir }) {
  log.info(`Leggo dump per loot esistente: ${dumpPath}`);
  const sql = fs.readFileSync(dumpPath, 'utf8');
  const idx = (table, cols) => {
    const all = extractColumns(sql, table);
    return Object.fromEntries(cols.map((c) => [c, all.indexOf(c)]));
  };

  // 1. mobxloottemplate: MobName -> [LootTemplateName]
  const mx = idx('mobxloottemplate', ['MobName', 'LootTemplateName', 'DropCount']);
  const mobTemplates = new Map();
  const templateToMobs = new Map();
  for (const r of extractRows(sql, 'mobxloottemplate')) {
    const mob = r[mx.MobName];
    const key = normalizeName(mob);
    const tpl = String(r[mx.LootTemplateName]);
    let e = mobTemplates.get(key);
    if (!e) {
      e = { mob, templates: new Set(), dropCount: Number(r[mx.DropCount]) };
      mobTemplates.set(key, e);
    }
    e.templates.add(tpl);
    if (!templateToMobs.has(tpl)) templateToMobs.set(tpl, []);
    templateToMobs.get(tpl).push(key);
  }
  log.info(`Mob con loot esplicito: ${mobTemplates.size}`);

  // 2. loottemplate: TemplateName -> [{item, chance, count}]
  const lt = idx('loottemplate', ['TemplateName', 'ItemTemplateID', 'Chance', 'Count']);
  const tplItems = new Map();
  const wantedItems = new Set();
  for (const r of extractRows(sql, 'loottemplate')) {
    const tpl = String(r[lt.TemplateName]);
    if (!templateToMobs.has(tpl)) continue;
    if (!tplItems.has(tpl)) tplItems.set(tpl, []);
    const item = String(r[lt.ItemTemplateID]);
    tplItems.get(tpl).push({ item, chance: Number(r[lt.Chance]), count: Number(r[lt.Count]) });
    wantedItems.add(item);
  }

  // 3. itemtemplate: colonne complete per gli item del loot
  const cols = [
    'Id_nb', 'Name', 'Level', 'Quality', 'DPS_AF', 'SPD_ABS', 'Hand', 'Type_Damage',
    'Object_Type', 'Item_Type', 'Model', 'Bonus', 'ExtraBonus', 'ExtraBonusType',
    'SpellID', 'ProcSpellID', 'ProcSpellID1', 'ProcChance', 'Realm', 'AllowedClasses',
    'Description',
    ...Array.from({ length: 10 }, (_, i) => `Bonus${i + 1}`),
    ...Array.from({ length: 10 }, (_, i) => `Bonus${i + 1}Type`),
  ];
  const ii = idx('itemtemplate', cols);
  const itemInfo = new Map(); // Id_nb -> {name, level, realm} (per db_loot)
  const itemDetails = {}; // Id_nb -> stat complete decodificate (per db_items)
  for (const r of extractRows(sql, 'itemtemplate')) {
    const id = String(r[ii.Id_nb]);
    if (!wantedItems.has(id)) continue;
    const num = (c) => Number(r[ii[c]]);
    const bonuses = [];
    for (let i = 1; i <= 10; i++) {
      const v = num(`Bonus${i}`);
      const t = num(`Bonus${i}Type`);
      if (v !== 0 && t !== 0) bonuses.push({ code: t, value: v, name: propName(t) });
    }
    const eb = num('ExtraBonus');
    if (eb !== 0 && num('ExtraBonusType') !== 0)
      bonuses.push({ code: num('ExtraBonusType'), value: eb, name: propName(num('ExtraBonusType')) });

    itemInfo.set(id, { name: r[ii.Name], level: num('Level'), realm: num('Realm') });
    itemDetails[id] = {
      idNb: id,
      name: r[ii.Name],
      level: num('Level'),
      quality: num('Quality'),
      dpsAf: num('DPS_AF'),
      spdAbs: num('SPD_ABS'),
      objectType: num('Object_Type'),
      objectTypeName: objectTypeName(num('Object_Type')),
      itemType: num('Item_Type'),
      damageType: num('Type_Damage'),
      realm: num('Realm'),
      bonuses,
      baseBonus: num('Bonus'),
      procSpellId: num('ProcSpellID') || num('ProcSpellID1') || null,
      chargeSpellId: num('SpellID') || null,
      allowedClasses: r[ii.AllowedClasses] || '',
      description: r[ii.Description] || '',
    };
  }

  // 4. compone db_loot
  const out = {};
  for (const [key, e] of mobTemplates) {
    const items = [];
    for (const tpl of e.templates) {
      for (const li of tplItems.get(tpl) ?? []) {
        const info = itemInfo.get(li.item) ?? {};
        items.push({
          idNb: li.item,
          name: info.name ?? null,
          nameNorm: info.name ? normalizeName(info.name) : null,
          chance: li.chance,
          count: li.count,
          level: info.level ?? null,
          realm: info.realm ?? null,
          missing: !info.name,
        });
      }
    }
    out[key] = { mob: e.mob, templates: [...e.templates], dropCount: e.dropCount, items };
  }

  writeJson(path.join(outDir, 'db_loot.json'), {
    generatedAt: new Date().toISOString(),
    mobCount: Object.keys(out).length,
    mobs: out,
  });
  writeJson(path.join(outDir, 'db_items.json'), {
    generatedAt: new Date().toISOString(),
    count: Object.keys(itemDetails).length,
    items: itemDetails,
  });
  log.info(`db_loot.json: ${Object.keys(out).length} mob · db_items.json: ${Object.keys(itemDetails).length} item con stat.`);
  return out;
}
