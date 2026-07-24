#!/usr/bin/env node
/**
 * item-finder.js — profilo completo di un item dal dump SQL.
 * Uso:  node scripts/item-finder.js "reactive draining arcanium armor tincture"
 *       node scripts/item-finder.js Reactive_Draining_Arcanium_Armor_Tincture
 *       node scripts/item-finder.js "arcanium armor tincture" --list   (solo elenco match)
 *
 * Mostra: cosa è (stat + bonus decodificati), spell collegate, chi lo droppa,
 * chi lo vende, in quali ricette è ingrediente, se è esso stesso craftato, e
 * un elenco grezzo di TUTTE le tabelle che citano il suo Id_nb.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractColumns, extractRows } from '../src/00-extract-db/sql-parser.js';
import { propName, objectTypeName, REALM } from '../src/05-report/props.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DUMP = path.resolve(root, '..', 'sql', 'ardred-db-20260717-222844.sql');

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const query = args.filter((a) => !a.startsWith('--')).join(' ').trim();
if (!query) {
  console.log('Uso: node scripts/item-finder.js "<nome o Id_nb>" [--list]');
  process.exit(1);
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const q = norm(query);

// comando GM: /item create <Id_nb>  (Id_nb con spazi -> tra virgolette)
const gmCreate = (id) => `/item create ${/\s/.test(id) ? `"${id}"` : id}`;

// ---- util: vista a tabella CLI ----
const C = { dim: '\x1b[2m', b: '\x1b[1m', gold: '\x1b[33m', grn: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m', off: '\x1b[0m' };
function trunc(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function table(headers, rows, maxw = 42) {
  if (!rows.length) return C.dim + '  (nessuno)' + C.off;
  const w = headers.map((h, i) => Math.min(maxw, Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length))));
  const fmt = (cells, color = '') => '  ' + cells.map((c, i) => color + trunc(c, w[i]).padEnd(w[i]) + (color ? C.off : '')).join('  ');
  const sep = '  ' + w.map((x) => '─'.repeat(x)).join('  ');
  return [fmt(headers, C.dim), sep, ...rows.map((r) => fmt(r))].join('\n');
}
function head(t) { return `\n${C.b}${C.gold}══ ${t} ══${C.off}`; }

console.log(`${C.dim}Leggo il dump…${C.off}`);
const sql = fs.readFileSync(DUMP, 'utf8');

// ---- indici tabelle ----
function index(table, cols) {
  const all = extractColumns(sql, table);
  const idx = Object.fromEntries(cols.map((c) => [c, all.indexOf(c)]));
  const rows = [];
  for (const r of extractRows(sql, table)) {
    const o = {};
    for (const c of cols) o[c] = r[idx[c]];
    rows.push(o);
  }
  return rows;
}

const ITEM_COLS = ['Id_nb', 'Name', 'Level', 'Quality', 'DPS_AF', 'SPD_ABS', 'Object_Type', 'Item_Type', 'Hand',
  'Type_Damage', 'Model', 'Realm', 'Price', 'Weight', 'BonusLevel', 'IsDropable', 'IsTradable', 'CanDropAsLoot',
  'ProcSpellID', 'ProcSpellID1', 'SpellID', 'SpellID1', 'PoisonSpellID', 'AllowedClasses', 'Description',
  ...Array.from({ length: 10 }, (_, i) => `Bonus${i + 1}`), 'Bonus', 'ExtraBonus',
  ...Array.from({ length: 10 }, (_, i) => `Bonus${i + 1}Type`), 'ExtraBonusType'];

const items = index('itemtemplate', ITEM_COLS);
const byId = new Map(items.map((i) => [i.Id_nb, i]));

// ricerca
let matches = items.filter((i) => norm(i.Id_nb) === q || norm(i.Name) === q);
if (!matches.length) matches = items.filter((i) => norm(i.Name).includes(q) || norm(i.Id_nb).includes(q));

if (!matches.length) { console.log(`${C.red}Nessun item trovato per "${query}".${C.off}`); process.exit(0); }

// elenco match SEMPRE (anche con 1 solo), con il comando GM copia-incolla
console.log(`\n${C.b}${matches.length} item ${matches.length === 1 ? 'trovato' : 'corrispondono'} per "${query}":${C.off}`);
console.log(table(['Name', 'lvl', 'realm', 'comando GM (copia-incolla)'],
  matches.map((i) => [i.Name, i.Level, REALM[+i.Realm] ?? i.Realm, gmCreate(i.Id_nb)]), 90));
if (listOnly || matches.length > 4) {
  console.log(`\n${C.dim}Passa un Id_nb esatto per il profilo completo (o riduci i risultati). Con >4 match mostro solo l'elenco.${C.off}`);
  process.exit(0);
}
if (matches.length > 1) console.log(`\n${C.dim}Mostro il profilo di tutti e ${matches.length}.${C.off}`);

// indici delle tabelle collegate (una volta sola)
const loot = index('loottemplate', ['TemplateName', 'ItemTemplateID', 'Chance', 'Count']);
const mobx = index('mobxloottemplate', ['MobName', 'LootTemplateName', 'DropCount']);
const merch = index('merchantitem', ['ItemListID', 'ItemTemplateID', 'PageNumber', 'SlotPosition']);
const cxi = index('craftedxitem', ['CraftedItemId_nb', 'IngredientId_nb', 'Count']);
const crafted = index('crafteditem', ['Id_nb', 'CraftingLevel', 'CraftingSkillType']);
let spellById = new Map();
try {
  const sc = extractColumns(sql, 'spell');
  const si = Object.fromEntries(['SpellID', 'Name', 'Description'].map((c) => [c, sc.indexOf(c)]));
  for (const r of extractRows(sql, 'spell')) spellById.set(String(r[si.SpellID]), { name: r[si.Name], desc: r[si.Description] });
} catch { /* tabella spell assente */ }

