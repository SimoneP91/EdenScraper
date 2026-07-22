import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractColumns, extractRows } from '../src/00-extract-db/sql-parser.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = path.resolve(root, '..', 'sql', 'ardred-db-20260717-222844.sql');
const edenDir = path.join(root, 'data', '02-scraped', 'eden-daoc', 'items');

// ---- 1. Eden: presenza di effetti attivi (proc/use/charge/react/passive) ----
const fields = ['proc1_json', 'proc2_json', 'use1_json', 'use2_json', 'react1_json', 'react2_json', 'passive_json'];
const files = fs.readdirSync(edenDir).filter((f) => f.endsWith('.json'));
let anyEffect = 0, byField = Object.fromEntries(fields.map((f) => [f, 0]));
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(edenDir, f), 'utf8'));
  let has = false;
  for (const fld of fields) if (d[fld]) { byField[fld]++; has = true; }
  if (has) anyEffect++;
}
console.log('=== EDEN effetti attivi (su', files.length, 'item) ===');
console.log('  item con ALMENO un effetto:', anyEffect);
for (const fld of fields) console.log('   ', fld.padEnd(13), byField[fld]);

// ---- 2. DB loottemplate: distribuzione Chance, in particolare negative ----
const sql = fs.readFileSync(dump, 'utf8');
const lc = extractColumns(sql, 'loottemplate');
const li = Object.fromEntries(['TemplateName', 'ItemTemplateID', 'Chance', 'Count'].map((c) => [c, lc.indexOf(c)]));
let neg = 0, zero = 0, hundred = 0, other = 0, total = 0;
const negByVal = {};
const seenPairs = new Map();
let dupPairs = 0;
for (const r of extractRows(sql, 'loottemplate')) {
  total++;
  const ch = Number(r[li.Chance]);
  if (ch < 0) { neg++; negByVal[ch] = (negByVal[ch] || 0) + 1; }
  else if (ch === 0) zero++;
  else if (ch === 100) hundred++;
  else other++;
  const key = `${String(r[li.TemplateName]).toLowerCase()}|${String(r[li.ItemTemplateID]).toLowerCase()}`;
  seenPairs.set(key, (seenPairs.get(key) || 0) + 1);
}
for (const [, c] of seenPairs) if (c > 1) dupPairs++;
console.log('\n=== DB loottemplate Chance (su', total, 'righe) ===');
console.log('  negative:', neg, JSON.stringify(negByVal));
console.log('  =0:', zero, ' =100:', hundred, ' altre:', other);
console.log('  coppie (Template,Item) duplicate già ora:', dupPairs);
