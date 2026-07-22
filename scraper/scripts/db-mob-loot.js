import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractColumns, extractRows } from '../src/00-extract-db/sql-parser.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = path.resolve(root, '..', 'sql', 'ardred-db-20260717-222844.sql');
const term = (process.argv[2] || '').toLowerCase();
if (!term) {
  console.log('uso: node scripts/db-mob-loot.js <parte-del-nome-mob>');
  process.exit(1);
}

const sql = fs.readFileSync(dump, 'utf8');
const idx = (table, cols) => {
  const all = extractColumns(sql, table);
  return Object.fromEntries(cols.map((c) => [c, all.indexOf(c)]));
};

// 1. mobxloottemplate: MobName -> LootTemplateName
const mx = idx('mobxloottemplate', ['MobName', 'LootTemplateName', 'DropCount']);
const templates = [];
for (const r of extractRows(sql, 'mobxloottemplate')) {
  if (String(r[mx.MobName]).toLowerCase().includes(term))
    templates.push({ mob: r[mx.MobName], tpl: r[mx.LootTemplateName], dropCount: r[mx.DropCount] });
}
if (!templates.length) {
  console.log(`Nessuna riga mobxloottemplate per mob contenente "${term}".`);
  process.exit(0);
}
console.log(`\n=== mobxloottemplate ===`);
templates.forEach((t) => console.log(`  mob "${t.mob}" -> template "${t.tpl}" (DropCount ${t.dropCount})`));

// 2. loottemplate per quei TemplateName
const tplNames = new Set(templates.map((t) => String(t.tpl)));
const lt = idx('loottemplate', ['TemplateName', 'ItemTemplateID', 'Chance', 'Count']);
const entries = [];
for (const r of extractRows(sql, 'loottemplate')) {
  if (tplNames.has(String(r[lt.TemplateName])))
    entries.push({
      tpl: r[lt.TemplateName],
      item: r[lt.ItemTemplateID],
      chance: r[lt.Chance],
      count: r[lt.Count],
    });
}

// 3. risolvi itemtemplate Id_nb -> Name/Level
const wantedItems = new Set(entries.map((e) => String(e.item)));
const it = idx('itemtemplate', ['Id_nb', 'Name', 'Level', 'Realm']);
const itemInfo = {};
for (const r of extractRows(sql, 'itemtemplate')) {
  if (wantedItems.has(String(r[it.Id_nb])))
    itemInfo[r[it.Id_nb]] = { name: r[it.Name], level: r[it.Level], realm: r[it.Realm] };
}

console.log(`\n=== loottemplate (drop reali nel DB) ===`);
for (const e of entries) {
  const info = itemInfo[e.item] || {};
  console.log(
    `  [${e.tpl}] ${info.name ?? '(item mancante!)'}  — chance ${e.chance}%, count ${e.count}, lvl ${info.level ?? '?'}, realm ${info.realm ?? '?'}  (Id_nb ${e.item})`
  );
}
console.log(`\n  Totale item nel drop table del DB: ${entries.length}`);