// mappa template -> mob
const tplToMobs = new Map();
for (const m of mobx) { const k = String(m.LootTemplateName); if (!tplToMobs.has(k)) tplToMobs.set(k, []); tplToMobs.get(k).push(m); }

const CRAFT_SKILL = { 1: 'Weaponcraft', 2: 'Armorcraft', 3: 'Siegecraft', 4: 'Alchemy', 6: 'Fletching', 8: 'Spellcraft', 11: 'Tailoring', 12: 'Metalworking', 13: 'Leatherworking', 14: 'Clothworking', 15: 'Gemcutting', 16: 'Herbcraft', 17: 'Siegecrafting' };

function bonuses(it) {
  const out = [];
  for (let i = 1; i <= 10; i++) { const v = +it[`Bonus${i}`], t = +it[`Bonus${i}Type`]; if (v && t) out.push(`${v > 0 ? '+' : ''}${v} ${propName(t)}`); }
  const eb = +it.ExtraBonus; if (eb && +it.ExtraBonusType) out.push(`${eb > 0 ? '+' : ''}${eb} ${propName(+it.ExtraBonusType)} (extra)`);
  return out;
}
function spellLine(id) { const s = spellById.get(String(id)); return s ? `#${id} ${s.name}${s.desc ? ' — ' + trunc(s.desc, 60) : ''}` : `#${id} (spell non in tabella)`; }

