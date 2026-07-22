#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');

const countJson = (dir) => {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
};

const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

// running = heartbeat fresco OPPURE un file di output modificato di recente
// (così funziona anche per processi avviati prima dell'heartbeat).
const FRESH_MS = 30_000;

const heartbeatFresh = (file) => {
  try {
    return Date.now() - Number(fs.readFileSync(file, 'utf8')) < FRESH_MS;
  } catch {
    return false;
  }
};

const newestMtime = (dir) => {
  try {
    let newest = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const m = fs.statSync(path.join(dir, f)).mtimeMs;
      if (m > newest) newest = m;
    }
    return newest;
  } catch {
    return 0;
  }
};

// running se l'heartbeat è fresco o un file in una delle outDirs è recente.
const isRunning = (heartbeatFile, outDirs = []) => {
  if (heartbeatFresh(heartbeatFile)) return true;
  return outDirs.some((d) => Date.now() - newestMtime(d) < FRESH_MS);
};

const bar = (done, total, width = 30) => {
  if (!total) return '?'.repeat(width);
  const filled = Math.round((done / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
};

const pct = (done, total) => (total ? ((done / total) * 100).toFixed(1) : '0.0');

console.log('\n=== DAoC Drop Scraper — stato ===\n');

// --- target totali ---
const targets = readJson(path.join(dataDir, '01-extracted', 'mob_targets.json'));
const totalMobs = targets?.count ?? 7215;

// --- Allakhazam ---
const akDir = path.join(dataDir, '02-scraped', 'allakhazam');
const akMobs = countJson(path.join(akDir, 'mobs'));
const akZones = readJson(path.join(akDir, '_zones.json'));
const akZonesDone = readJson(path.join(akDir, '_zones-done.json'), []);
const akReport = readJson(path.join(akDir, '_report.json'));

// "processati" = scrapati + non trovati su allakhazam (assenti dal bestiario):
// è questo il vero indicatore di completamento, non i soli scrapati.
const akNotFound = akReport?.notFoundCount ?? 0;
const akProcessed = akMobs + akNotFound;
console.log(`ALLAKHAZAM   running: ${isRunning(path.join(akDir, '.heartbeat'), [path.join(akDir, 'mobs'), path.join(akDir, 'raw', 'zones')])}`);
console.log(`  indice zone:  ${akZonesDone.length}/${akZones?.length ?? '?'}`);
console.log(`  processati:   ${akProcessed}/${totalMobs}  [${bar(akProcessed, totalMobs)}] ${pct(akProcessed, totalMobs)}%`);
console.log(`    - con pagina/drop: ${akMobs}`);
console.log(`    - assenti da allakhazam (nessuna pagina): ${akNotFound}`);

// --- Eden ---
const edDir = path.join(dataDir, '02-scraped', 'eden-daoc');
const edPages = countJson(path.join(edDir, 'pages'));
const edItems = countJson(path.join(edDir, 'items'));
const edMobs = countJson(path.join(edDir, 'mobs'));
const firstPage = readJson(path.join(edDir, 'pages', 'p0000.json'));
const edTotalItems = firstPage ? Number(firstPage.total) : 22818;
const edReport = readJson(path.join(edDir, '_report.json'));

console.log(`\nEDEN-DAOC   running: ${isRunning(path.join(edDir, '.heartbeat'), [path.join(edDir, 'items'), path.join(edDir, 'pages')])}`);
console.log(`  catalogo pagine: ${edPages}/913`);
console.log(`  dettagli item:   ${edItems}/${edTotalItems}  [${bar(edItems, edTotalItems)}] ${pct(edItems, edTotalItems)}%`);
console.log(`  mob mappati (target match): ${edMobs}`);
if (edReport)
  console.log(
    `  ultimo report: ${edReport.targetsMatched}/${edReport.targetsTotal} target con drop, ${edReport.edenMobsWithDrops} mob droppatori distinti`
  );

// --- sessione eden ---
const sessionFile = path.join(dataDir, '.auth', 'eden-session.json');
const sessionOk = fs.existsSync(sessionFile);
console.log(`\nSessione Eden salvata: ${sessionOk ? 'sì' : 'NO — serve --eden-login'}`);

console.log('');
