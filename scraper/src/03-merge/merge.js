import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from '../lib/cache.js';
import { normalizeName, slugify } from '../lib/slugify.js';
import { log } from '../lib/logger.js';

/**
 * Fase 3 — Merge Eden + Allakhazam per nome-mob normalizzato.
 * Per ogni target del DB produce la lista drop proposta:
 *  - Eden = base (ha le statistiche complete)
 *  - Allakhazam = conferma/estende la copertura
 *  - item legacy allakhazam "(nld)" = no longer dropping -> segnalati, non inclusi di default
 * Match item tra fonti per nome normalizzato.
 * Output: data/03-merged/drop_merged.json
 */
export function runMerge({ dataDir, extractedDir }) {
  const targets = readJson(path.join(extractedDir, 'mob_targets.json'));
  if (!targets) throw new Error('mob_targets.json mancante: lancia prima --extract');

  const edenDir = path.join(dataDir, '02-scraped', 'eden-daoc', 'mobs');
  const akDir = path.join(dataDir, '02-scraped', 'allakhazam', 'mobs');

  const merged = {};
  let withEden = 0;
  let withAk = 0;
  let withAny = 0;

  for (const target of targets.mobs) {
    const key = normalizeName(target.name);
    const slug = slugify(target.name);

    const edenFile = path.join(edenDir, `${slug}.json`);
    const akFile = path.join(akDir, `${slug}.json`);
    const eden = fs.existsSync(edenFile) ? readJson(edenFile) : null;
    const ak = fs.existsSync(akFile) ? readJson(akFile) : null;

    // indicizza item per nome normalizzato
    const items = new Map(); // nameNorm -> item merge

    if (eden?.items?.length) {
      withEden++;
      for (const it of eden.items) {
        const nameNorm = normalizeName(it.name);
        items.set(nameNorm, {
          name: it.name,
          nameNorm,
          edenId: it.id,
          level: Number(it.level),
          realm: Number(it.realm),
          objectType: Number(it.object_type),
          itemType: Number(it.item_type),
          sources: ['eden'],
          legacy: false,
        });
      }
    }

    if (ak) {
      let loot = [];
      for (const p of ak.pages || []) loot = loot.concat(p.loot || []);
      // dedup per citem
      const seen = new Set();
      let akItemCount = 0;
      for (const l of loot) {
        if (seen.has(l.citem)) continue;
        seen.add(l.citem);
        akItemCount++;
        // pulizia nome: rimuove suffissi tipo "(Alb)", "(nld)", "(plate)"
        const legacy = /\(nld\)/i.test(l.name);
        const cleanName = l.name.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
        const nameNorm = normalizeName(cleanName);
        const existing = items.get(nameNorm);
        if (existing) {
          if (!existing.sources.includes('allakhazam')) existing.sources.push('allakhazam');
          existing.citem = l.citem;
        } else {
          items.set(nameNorm, {
            name: cleanName,
            nameNorm,
            citem: l.citem,
            sources: ['allakhazam'],
            legacy,
          });
        }
      }
      if (akItemCount) withAk++;
    }

    const itemList = [...items.values()];
    if (itemList.length) withAny++;

    merged[key] = {
      mob: target.name,
      realm: target.realms,
      regions: target.regions,
      locations: target.locations ?? [],
      minLevel: target.minLevel,
      maxLevel: target.maxLevel,
      hasExistingLoot: target.hasExistingLoot,
      hasEden: !!eden?.items?.length,
      hasAllakhazam: !!ak,
      items: itemList,
    };
  }

  writeJson(path.join(dataDir, '03-merged', 'drop_merged.json'), {
    generatedAt: new Date().toISOString(),
    targetCount: targets.mobs.length,
    withEden,
    withAllakhazam: withAk,
    withAnyDrop: withAny,
    mobs: merged,
  });
  log.info(
    `Merge: ${withAny}/${targets.mobs.length} mob con almeno un drop (Eden ${withEden}, Allakhazam ${withAk}).`
  );
  return merged;
}