// ---- ramificazione crafting: reagenti e loro provenienza, ad albero ----
const MAXDEPTH = 5;
const byNormId = new Map(items.map((i) => [norm(i.Id_nb), i]));
const cxiByProduct = new Map();
for (const r of cxi) { const k = norm(r.CraftedItemId_nb); if (!cxiByProduct.has(k)) cxiByProduct.set(k, []); cxiByProduct.get(k).push(r); }
const recipeOf = (idn) => cxiByProduct.get(idn) ?? [];
function dropInfo(idn) { let mobs = 0; for (const l of loot) if (norm(l.ItemTemplateID) === idn) mobs += (tplToMobs.get(String(l.TemplateName))?.length || 0); return mobs; }
const merchCount = (idn) => merch.reduce((n, m) => n + (norm(m.ItemTemplateID) === idn ? 1 : 0), 0);
function srcTag(idn) {
  const d = dropInfo(idn), mc = merchCount(idn), rec = recipeOf(idn);
  const p = [];
  if (d) p.push(`${C.cyan}drop ${d} mob${C.off}`);
  if (mc) p.push(`${C.gold}vend. ${mc}${C.off}`);
  if (rec.length) p.push(`${C.grn}craft ${rec.length} reag${C.off}`);
  if (!p.length) return byNormId.has(idn) ? `${C.dim}nessuna fonte nota${C.off}` : `${C.dim}materia prima${C.off}`;
  return p.join(' · ');
}
function ramify(idn, depth, seen, prefix) {
  const rec = recipeOf(idn);
  rec.forEach((r, i) => {
    const ingN = norm(r.IngredientId_nb);
    const last = i === rec.length - 1;
    const nm = byNormId.get(ingN)?.Name ?? r.IngredientId_nb;
    console.log(`  ${prefix}${last ? '└─ ' : '├─ '}${C.b}${r.Count}x ${nm}${C.off}   ${srcTag(ingN)}`);
    if (recipeOf(ingN).length && depth < MAXDEPTH && !seen.has(ingN)) {
      seen.add(ingN);
      ramify(ingN, depth + 1, seen, prefix + (last ? '   ' : '│  '));
    }
  });
}
function rawRefs(idNb) {
  // dove compare 'Id_nb' (tra apici) in tutto il dump -> tabella
  const marks = [...sql.matchAll(/(?:INSERT INTO|CREATE TABLE) `([^`]+)`/g)].map((x) => ({ pos: x.index, tab: x[1] }));
  const tableAt = (pos) => { let t = '?'; for (const mk of marks) { if (mk.pos <= pos) t = mk.tab; else break; } return t; };
  const re = new RegExp("'" + idNb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'", 'g');
  const counts = new Map();
  let m; while ((m = re.exec(sql))) { const t = tableAt(m.index); counts.set(t, (counts.get(t) || 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

for (const it of matches) {
  const id = it.Id_nb;
  console.log(`\n${C.b}${C.cyan}${'═'.repeat(64)}${C.off}`);
  console.log(`${C.b}${it.Name}${C.off}  ${C.dim}[${id}]${C.off}`);
  console.log(`${C.gold}GM:${C.off} ${gmCreate(id)}`);

  // --- ITEM ---
  console.log(head('COS’È'));
  const kv = [
    ['Livello', it.Level], ['Qualità', it.Quality + '%'], ['Reame', (REALM[+it.Realm] ?? it.Realm)],
    ['Tipo oggetto', `${objectTypeName(+it.Object_Type)} (${it.Object_Type})`], ['Slot (Item_Type)', it.Item_Type],
    ['DPS_AF', it.DPS_AF], ['SPD_ABS', it.SPD_ABS], ['Model', it.Model], ['Prezzo', it.Price],
    ['Droppabile', +it.IsDropable ? 'sì' : 'no'], ['Scambiabile', +it.IsTradable ? 'sì' : 'no'],
  ];
  console.log(table(['campo', 'valore'], kv));
  const bon = bonuses(it);
  if (bon.length) { console.log(`\n  ${C.dim}Bonus:${C.off}`); console.log('  ' + bon.map((b) => C.grn + b + C.off).join('  ·  ')); }
  if (it.AllowedClasses && it.AllowedClasses !== ';;' && it.AllowedClasses !== '0') console.log(`\n  ${C.dim}Classi:${C.off} ${it.AllowedClasses}`);

  // --- SPELL ---
  const spells = [['Proc', it.ProcSpellID], ['Proc2', it.ProcSpellID1], ['Use/Charge', it.SpellID], ['Use2', it.SpellID1], ['Poison', it.PoisonSpellID]]
    .filter(([, v]) => +v);
  if (spells.length) { console.log(head('SPELL COLLEGATE')); console.log(table(['tipo', 'spell'], spells.map(([k, v]) => [k, spellLine(v)]))); }

  // --- DROPPATO DA ---
  const dropRows = loot.filter((l) => String(l.ItemTemplateID) === id);
  const dropTable = [];
  for (const d of dropRows) for (const m of (tplToMobs.get(String(d.TemplateName)) ?? [{ MobName: '(nessun mob usa questo template)', DropCount: '' }]))
    dropTable.push([m.MobName, d.TemplateName, d.Chance, d.Count, m.DropCount]);
  console.log(head(`DROPPATO DA (${dropTable.length})`));
  console.log(table(['mob', 'template', 'chance', 'count', 'dropCnt'], dropTable));

  // --- VENDUTO DA ---
  const sell = merch.filter((m) => String(m.ItemTemplateID) === id).map((m) => [m.ItemListID, m.PageNumber, m.SlotPosition]);
  console.log(head(`VENDUTO DA (merchantitem) (${sell.length})`));
  console.log(table(['lista mercante', 'pagina', 'slot'], sell));

  // --- INGREDIENTE IN ---
  const asIngr = cxi.filter((r) => String(r.IngredientId_nb).toLowerCase() === id.toLowerCase())
    .map((r) => [r.CraftedItemId_nb, byId.get(r.CraftedItemId_nb)?.Name ?? '?', r.Count]);
  console.log(head(`USATO COME INGREDIENTE IN (${asIngr.length} ricette)`));
  console.log(table(['ricetta (Id_nb)', 'produce', 'qta'], asIngr));

  // --- RICETTA E RAMIFICAZIONE ---
  console.log(head('RICETTA E RAMIFICAZIONE (reagenti → provenienza)'));
  const myRecipe = recipeOf(norm(id));
  if (!myRecipe.length) {
    console.log(`  ${C.dim}Non craftabile: nessuna ricetta produce questo item.${C.off}`);
  } else {
    const meta = crafted.find((c) => norm(c.Id_nb) === norm(id))
      ?? crafted.find((c) => norm(c.Id_nb).replace(/\d+$/, '') === norm(id).replace(/\d+$/, ''));
    if (meta) console.log(`  ${C.dim}skill:${C.off} ${CRAFT_SKILL[+meta.CraftingSkillType] ?? meta.CraftingSkillType}  ${C.dim}livello:${C.off} ${meta.CraftingLevel}`);
    console.log(`  ${C.b}${it.Name}${C.off}  ${C.dim}(prodotto)${C.off}`);
    ramify(norm(id), 1, new Set([norm(id)]), '');
    console.log(`\n  ${C.dim}Legenda: ${C.cyan}drop N mob${C.off}${C.dim} = droppato · ${C.gold}vend. N${C.off}${C.dim} = venduto da N mercanti · ${C.grn}craft N reag${C.off}${C.dim} = a sua volta craftabile (espanso sopra) · materia prima = non in itemtemplate${C.off}`);
  }

  // --- RIFERIMENTI GREZZI ---
  console.log(head('TUTTE LE TABELLE CHE CITANO QUESTO Id_nb'));
  console.log(table(['tabella', 'occorrenze'], rawRefs(id)));
}

function rawHas(idNb) { return items.some((i) => norm(i.Id_nb) === norm(idNb)); }
console.log('');
