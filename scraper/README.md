# daoc-drop-scraper

Pipeline per ricostruire le drop table (mob → item) del server OpenDaoc **Ardred**
da camelot.allakhazam.com ed eden-daoc.net. Vedi `../baseproject.md` per il brief completo.

## Setup

```powershell
cd scraper
npm install
npx playwright install chromium   # solo per eden-daoc
```

## Uso

```powershell
# Fase 0 — estrae i target dal dump SQL (../sql/ardred-db-*.sql)
node scripts/run-pipeline.js --extract

# Allakhazam (loginless): costruisce l'indice zone->mob poi scrapa i target
node scripts/run-pipeline.js --allakhazam
node scripts/run-pipeline.js --allakhazam --limit 20        # run di prova
node scripts/run-pipeline.js --allakhazam --only "wood ogre lord"

# Eden-DAoC: login Discord manuale una tantum (browser visibile)
node scripts/run-pipeline.js --eden-login
# poi ricognizione autenticata (salva HTML/JSON per finalizzare il parser)
node scripts/run-pipeline.js --eden-recon
# quindi lo scraping vero
node scripts/run-pipeline.js --eden --limit 20
```

## Note

- Tutto lo scraping è cacheato in `data/02-scraped/` (JSON parsati + HTML raw):
  i rerun non ripetono richieste già fatte. `--force` per riscaricare.
- Rate limit: 1 richiesta / 1.5s con backoff esponenziale.
- La sessione Eden è in `data/.auth/eden-session.json` (gitignored). Se scade,
  rilanciare `--eden-login`.
- Il parser Eden è volutamente best-effort finché non viene fatto il primo
  `--eden-recon` autenticato: la struttura di /items non è visibile da fuori.
