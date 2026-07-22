import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const term = (process.argv[2] || '').toLowerCase();
if (!term) {
  console.log('uso: node scripts/find-mob.js <parte-del-nome>');
  process.exit(1);
}
const rx = new RegExp(term, 'i');
const norm = (s) => s.toLowerCase().trim().replace(/\s+/g, ' ');

// 1. target nel DB
const t = JSON.parse(fs.readFileSync(path.join(dataDir, '01-extracted/mob_targets.json')));
const dbHits = t.mobs.filter((m) => rx.test(m.name));
console.log(`\n=== TARGET nel tuo DB con "${term}" ===`);
if (!dbHits.length) console.log('  nessuno');
for (const m of dbHits)
  console.log(
    `  ${m.name}  (lvl ${m.minLevel}-${m.maxLevel}, regioni ${m.regions.join(',')}, hasExistingLoot=${m.hasExistingLoot})`
  );

// 2. scrapati su allakhazam
const akDir = path.join(dataDir, '02-scraped/allakhazam/mobs');
console.log(`\n=== ALLAKHAZAM scrapati con "${term}" ===`);
let akFound = false;
for (const f of fs.readdirSync(akDir)) {
  const d = JSON.parse(fs.readFileSync(path.join(akDir, f)));
  if (!rx.test(d.targetName)) continue;
  akFound = true;
  let loot = [];
  for (const p of d.pages || []) loot = loot.concat(p.loot || []);
  const uniq = [...new Map(loot.map((l) => [l.citem, l])).values()];
  console.log(`  ${d.targetName}: ${uniq.size} item`);
  for (const l of uniq) console.log(`      - ${l.name} (citem ${l.citem})`);
}
if (!akFound) console.log('  nessun file scrapato che matcha');

// 3. mappati su eden
const edDir = path.join(dataDir, '02-scraped/eden-daoc/mobs');
console.log(`\n=== EDEN mappati con "${term}" ===`);
let edFound = false;
if (fs.existsSync(edDir)) {
  for (const f of fs.readdirSync(edDir)) {
    const d = JSON.parse(fs.readFileSync(path.join(edDir, f)));
    if (!rx.test(d.targetName)) continue;
    edFound = true;
    console.log(`  ${d.targetName}: ${d.items?.length ?? 0} item (mob eden: ${d.mobEden?.name}, lvl ${d.mobEden?.level})`);
    for (const it of d.items || []) console.log(`      - ${it.name} (id ${it.id}, lvl ${it.level})`);
  }
}
if (!edFound) console.log('  nessun mob eden mappato che matcha');
console.log('');
