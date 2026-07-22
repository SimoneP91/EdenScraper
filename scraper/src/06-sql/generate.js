import path from 'node:path';
import { writeText } from '../lib/cache.js';
import { log } from '../lib/logger.js';
import { buildPlan, colsToInsert, lootInsertGuarded, mobxInsertGuarded } from './plan.js';

/**
 * Fase 5 — drops.sql combinato (ADD-ONLY, idempotente). È equivalente a
 * deliverables/sql/drops_all.sql; tenuto per compatibilità del comando --sql.
 */
export function runSql({ dataDir, extractedDir }) {
  const plan = buildPlan({ dataDir, extractedDir });

  const lines = [
    '-- drops.sql — ADD-ONLY (non cancella e non riscrive nulla). Solo per STAGING.',
    `-- Generato: ${new Date().toISOString()}`,
    `-- Mob toccati: ${plan.stats.mobs} · item nuovi: ${plan.stats.created} · riusati: ${plan.stats.reused} · saltati: ${plan.stats.skipped}`,
    '-- Vedi deliverables/ per i file separati per tabella + README.',
    '',
    'START TRANSACTION;',
    '',
    '-- 1) itemtemplate (solo nuovi)',
    ...[...plan.newItemCols.values()].map((c) => colsToInsert('itemtemplate', c, { onDup: 'Name=VALUES(Name), Level=VALUES(Level)' })),
    '',
    '-- 2) loottemplate (add-only, guardato)',
  ];
  for (const m of plan.mobs) for (const it of m.items) lines.push(lootInsertGuarded(m.template, it.idNb, it.chance, it.count));
  lines.push('', '-- 3) mobxloottemplate (solo link nuovi, guardato)');
  for (const m of plan.mobs) if (m.isNewTemplate) lines.push(mobxInsertGuarded(m.mob, m.template, 1));
  lines.push('', 'COMMIT;', '');

  const outFile = path.join(dataDir, '05-output', 'drops.sql');
  writeText(outFile, lines.join('\n'));
  log.info(`drops.sql (add-only) scritto: ${outFile}`);
  return outFile;
}
