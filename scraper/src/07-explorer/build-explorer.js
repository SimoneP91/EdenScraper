import path from 'node:path';
import fs from 'node:fs';
import { extractColumns, extractRows } from '../00-extract-db/sql-parser.js';
import { writeText } from '../lib/cache.js';
import { PROP, OBJECT_TYPE } from '../05-report/props.js';
import { log } from '../lib/logger.js';
import { renderExplorer } from './render-explorer.js';

/**
 * Genera l'Item Explorer: un Artifact HTML autonomo che replica item-finder.js
 * (ricerca nome/slot/livello, profilo item, drop, mercanti, ricette+ramificazione,
 * comando GM). I dati sono estratti dal dump e incorporati compatti.
 */
export function runExplorer({ dumpPath, dataDir }) {
  log.info(`Leggo il dump: ${dumpPath}`);
  const sql = fs.readFileSync(dumpPath, 'utf8');
  const col = (t, c) => { const a = extractColumns(sql, t); return Object.fromEntries(c.map((x) => [x, a.indexOf(x)])); };

  // --- items ---
  const ic = col('itemtemplate', ['Id_nb', 'Name', 'Level', 'Quality', 'Object_Type', 'Item_Type', 'Realm',
    'DPS_AF', 'SPD_ABS', 'Price', 'ProcSpellID', 'ProcSpellID1', 'SpellID', 'IsDropable', 'IsTradable',
    ...Array.from({ length: 10 }, (_, i) => `Bonus${i + 1}`), ...Array.from({ length: 10 }, (_, i) => `Bonus${i + 1}Type`)]);
  const items = [];
  const idToIdx = new Map();
  const spellIds = new Set();
  for (const r of extractRows(sql, 'itemtemplate')) {
    const b = [];
    for (let i = 1; i <= 10; i++) { const v = +r[ic[`Bonus${i}`]], t = +r[ic[`Bonus${i}Type`]]; if (v && t) b.push([t, v]); }
    const ps = +r[ic.ProcSpellID] || +r[ic.ProcSpellID1] || 0;
    const sp = +r[ic.SpellID] || 0;
    if (ps) spellIds.add(String(ps));
    if (sp) spellIds.add(String(sp));
    idToIdx.set(r[ic.Id_nb], items.length);
    items.push({ i: r[ic.Id_nb], n: r[ic.Name], l: +r[ic.Level], q: +r[ic.Quality], ot: +r[ic.Object_Type],
      it: +r[ic.Item_Type], rl: +r[ic.Realm], d: +r[ic.DPS_AF], s: +r[ic.SPD_ABS], pr: +r[ic.Price],
      ps, sp, dr: +r[ic.IsDropable] ? 1 : 0, tr: +r[ic.IsTradable] ? 1 : 0, b });
  }
  log.info(`items: ${items.length}`);

  // --- loot: [templateName, itemId, chance, count] ---
  const lc = col('loottemplate', ['TemplateName', 'ItemTemplateID', 'Chance', 'Count']);
  const loot = [...extractRows(sql, 'loottemplate')].map((r) => [r[lc.TemplateName], r[lc.ItemTemplateID], +r[lc.Chance], +r[lc.Count]]);
  // --- mobx: [mobName, templateName] ---
  const xc = col('mobxloottemplate', ['MobName', 'LootTemplateName']);
  const mobx = [...extractRows(sql, 'mobxloottemplate')].map((r) => [r[xc.MobName], r[xc.LootTemplateName]]);

  // --- merchant: compresso a indici (itemIdx, listIdx) ---
  const mc = col('merchantitem', ['ItemListID', 'ItemTemplateID']);
  const listDict = [];
  const listIdx = new Map();
  const merchPairs = [];
  for (const r of extractRows(sql, 'merchantitem')) {
    const ii = idToIdx.get(r[mc.ItemTemplateID]);
    if (ii == null) continue; // vende un item inesistente: ignora
    let li = listIdx.get(r[mc.ItemListID]);
    if (li == null) { li = listDict.length; listDict.push(r[mc.ItemListID]); listIdx.set(r[mc.ItemListID], li); }
    merchPairs.push([ii, li]);
  }

  // --- crafting: [productId, ingredientId, count] + meta ---
  const cc = col('craftedxitem', ['CraftedItemId_nb', 'IngredientId_nb', 'Count']);
  const craft = [...extractRows(sql, 'craftedxitem')].map((r) => [r[cc.CraftedItemId_nb], r[cc.IngredientId_nb], +r[cc.Count]]);
  const ec = col('crafteditem', ['Id_nb', 'CraftingLevel', 'CraftingSkillType']);
  const craftMeta = {};
  for (const r of extractRows(sql, 'crafteditem')) craftMeta[r[ec.Id_nb]] = [+r[ec.CraftingLevel], +r[ec.CraftingSkillType]];

  // --- spell: solo quelle referenziate ---
  const spells = {};
  try {
    const sc = col('spell', ['SpellID', 'Name']);
    for (const r of extractRows(sql, 'spell')) if (spellIds.has(String(r[sc.SpellID]))) spells[String(r[sc.SpellID])] = r[sc.Name];
  } catch { /* niente tabella spell */ }

  const data = {
    generatedAt: new Date().toISOString(),
    items, loot, mobx, merchPairs, listDict, craft, craftMeta, spells,
    PROP, OBJECT_TYPE,
  };

  const html = renderExplorer(data);
  const outFile = path.join(dataDir, '05-output', 'item-explorer.html');
  writeText(outFile, html);
  const mb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
  log.info(`Item Explorer scritto: ${outFile} (${mb} MB)`);
  log.info(`  items ${items.length} · loot ${loot.length} · merch ${merchPairs.length} · craft ${craft.length} · spell ${Object.keys(spells).length}`);
  return outFile;
}
