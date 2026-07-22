#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { program } from 'commander';
import 'dotenv/config';
import { log } from '../src/lib/logger.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const extractedDir = path.join(dataDir, '01-extracted');
const configDir = path.join(root, 'config');
const defaultDump = path.resolve(root, '..', 'sql', 'ardred-db-20260717-222844.sql');

program
  .name('daoc-drop-scraper')
  .description('Pipeline drop table per OpenDaoc Ardred')
  .option('--extract', 'Fase 0: estrae mob_targets/item_existing dal dump SQL')
  .option('--extract-loot', 'estrae il loot esplicito attuale di ogni mob dal DB (db_loot.json)')
  .option('--merge', 'Fase 3: merge Eden + Allakhazam (drop_merged.json)')
  .option('--report', 'genera il diff report HTML (DB attuale vs proposta)')
  .option('--sql', 'Fase 5: genera drops.sql (bozza per staging) + drops-report.md')
  .option('--export', 'genera i file di esportazione su disco (JSON/CSV/per-mob)')
  .option('--deliverables', 'genera i file per-tabella (JSON+SQL) + README per il collaboratore')
  .option('--dump <path>', 'percorso del dump SQL', process.env.DUMP_PATH ?? defaultDump)
  .option('--allakhazam', 'scrape camelot.allakhazam.com')
  .option('--allakhazam-login', 'login allakhazam (credenziali AK_USER/AK_PASS) e salva la sessione')
  .option('--eden', 'scrape eden-daoc.net (richiede sessione salvata)')
  .option('--eden-login', 'apre il browser per il login Discord manuale su eden-daoc')
  .option('--eden-recon', 'salva struttura autenticata di eden-daoc/items per finalizzare il parser')
  .option('--limit <n>', 'limita il numero di mob scrapati in questo run', (v) => Number(v))
  .option('--only <name>', 'processa solo il mob con questo nome esatto')
  .option('--force', 'ignora la cache e riscarica')
  .option('--rate <ms>', 'millisecondi tra le richieste HTTP (default 500)', (v) => Number(v))
  .parse();

const opts = program.opts();
if (opts.rate) process.env.RATE_MS = String(opts.rate);

try {
  if (opts.extract) {
    const { runExtract } = await import('../src/00-extract-db/extract.js');
    runExtract({ dumpPath: opts.dump, outDir: extractedDir, configDir });
  }
  if (opts.extractLoot) {
    const { runExtractLoot } = await import('../src/00-extract-db/extract-loot.js');
    runExtractLoot({ dumpPath: opts.dump, outDir: extractedDir });
  }
  if (opts.merge) {
    const { runMerge } = await import('../src/03-merge/merge.js');
    runMerge({ dataDir, extractedDir });
  }
  if (opts.report) {
    const { runReport } = await import('../src/05-report/diff-report.js');
    runReport({ dataDir, extractedDir });
  }
  if (opts.sql) {
    const { runSql } = await import('../src/06-sql/generate.js');
    runSql({ dataDir, extractedDir });
  }
  if (opts.export) {
    const { runExport } = await import('../src/05-report/export-files.js');
    runExport({ dataDir, extractedDir });
  }
  if (opts.deliverables) {
    const { runDeliverables } = await import('../src/06-sql/deliverables.js');
    runDeliverables({ dataDir, extractedDir });
  }
  if (opts.allakhazamLogin) {
    const { runAllakhazamLogin } = await import('../src/01-scrape-allakhazam/login.js');
    await runAllakhazamLogin({ dataDir });
  }
  if (opts.allakhazam) {
    const { runAllakhazam } = await import('../src/01-scrape-allakhazam/index.js');
    await runAllakhazam({ dataDir, extractedDir, limit: opts.limit, only: opts.only, force: opts.force });
  }
  if (opts.edenLogin) {
    const { runEdenLogin } = await import('../src/02-scrape-eden/login.js');
    await runEdenLogin({ dataDir });
  }
  if (opts.eden || opts.edenRecon) {
    const { runEden } = await import('../src/02-scrape-eden/index.js');
    await runEden({
      dataDir,
      extractedDir,
      limit: opts.limit,
      only: opts.only,
      force: opts.force,
      recon: opts.edenRecon,
    });
  }
  if (
    !opts.extract &&
    !opts.extractLoot &&
    !opts.merge &&
    !opts.report &&
    !opts.sql &&
    !opts.export &&
    !opts.deliverables &&
    !opts.allakhazam &&
    !opts.allakhazamLogin &&
    !opts.eden &&
    !opts.edenLogin &&
    !opts.edenRecon
  ) {
    program.help();
  }
} catch (err) {
  log.error(err.message);
  process.exitCode = 1;
}
