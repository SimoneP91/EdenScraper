import path from 'node:path';
import { writeJson, writeText } from '../lib/cache.js';
import { log } from '../lib/logger.js';
import { buildPlan, colsToInsert, lootInsertGuarded, mobxInsertGuarded } from './plan.js';

/**
 * Deliverables ORGANIZZATI per tabella (JSON + SQL) + README, in
 * data/05-output/deliverables/. Modalità ADD-ONLY (non distruttiva, idempotente).
 */
export function runDeliverables({ dataDir, extractedDir }) {
  const plan = buildPlan({ dataDir, extractedDir });
  const out = path.join(dataDir, '05-output', 'deliverables');

  const itemRows = [...plan.newItemCols.values()];
  const lootRows = [];
  const mobxRows = [];
  const mobLoot = [];
  for (const m of plan.mobs) {
    for (const it of m.items)
      lootRows.push({ TemplateName: m.template, ItemTemplateID: it.idNb, Chance: it.chance, Count: it.count });
    if (m.isNewTemplate) mobxRows.push({ MobName: m.mob, LootTemplateName: m.template, DropCount: 1 });
    mobLoot.push({
      mob: m.mob,
      template: m.template,
      templateIsNew: m.isNewTemplate,
      levelRange: m.minLevel === m.maxLevel ? `${m.minLevel}` : `${m.minLevel}-${m.maxLevel}`,
      itemsAdded: m.items.map((it) => ({ Id_nb: it.idNb, name: it.name, chance: it.chance, source: it.source, kind: it.kind })),
    });
  }

  writeJson(path.join(out, 'json', 'itemtemplate_new.json'), itemRows);
  writeJson(path.join(out, 'json', 'loottemplate_add.json'), lootRows);
  writeJson(path.join(out, 'json', 'mobxloottemplate_add.json'), mobxRows);
  writeJson(path.join(out, 'json', 'mob_loot.json'), mobLoot);
  writeJson(path.join(out, 'json', 'skipped.json'), plan.skipped);

  // --- SQL per tabella (add-only, idempotente) ---
  const itemSql = [
    '-- Tabella: itemtemplate — SOLO item NUOVI (creazione). Eseguire per PRIMO.',
    '-- itemtemplate ha PK su Id_nb: ON DUPLICATE rende la INSERT ri-eseguibile.',
    '-- Stat esatte da Eden; DPS_AF/SPD_ABS derivati; proc/use NON impostati (serve mapping spell).',
    '',
    ...itemRows.map((c) => colsToInsert('itemtemplate', c, { onDup: 'Name=VALUES(Name), Level=VALUES(Level)' })),
    '',
  ].join('\n');

  const lootSql = [
    '-- Tabella: loottemplate — AGGIUNGE i nuovi drop, NON tocca le righe esistenti.',
    '-- Ogni INSERT è guardata da NOT EXISTS: ri-eseguibile senza duplicare, chance -3 e valori tarati intatti.',
    '-- Eseguire DOPO itemtemplate.',
    '',
  ];
  for (const m of plan.mobs)
    for (const it of m.items) lootSql.push(lootInsertGuarded(m.template, it.idNb, it.chance, it.count));
  lootSql.push('');

  const mobxSql = [
    '-- Tabella: mobxloottemplate — collega SOLO i mob che non avevano ancora un template.',
    '-- Guardata da NOT EXISTS. I mob già agganciati non vengono toccati. Eseguire per ULTIMO.',
    '',
  ];
  for (const m of plan.mobs) if (m.isNewTemplate) mobxSql.push(mobxInsertGuarded(m.mob, m.template, 1));
  mobxSql.push('');

  writeText(path.join(out, 'sql', '1_itemtemplate_new.sql'), itemSql);
  writeText(path.join(out, 'sql', '2_loottemplate_add.sql'), lootSql.join('\n'));
  writeText(path.join(out, 'sql', '3_mobxloottemplate_add.sql'), mobxSql.join('\n'));

  const combined = [
    '-- ADD-ONLY: non cancella e non riscrive nulla. In transazione.',
    '-- Ordine: itemtemplate -> loottemplate -> mobxloottemplate.',
    'START TRANSACTION;',
    '',
    itemSql,
    lootSql.join('\n'),
    mobxSql.join('\n'),
    'COMMIT;',
    '',
  ].join('\n');
  writeText(path.join(out, 'sql', 'drops_all.sql'), combined);

  writeText(path.join(out, 'README.md'), readme(plan, { itemRows, lootRows, mobxRows }));

  log.info(`Deliverables (ADD-ONLY) scritti in ${out}`);
  log.info(`  mob toccati ${plan.stats.mobs} · itemtemplate nuovi ${itemRows.length} · loottemplate +${lootRows.length} · link nuovi ${mobxRows.length} · saltati ${plan.skipped.length}`);
  return out;
}

