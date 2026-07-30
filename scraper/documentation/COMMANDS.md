# DaocScraper — Documentazione completa dei comandi

Ricostruzione delle **drop table** (mob → item) del server OpenDaoc **Ardred**, più una
serie di strumenti di analisi/interrogazione del database di gioco.

Tutto gira su **Node.js** (nessun altro linguaggio). Due categorie di comandi:

1. **Pipeline** (`scripts/run-pipeline.js`) — gli step del flusso scraping → merge → output.
2. **Strumenti standalone** (`scripts/*.js`) — interrogazione DB e utility.

> **Regola d'oro:** tutto è di sola lettura sul dump e non tocca MAI il database di
> produzione. Gli SQL generati sono **bozze da provare su staging**.

---

## Indice

- [0. Setup iniziale](#0-setup-iniziale)
- [1. La pipeline (`run-pipeline.js`)](#1-la-pipeline-run-pipelinejs)
  - [Ordine di esecuzione e dipendenze](#ordine-di-esecuzione-e-dipendenze)
  - [`--extract`](#--extract)
  - [`--extract-loot`](#--extract-loot)
  - [`--allakhazam-login`](#--allakhazam-login)
  - [`--allakhazam`](#--allakhazam)
  - [`--eden-login`](#--eden-login)
  - [`--eden-recon`](#--eden-recon)
  - [`--eden`](#--eden)
  - [`--eden-effects`](#--eden-effects)
  - [`--merge`](#--merge)
  - [`--report`](#--report)
  - [`--sql`](#--sql)
  - [`--deliverables`](#--deliverables)
  - [`--export`](#--export)
  - [`--item-explorer`](#--item-explorer)
  - [Opzioni globali](#opzioni-globali)
- [2. Strumenti standalone](#2-strumenti-standalone)
  - [`status.js`](#statusjs)
  - [`item-finder.js`](#item-finderjs)
  - [`db-mob-loot.js`](#db-mob-lootjs)
  - [`find-mob.js`](#find-mobjs)
  - [`list-regions.js`](#list-regionsjs)
  - [`verify-analysis.js`](#verify-analysisjs)
  - [`show-itemtemplate-ddl.js`](#show-itemtemplate-ddljs)
- [3. Scorciatoie npm](#3-scorciatoie-npm)
- [4. Variabili d'ambiente (`.env`)](#4-variabili-dambiente-env)
- [5. Struttura delle cartelle](#5-struttura-delle-cartelle)

---

## 0. Setup iniziale

Da fare **una volta sola**.

```bash
cd scraper
npm install                     # installa le dipendenze
npx playwright install chromium # browser per Eden e per il login Allakhazam
```

Il dump SQL atteso di default è `../sql/ardred-db-20260717-222844.sql` (lo si può
cambiare con `--dump` o con `DUMP_PATH` nel `.env`).

Per Allakhazam serve un account (le credenziali stanno nel file `.env`, vedi
[sezione 4](#4-variabili-dambiente-env)).

---

## 1. La pipeline (`run-pipeline.js`)

Sintassi generale:

```bash
node scripts/run-pipeline.js <uno o più flag> [opzioni globali]
```

Puoi passare **più flag insieme**: vengono eseguiti in un **ordine fisso** (vedi sotto),
non nell'ordine in cui li scrivi. Esempio: `--extract --extract-loot --merge --report`
esegue l'intera catena in sequenza.

### Ordine di esecuzione e dipendenze

```
--extract ──┬─> --extract-loot ─┐
            │                    │
            ├─> (--allakhazam)   ├─> --merge ─> --report
            └─> (--eden) ────────┘             ├─> --sql
                                               ├─> --deliverables
                                               └─> --export

--item-explorer   (indipendente: legge solo il dump)
--eden-effects    (indipendente: legge la cache Eden)
```

Ordine reale in cui i flag vengono processati in un singolo comando:
`extract → extract-loot → merge → report → sql → export → deliverables →
item-explorer → eden-effects → allakhazam-login → allakhazam → eden-login →
eden / eden-recon`.

---

### `--extract`

**Fase 0.** Legge il dump SQL e produce la lista dei mob da cercare + il catalogo
degli item esistenti. È il primo passo di tutto: **nessuna connessione a Internet**.

- **Prerequisiti:** il dump SQL.
- **Produce:**
  - `config/target-zones.json` — le 73 region in scope (Expansion 0=Classic, 1=Shrouded Isles), con i nomi delle zone.
  - `data/01-extracted/mob_targets.json` — i **7.215 nomi di mob univoci** in scope, con livelli min/max, reami, region, **zone reali** (ricavate dalle coordinate) e flag `hasExistingLoot`.
  - `data/01-extracted/item_existing.json` — i **34.546 item** già presenti in `itemtemplate`, indicizzati per nome normalizzato (serve al matching).

**Esempio:**
```bash
node scripts/run-pipeline.js --extract
```
**Risultato:**
```
[16:04:11] Leggo dump: .../sql/ardred-db-20260717-222844.sql
[16:04:11] Region in scope (Expansion 0/1): 73
[16:04:11] Nomi mob con loot esplicito esistente: 3050
[16:04:11] Mob-spawn in scope: 97522 — nomi univoci: 7215
[16:04:11] itemtemplate esistenti: 34546
[16:04:11] Fase 0 completata.
```

---

### `--extract-loot`

Estrae il **loot esplicito ATTUALE** di ogni mob dal DB (lo stato "PRIMA", per il diff),
seguendo `mobxloottemplate → loottemplate → itemtemplate`.

- **Prerequisiti:** il dump SQL.
- **Produce:**
  - `data/01-extracted/db_loot.json` — per ogni mob, gli item che droppa già (idNb, chance, count, livello).
  - `data/01-extracted/db_items.json` — le **statistiche complete** degli item presenti in quei loot (bonus decodificati, proc, ecc.), usate dal diff report per la colonna "Nel DB ora".

**Esempio:**
```bash
node scripts/run-pipeline.js --extract-loot
```
**Risultato:**
```
[14:47:46] Leggo dump per loot esistente: .../ardred-db-20260717-222844.sql
[14:47:47] Mob con loot esplicito: 3050
[14:47:47] db_loot.json: 3050 mob · db_items.json: 902 item con stat.
```

---

### `--allakhazam-login`

Fa il **login automatico** all'account Allakhazam (credenziali da `.env`) e salva la
sessione. Serve perché, da loggati, il blocco anti-bot di CloudFront è molto meno aggressivo.

- **Prerequisiti:** `AK_USER` e `AK_PASS` nel `.env`; Chromium installato.
- **Produce:** `data/.auth/allakhazam-session.json` (i cookie di sessione).

**Esempio:**
```bash
node scripts/run-pipeline.js --allakhazam-login
```
**Risultato:**
```
[08:36:56] Login allakhazam...
[08:37:02] Login riuscito, sessione salvata in .../data/.auth/allakhazam-session.json
```

---

### `--allakhazam`

Scraping di **camelot.allakhazam.com**. Costruisce un indice zona→mob (una volta),
poi per ogni mob dei target scarica la pagina e ne estrae la sezione **"Known Loot"**.
Tutto è **cacheato**: i rerun non riscaricano ciò che è già stato preso.

- **Prerequisiti:** `--extract` (per `mob_targets.json`); consigliato `--allakhazam-login`.
- **Produce:** `data/02-scraped/allakhazam/mobs/<slug>.json` (uno per mob) + cache HTML grezza + `_report.json`.
- **Note:** CloudFront può bloccare l'IP dopo molte richieste; su HTTP 403 lo scraper aspetta e riprova, poi se il blocco persiste si ferma salvando i progressi. Rilancia lo stesso comando per riprendere.

**Esempio (prova su 20 mob):**
```bash
node scripts/run-pipeline.js --allakhazam --limit 20
```
**Risultato:**
```
[08:33:17] Sessione allakhazam caricata (soglia di blocco più alta; pausa periodica attiva).
[08:33:17] Indice mob allakhazam: 14009 nomi
[08:33:21] [3] Aaric: 33 drop
[08:33:31] [10] abysmal: 52 drop
[08:33:39] Allakhazam: match 15, scrapati ora 15, già in cache 0, senza risultato 4
```

---

### `--eden-login`

Apre un **browser visibile** per il login manuale con **Discord** su eden-daoc.net.
Da fare **una volta**: lo script attende che tu completi il login, poi salva la sessione.

- **Prerequisiti:** Chromium installato; un account Discord con accesso a Eden.
- **Produce:** `data/.auth/eden-session.json` + profilo persistente `data/.auth/eden-profile/`.

**Esempio:**
```bash
node scripts/run-pipeline.js --eden-login
```
**Risultato:**
```
[08:54:00] >>> Completa il login Discord nella finestra aperta. <<<
[08:54:37] Sessione salvata (profilo persistente in .../data/.auth/eden-profile)
```

---

### `--eden-recon`

Salva la struttura autenticata di `/items` (HTML, screenshot, risposte JSON di rete).
Serve solo in fase di ricognizione per capire/aggiornare gli endpoint del sito.

- **Prerequisiti:** sessione Eden valida (`--eden-login`).
- **Produce:** `data/02-scraped/eden-daoc/recon/` (items-page.html, screenshot, `_json-responses.json`).

**Esempio:**
```bash
node scripts/run-pipeline.js --eden-recon
```
**Risultato:**
```
[08:54:37] Sessione Eden valida.
[08:54:39] Recon salvato in .../data/02-scraped/eden-daoc/recon
```

---

### `--eden`

Scraping di **eden-daoc.net** tramite la sua **API JSON interna** (scoperta col recon):
enumera l'intero catalogo item (`search.php`), scarica il **dettaglio completo** di ogni
item (`item.php` — stat, bonus, proc/use, e i mob che lo droppano), risolve i mob
(`mob.php`) e costruisce la mappa mob→item filtrata sui tuoi target.

- **Prerequisiti:** `--eden-login` (sessione valida) e `--extract` (target).
- **Produce:** `data/02-scraped/eden-daoc/items/<id>.json` (uno per item, ~22.818),
  `data/02-scraped/eden-daoc/pages/`, `_mobs.json`, e `mobs/<slug>.json` per i target che matchano.
- **Note:** è ripristinabile — se si interrompe, rilancialo e riprende dalla cache. Su sessione scaduta rifai `--eden-login`.

**Esempio:**
```bash
node scripts/run-pipeline.js --eden
```
**Risultato (a crawl completato):**
```
[11:38:18] Mob risolti: 5300
[11:38:25] Eden completato: 1713/7215 target con drop su Eden.
```

---

### `--eden-effects`

Estrae **tutti gli use/proc/charge/reattivi/passivi** degli item Eden **dalla cache già
scaricata** (non ri-scrapa), con nome, spell id, tipo, **value** e ogni attributo.

- **Prerequisiti:** la cache item di Eden (`--eden` già eseguito).
- **Produce (in `data/05-output/eden-effects/`):**
  - `effects.csv` — una riga per (item, effetto): item, id, reame, slot, kind, nome, spell_id, tipo, value, duration, target, damage, damage type, range.
  - `items.json` — per ogni item, l'elenco completo dei suoi effetti con tutti gli attributi.
  - `by-effect.json` — raggruppato per effetto (nome+spell) con la lista di item che lo hanno.

**Esempio:**
```bash
node scripts/run-pipeline.js --eden-effects
```
**Risultato:**
```
[16:11:48] Eden effects estratti in .../data/05-output/eden-effects
[16:11:48]   item con effetti: 6494 · proc 2677 · use/charge 2494 · reattivi 2226 · passivi 201
[16:11:48]   effetti distinti (nome+spell): 708 · righe CSV 7598
```

---

### `--merge`

**Fase 3.** Unisce Eden + Allakhazam per **nome-mob normalizzato**. Eden fa da base per le
statistiche; Allakhazam conferma/estende la copertura; gli item legacy `(nld)` (no longer
dropping) di Allakhazam vengono segnalati a parte.

- **Prerequisiti:** `--extract`, e lo scraping di almeno una fonte (`--eden` e/o `--allakhazam`).
- **Produce:** `data/03-merged/drop_merged.json`.

**Esempio:**
```bash
node scripts/run-pipeline.js --merge
```
**Risultato:**
```
[14:28:44] Merge: 2604/7215 mob con almeno un drop (Eden 1713, Allakhazam 2049).
```

---

### `--report`

Genera il **diff report HTML** (confronto "DB attuale vs proposta scraping"), pubblicabile
come Artifact. Ogni item è espandibile con statistiche leggibili + JSON grezzo, `Id_nb`
risolto (riuso/da creare), filtri per zona/categoria/ordine, ed export copia-appunti.

- **Prerequisiti:** `--merge` e `--extract-loot` (per il "prima") e `--extract` (item_existing).
- **Produce:** `data/05-output/diff-report.html`.

**Esempio:**
```bash
node scripts/run-pipeline.js --report
```
**Risultato:**
```
[14:37:23] Diff report scritto: .../data/05-output/diff-report.html (dizionario item: 12417)
[14:37:23]   cambiati 2484 (nuovo loot 2246, modificati 238), confermati 120
[14:37:23]   item aggiunti 35200, rimossi 245, legacy 369
```

---

### `--sql`

**Fase 5.** Genera `drops.sql` in modalità **ADD-ONLY** (non distruttiva, idempotente): niente
DELETE, aggiunge solo item che il mob non droppa già, con INSERT guardate da `NOT EXISTS`,
tutto in transazione. Le righe esistenti (chance `-3`, DropCount, stat) non vengono toccate.

- **Prerequisiti:** `--merge`, `--extract-loot`, `--extract`.
- **Produce:** `data/05-output/drops.sql`.
- **Nota:** equivalente a `deliverables/sql/drops_all.sql` (vedi `--deliverables`).

**Esempio:**
```bash
node scripts/run-pipeline.js --sql
```
**Risultato:**
```
[14:14:29] drops.sql (add-only) scritto: .../data/05-output/drops.sql
```

---

### `--deliverables`

Genera i file **organizzati per tabella del DB** (JSON + SQL) + un `README.md`, pensati per
lavorarci a mano tabella per tabella. Anche questi sono **ADD-ONLY** e idempotenti.

- **Prerequisiti:** `--merge`, `--extract-loot`, `--extract`.
- **Produce (in `data/05-output/deliverables/`):**
  - `json/itemtemplate_new.json`, `json/loottemplate_add.json`, `json/mobxloottemplate_add.json`, `json/mob_loot.json`, `json/skipped.json`
  - `sql/1_itemtemplate_new.sql`, `sql/2_loottemplate_add.sql`, `sql/3_mobxloottemplate_add.sql`, `sql/drops_all.sql`
  - `README.md` — la guida per il collaboratore.

**Esempio:**
```bash
node scripts/run-pipeline.js --deliverables
```
**Risultato:**
```
[14:14:30] Deliverables (ADD-ONLY) scritti in .../data/05-output/deliverables
[14:14:30]   mob toccati 2416 · itemtemplate nuovi 2372 · loottemplate +33521 · link nuovi 663 · saltati 1679
```

---

### `--export`

Esporta i dati del merge in file "grezzi" comodi da girare a chi revisiona (JSON e CSV,
più un file per singolo mob).

- **Prerequisiti:** `--merge`, `--extract-loot`, `--extract`.
- **Produce (in `data/05-output/export/`):**
  - `drop_merged_full.json` — tutti i mob con proposta risolta.
  - `items_eden.json` / `items_allakhazam.json` — le liste item per fonte.
  - `drops.csv` — una riga per item.
  - `per-mob/<slug>.json` — un file per ogni mob cambiato.

**Esempio:**
```bash
node scripts/run-pipeline.js --export
```
**Risultato:**
```
[15:20:50] Export scritto in .../data/05-output/export
[15:20:50]   mob 2603 · item Eden 6494 · item Allakhazam 5115 · righe CSV 37078
```

---

### `--item-explorer`

Genera l'**Item Explorer**: una pagina HTML autonoma (Artifact) che replica `item-finder.js`
nel browser — ricerca per nome/slot/livello, profilo item, drop, mercanti, ricette+ramificazione
e comando GM. I dati del dump sono incorporati nella pagina (~9 MB).

- **Prerequisiti:** il dump SQL.
- **Produce:** `data/05-output/item-explorer.html`.
- **Nota:** è uno snapshot statico del dump; se il DB cambia, rigenera.

**Esempio:**
```bash
node scripts/run-pipeline.js --item-explorer
```
**Risultato:**
```
[16:00:12] Item Explorer scritto: .../data/05-output/item-explorer.html (9.09 MB)
[16:00:12]   items 34546 · loot 1792 · merch 48449 · craft 23041 · spell 246
```

---

### Opzioni globali

Valgono per i comandi che le usano (scraping o generazione).

| Opzione | Default | Descrizione |
|---|---|---|
| `--dump <path>` | `../sql/ardred-db-...sql` | percorso del dump SQL (o `DUMP_PATH` nel `.env`) |
| `--limit <n>` | — | limita il numero di mob scrapati in questo run (utile per prove) |
| `--only <name>` | — | processa solo il mob con questo nome esatto |
| `--force` | off | ignora la cache e riscarica |
| `--rate <ms>` | ~900 | millisecondi tra le richieste HTTP (vedi anche `RATE_MS` nel `.env`) |

**Esempio combinato:**
```bash
node scripts/run-pipeline.js --allakhazam --only "abysmal" --force
```

---

## 2. Strumenti standalone

Non fanno parte della pipeline: si lanciano direttamente. Leggono il dump (o la cache) e
stampano a schermo / scrivono file.

### `status.js`

Mostra lo **stato di avanzamento** dello scraping (barre di progresso, quanti mob/item fatti,
e se un crawl è in esecuzione ora — via heartbeat/mtime).

**Esempio:**
```bash
node scripts/status.js      # oppure: npm run status
```
**Risultato:**
```
=== DAoC Drop Scraper — stato ===

ALLAKHAZAM   running: false
  indice zone:  282/282
  processati:   7215/7215  [██████████████████████████████] 100.0%
    - con pagina/drop: 5842
    - assenti da allakhazam (nessuna pagina): 1373

EDEN-DAOC   running: false
  catalogo pagine: 913/913
  dettagli item:   22818/22818  [██████████████████████████████] 100.0%
  mob mappati (target match): 1713
```

---

### `item-finder.js`

**Il coltellino svizzero.** Dato un item (per nome o `Id_nb`), o un filtro slot/livello,
mostra il profilo completo: cos'è + statistiche + bonus, spell, **chi lo droppa**, **chi lo
vende**, in quali ricette è ingrediente, la **ricetta con ramificazione dei reagenti**, tutte
le tabelle che lo citano, e il **comando GM `/item create`** pronto da copiare.

**Sintassi:**
```bash
node scripts/item-finder.js ["<nome o Id_nb>"] [--<slot>] [--level X] [--name "x"] [--list]
```

- **Ricerca nome a 3 stadi:** esatto → contiguo → tutte-le-parole (es. `"reactive arcanium"` trova anche "reactive … arcanium").
- **`--level X`** : solo item di livello ≥ X.
- **`--name "x"`** : alias esplicito del nome (utile con gli slot).
- **`--list`** : solo elenco, senza profilo dettagliato.
- **Slot disponibili:** `--head --chest --legs --arms --hands --boots --cloak --neck --belt --wrist --ring --jewel --mythical --2h --mainhand --offhand --ranged`
- Uno slot da solo mostra i **primi 80** risultati + conteggio totale (restringi con nome/livello).

**Esempio 1 — profilo di un item:**
```bash
node scripts/item-finder.js "reactive ablative arcanium armor tincture"
```
**Risultato (estratto):**
```
1 item trovato ...
  Name                                       lvl  realm   comando GM (copia-incolla)
  reactive ablative arcanium armor tincture  47   Albion  /item create reactive_ablative_arcanium_armor_tincture

══ RICETTA E RAMIFICAZIONE (reagenti → provenienza) ══
  skill: Alchemy  livello: 1094
  reactive ablative arcanium armor tincture  (prodotto)
  ├─ 2x arcanium metal bars        vend. 19
  ├─ 1x reactive shielding catalyst   vend. 30
  └─ 2x silvery faerie hair        vend. 21
```

**Esempio 2 — ricerca per slot + livello:**
```bash
node scripts/item-finder.js --legs --level 50 --list
```
**Risultato (estratto):**
```
Filtri attivi: slot: legs, livello >= 50
380 item trovati:
  Azure Leggings of Notes   51  Albion   /item create 1_Azure_Leggings_of_Notes
  ...
```

---

### `db-mob-loot.js`

Mostra il **loot table attuale** di un mob nel DB (`mobxloottemplate → loottemplate → itemtemplate`).

**Esempio:**
```bash
node scripts/db-mob-loot.js "director kobil"
```
**Risultato:**
```
=== mobxloottemplate ===
  mob "Director Kobil" -> template "Director Kobil" (DropCount 1)

=== loottemplate (drop reali nel DB) ===
  [Director Kobil] Daemon Sapphire Seal — chance 40%, count 10, lvl 35, realm 0  (Id_nb SapphireSeal)

  Totale item nel drop table del DB: 1
```

---

### `find-mob.js`

Cerca un mob per (parte di) nome e mostra dove compare: nei **target del DB**, negli scrapati
**Allakhazam**, e nei mappati **Eden**.

**Esempio:**
```bash
node scripts/find-mob.js kobil
```
**Risultato (estratto):**
```
=== TARGET nel tuo DB con "kobil" ===
  Director Kobil  (lvl 53-53, regioni 249, hasExistingLoot=true)

=== EDEN mappati con "kobil" ===
  Director Kobil: 4 item (mob eden: Director Kobil, lvl 50)
      - Director's Ring of Anarchy (id 110895, lvl 51)
```

---

### `list-regions.js`

Elenca le **region** con nomi zona reali e conteggio mob. Senza argomenti mostra quelle in
scope (Classic + SI); con un argomento filtra per nome zona/region.

**Esempio:**
```bash
node scripts/list-regions.js            # region in scope
node scripts/list-regions.js avalon     # cerca "avalon"
```
**Risultato (estratto):**
```
   ID EXP           MOB  ZONE
    1 Classic     19045  Camelot Hills, Salisbury Plains, Dartmoor, ...
   51 SI           6562  Isle of Glass, Avalon Isle, Dales of Devwy, ...
  249 Classic      2493  Darkness Falls
```

---

### `verify-analysis.js`

Script di verifica dati: conta gli **effetti attivi** negli item Eden (proc/use/charge) e la
**distribuzione delle chance** in `loottemplate` (incluse le `-3` condizionali). Utile per
controlli di integrità.

**Esempio:**
```bash
node scripts/verify-analysis.js
```
**Risultato (estratto):**
```
=== EDEN effetti attivi (su 22818 item) ===
  item con ALMENO un effetto: 6500
    proc1_json    2286
    use1_json     2198

=== DB loottemplate Chance (su 1792 righe) ===
  negative: 239 {"-3":239}
```

---

### `show-itemtemplate-ddl.js`

Stampa la **definizione delle colonne** della tabella `itemtemplate` (utile per capire tipi e
default quando si generano INSERT).

**Esempio:**
```bash
node scripts/show-itemtemplate-ddl.js
```
**Risultato (estratto):**
```
`Id_nb` varchar(255) NOT NULL,
`Name` text NOT NULL,
`Level` int(11) NOT NULL DEFAULT 0,
...
```

---

## 3. Scorciatoie npm

Definite in `package.json` (equivalenti ai comandi `node ...`):

```bash
npm run extract           # = node scripts/run-pipeline.js --extract
npm run allakhazam-login  # = ... --allakhazam-login
npm run allakhazam        # = ... --allakhazam
npm run eden-login        # = ... --eden-login
npm run eden              # = ... --eden
npm run status            # = node scripts/status.js
```

---

## 4. Variabili d'ambiente (`.env`)

File `scraper/.env` (gitignored). Righe supportate:

```ini
# Credenziali account Allakhazam (per --allakhazam-login)
AK_USER=scraperguy
AK_PASS=xxxxxxxx

# (opzionale) percorso alternativo del dump
# DUMP_PATH=/percorso/al/dump.sql
```

Altre variabili opzionali (si passano inline o si mettono nell'ambiente) che regolano il
comportamento dello scraping:

| Variabile | Default | Effetto |
|---|---|---|
| `RATE_MS` | 900 | ms tra le richieste HTTP (anche `--rate`) |
| `PAUSE_EVERY` | 90 | ogni quante richieste fare una pausa lunga (0 = mai) |
| `PAUSE_MS` | 30000 | durata della pausa lunga |
| `BLOCK_WAIT_MS` | 60000 | attesa su HTTP 403 prima di riprovare |
| `BLOCK_RETRIES` | 4 | tentativi su 403 prima di arrendersi |
| `EDEN_RATE_MS` | 500 | ms tra le chiamate API di Eden |
| `NEW_CHANCE` | 100 | chance placeholder per i drop nuovi negli SQL generati |

---

## 5. Struttura delle cartelle

```
scraper/
├── config/
│   └── target-zones.json          # region/zone in scope (da --extract)
├── data/                          # tutto l'output (gitignored)
│   ├── .auth/                     # sessioni salvate (Allakhazam, Eden)
│   ├── 01-extracted/              # mob_targets, item_existing, db_loot, db_items
│   ├── 02-scraped/
│   │   ├── allakhazam/            # cache scraping Allakhazam
│   │   └── eden-daoc/             # cache scraping Eden (items/, pages/, mobs/)
│   ├── 03-merged/                 # drop_merged.json (da --merge)
│   └── 05-output/                 # tutti i prodotti finali
│       ├── diff-report.html       # --report
│       ├── drops.sql              # --sql
│       ├── deliverables/          # --deliverables
│       ├── export/                # --export
│       ├── item-explorer.html     # --item-explorer
│       └── eden-effects/          # --eden-effects
├── src/                           # codice della pipeline
│   ├── 00-extract-db/  01-scrape-allakhazam/  02-scrape-eden/
│   ├── 03-merge/  05-report/  06-sql/  07-explorer/  lib/
├── scripts/                       # CLI + strumenti standalone
└── documentation/
    └── COMMANDS.md                # questo file
```

---

*Documento generato per il progetto DaocScraper — server OpenDaoc Ardred (Classic + SI + Darkness Falls).*
