import fs from 'node:fs';
import path from 'node:path';
import { writeJson, writeText } from '../lib/cache.js';
import { log } from '../lib/logger.js';

/**
 * Estrae TUTTI gli use/proc/charge/reattivi degli item Eden dalla cache già
 * scaricata (data/02-scraped/eden-daoc/items/), con nome, spell id, tipo, value
 * e tutti gli attributi. NON ri-scrapa: i dati sono già completi nel dettaglio item.
 *
 * Output in data/05-output/eden-effects/:
 *  - items.json     : per item, l'elenco completo dei suoi effetti
 *  - by-effect.json : per effetto (nome+spell), gli item che lo hanno
 *  - effects.csv    : una riga per (item, effetto) — comodo in Excel
 */
const SLOTS = [
  ['proc1_json', 'proc'], ['proc2_json', 'proc'],
  ['use1_json', 'use'], ['use2_json', 'use'],
  ['react1_json', 'react'], ['react2_json', 'react'],
  ['passive_json', 'passive'],
];
const REALM = { 0: 'Tutti', 1: 'Albion', 2: 'Midgard', 3: 'Hibernia' };

export function runEdenEffects({ dataDir }) {
  const itemsDir = path.join(dataDir, '02-scraped', 'eden-daoc', 'items');
  if (!fs.existsSync(itemsDir)) throw new Error('Cache item Eden mancante: lancia prima --eden');
  const files = fs.readdirSync(itemsDir).filter((f) => f.endsWith('.json'));
  const outDir = path.join(dataDir, '05-output', 'eden-effects');

  const itemsOut = [];
  const byEffect = new Map(); // key "spellId|name" -> {name, spellId, kind, type, count, items:[]}
  const csv = ['item,item_id,realm,item_level,object_type,item_type,slot,kind,effect,spell_id,spell_level,type,value,duration,target,damage,damage_type,range'];
  const cq = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const counts = { proc: 0, use: 0, react: 0, passive: 0, items: 0 };

  for (const f of files) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(itemsDir, f), 'utf8')); } catch { continue; }
    const effects = [];
    for (const [field, kind] of SLOTS) {
      if (!d[field]) continue;
      let p;
      try { p = JSON.parse(d[field]); } catch { continue; }
      const attrs = Object.fromEntries((p.Attributes || []).map(([k, v]) => [k, v]));
      const eff = {
        slot: field.replace('_json', ''),
        kind,
        name: p.Name ?? null,
        spellId: p.Id ?? null,
        spellLevel: p.Level ?? null,
        skillType: p.SkillType ?? null,
        icon: p.Icon ?? null,
        type: attrs.Type ?? null,
        value: attrs.Value ?? null,
        attributes: attrs, // completo: Duration, Target, Damage, Damage Type, Range, Radius, ecc.
      };
      effects.push(eff);
      counts[kind]++;

      // aggregazione per effetto
      const key = `${eff.spellId}|${eff.name}`;
      let g = byEffect.get(key);
      if (!g) { g = { name: eff.name, spellId: eff.spellId, kind, type: eff.type, skillType: eff.skillType, attributes: attrs, count: 0, items: [] }; byEffect.set(key, g); }
      g.count++;
      if (g.items.length < 500) g.items.push({ id: d.id, name: d.name, realm: Number(d.realm) });

      csv.push([
        d.name, d.id, REALM[Number(d.realm)] ?? d.realm, d.level, d.object_type, d.item_type,
        eff.slot, kind, eff.name, eff.spellId, eff.spellLevel, eff.type, eff.value,
        attrs.Duration, attrs.Target, attrs.Damage, attrs['Damage Type'], attrs.Range,
      ].map(cq).join(','));
    }
    if (!effects.length) continue;
    counts.items++;
    itemsOut.push({
      id: d.id, name: d.name, level: Number(d.level), realm: Number(d.realm),
      quality: Number(d.quality), objectType: Number(d.object_type), itemType: Number(d.item_type),
      effects,
    });
  }

  const byEffectArr = [...byEffect.values()].sort((a, b) => b.count - a.count);
  writeJson(path.join(outDir, 'items.json'), { generatedAt: new Date().toISOString(), count: itemsOut.length, items: itemsOut });
  writeJson(path.join(outDir, 'by-effect.json'), { generatedAt: new Date().toISOString(), count: byEffectArr.length, effects: byEffectArr });
  writeText(path.join(outDir, 'effects.csv'), csv.join('\n'));

  log.info(`Eden effects estratti in ${outDir}`);
  log.info(`  item con effetti: ${counts.items} · proc ${counts.proc} · use/charge ${counts.use} · reattivi ${counts.react} · passivi ${counts.passive}`);
  log.info(`  effetti distinti (nome+spell): ${byEffectArr.length} · righe CSV ${csv.length - 1}`);
  return outDir;
}