function readme(plan, { itemRows, lootRows, mobxRows }) {
  return `# Deliverables drop table — Ardred (ADD-ONLY)

Generato: ${new Date().toISOString()}
Server: **pre-produzione (locale)**. Prima si prova su una copia.

## Filosofia: aggiungere, mai distruggere

Dopo la revisione, questi file sono **puramente additivi e idempotenti**:
- **Nessun DELETE.** Nessuna riga esistente viene cancellata o riscritta.
- Si aggiungono **solo** gli item che un mob **non droppa già**, sul suo template esistente
  (o su uno nuovo = nome mob, se il mob non aveva ancora loot).
- Ogni INSERT su loottemplate/mobxloottemplate è protetta da \`NOT EXISTS\`:
  puoi ri-eseguire lo script senza duplicare nulla.
- Le **chance esistenti (incluse le \`-3\` condizionali), i DropCount e le stat degli item già presenti restano INTATTI.**

Conseguenza: le decisioni delicate (taratura chance, DropCount, adozione stat/ToA, proc) restano
**fronti separati** — questi file non le forzano.

## Cosa c'è qui

| Tabella DB | File JSON | File SQL | Operazione |
|---|---|---|---|
| \`itemtemplate\` | \`json/itemtemplate_new.json\` | \`sql/1_itemtemplate_new.sql\` | **CREATE** (solo item nuovi) |
| \`loottemplate\` | \`json/loottemplate_add.json\` | \`sql/2_loottemplate_add.sql\` | **ADD** (drop nuovi, guardati) |
| \`mobxloottemplate\` | \`json/mobxloottemplate_add.json\` | \`sql/3_mobxloottemplate_add.sql\` | **ADD** (solo link nuovi) |

Extra: \`json/mob_loot.json\` (vista per-mob leggibile, con gli item AGGIUNTI) · \`json/skipped.json\` (item solo-Allakhazam senza stat) · \`sql/drops_all.sql\` (i tre uniti in transazione).

## Ordine di esecuzione

1. \`1_itemtemplate_new.sql\` — crea gli item nuovi
2. \`2_loottemplate_add.sql\` — aggiunge i drop
3. \`3_mobxloottemplate_add.sql\` — collega i mob nuovi

## Fronti aperti (NON in questi file, da decidere a parte)

- **Taratura chance**: i drop NUOVI hanno un placeholder \`Chance = ${plan.newChance}\` (configurabile via \`NEW_CHANCE\`). Le righe esistenti non sono toccate.
- **DropCount**: non toccato per i mob già agganciati.
- **Stat/ToA sugli item esistenti**: NON aggiornate. Eden porterebbe bonus cap (ToA) — è una scelta di design a parte.
- **Proc/Use**: Eden **li ha** (proc su ~2.286 item, use su ~2.198), ma per attaccarli a un item serve mappare la spell di Eden alla tua tabella spell (id diversi). Lavoro separato. Sui nuovi item i proc NON sono impostati.
- **${plan.skipped.length} item solo-Allakhazam**: senza stat, non creabili (in \`skipped.json\`).

## Numeri

- Mob toccati (add-only): **${plan.stats.mobs}**
- Item riusati (già nel DB): **${plan.stats.reused}**
- Item nuovi da creare: **${itemRows.length}**
- Righe loottemplate aggiunte: **${lootRows.length}**
- Link mobxloottemplate nuovi: **${mobxRows.length}**
- Item saltati: **${plan.skipped.length}**
`;
}
