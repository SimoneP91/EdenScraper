# DaocScraper

Rebuild the **drop tables** (mob → item) for the OpenDAoC **Ardred** server, plus a
toolbox of read-only utilities to inspect and query the game database.

Data is scraped from two sources — [camelot.allakhazam.com](https://camelot.allakhazam.com)
(loginless) and [eden-daoc.net](https://eden-daoc.net) (Discord login) — reconciled, and
turned into ready-to-review outputs: a visual diff report, per-table SQL/JSON deliverables,
and interactive HTML explorers.

> **Scope:** Classic + Shrouded Isles + Darkness Falls (`regions.Expansion IN (0,1)`).
> **Stack:** Node.js only. **Safety:** everything is read-only against the dump and never
> touches a production database. Generated SQL is **staging-only, add-only** (see below).

## Repository layout

| Path | What it is |
|---|---|
| [`scraper/`](scraper/) | **The tool** — the Node.js pipeline and standalone utilities (this README documents it). |
| `sql/` | The MySQL/MariaDB dump of the Ardred database (input, read-only). |
| `opendaocPatches/` | The Ardred server source (a fork of OpenDAoC-Core) — reference for game mechanics. |
| `baseproject.md` | The original technical brief that started the project. |

All commands below are run from inside the `scraper/` directory.

---

## Table of contents

- [Requirements](#requirements)
- [Install](#install)
- [Configuration](#configuration)
- [Quick start](#quick-start)
- [Pipeline commands (`run-pipeline.js`)](#pipeline-commands-run-pipelinejs)
  - [Execution order & dependencies](#execution-order--dependencies)
  - [Command reference](#command-reference)
  - [Global options](#global-options)
- [Standalone tools](#standalone-tools)
- [npm scripts](#npm-scripts)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Design notes](#design-notes)

---

## Requirements

- **Node.js 18+** (developed on Node 24).
- **Chromium** (via Playwright) — only needed for Eden scraping and the Allakhazam login.
- The MySQL/MariaDB **dump** of the Ardred database (in `sql/`).

## Install

```bash
cd scraper
npm install
npx playwright install chromium   # for Eden + Allakhazam login
```

## Configuration

Create `scraper/.env` (git-ignored):

```ini
# Allakhazam account (used by --allakhazam-login; a logged-in session
# dramatically reduces CloudFront blocking)
AK_USER=youruser
AK_PASS=yourpassword

# Optional: alternative dump path (defaults to ../sql/ardred-db-20260717-222844.sql)
# DUMP_PATH=/path/to/dump.sql
```

Additional tuning variables are listed in [Environment variables](#environment-variables).

---

## Quick start

From a clean checkout to a diff report in four commands (run inside `scraper/`):

```bash
node scripts/run-pipeline.js --extract          # parse the dump → target mobs + item catalog
node scripts/run-pipeline.js --eden-login        # one-time Discord login (opens a browser)
node scripts/run-pipeline.js --eden              # scrape Eden (resumable)
node scripts/run-pipeline.js --extract-loot --merge --report   # build the diff report
```

Then open `data/05-output/diff-report.html`. Track progress anytime with `npm run status`.

---

## Pipeline commands (`run-pipeline.js`)

General syntax — you can pass **several flags at once**; they run in a **fixed order**
(not the order you type them):

```bash
node scripts/run-pipeline.js <one or more flags> [global options]
```

### Execution order & dependencies

```
--extract ──┬─> --extract-loot ─┐
            │                    │
            ├─> (--allakhazam)   ├─> --merge ─> --report
            └─> (--eden) ────────┘             ├─> --sql
                                               ├─> --deliverables
                                               └─> --export

--item-explorer   (independent: reads the dump only)
--eden-effects    (independent: reads the Eden cache)
```

Actual processing order within a single command:
`extract → extract-loot → merge → report → sql → export → deliverables →
item-explorer → eden-effects → allakhazam-login → allakhazam → eden-login → eden / eden-recon`.

### Command reference

#### `--extract`

**Phase 0.** Parse the SQL dump into the list of target mobs and the existing item catalog.
No network access. This is the prerequisite for almost everything else.

- **Produces:** `config/target-zones.json`, `data/01-extracted/mob_targets.json` (7,215 unique
  in-scope mob names, with real zone names derived from coordinates), `data/01-extracted/item_existing.json` (34,546 items).

```bash
node scripts/run-pipeline.js --extract
```
```
[16:04:11] Region in scope (Expansion 0/1): 73
[16:04:11] Mob-spawn in scope: 97522 — unique names: 7215
[16:04:11] itemtemplate existing: 34546
```

#### `--extract-loot`

Extract each mob's **current** explicit loot from the DB (the "before" state for the diff),
following `mobxloottemplate → loottemplate → itemtemplate`.

- **Produces:** `data/01-extracted/db_loot.json`, `data/01-extracted/db_items.json` (full decoded stats).

```bash
node scripts/run-pipeline.js --extract-loot
```
```
[14:47:47] Mobs with explicit loot: 3050
[14:47:47] db_loot.json: 3050 mobs · db_items.json: 902 items with stats.
```

#### `--allakhazam-login`

Automatic login to your Allakhazam account (credentials from `.env`) and session save.
A logged-in session raises the CloudFront block threshold significantly.

- **Requires:** `AK_USER` / `AK_PASS`, Chromium.
- **Produces:** `data/.auth/allakhazam-session.json`.

```bash
node scripts/run-pipeline.js --allakhazam-login
```

#### `--allakhazam`

Scrape **camelot.allakhazam.com**: builds a zone→mob index once, then downloads each target
mob's page and parses the **"Known Loot"** section. Fully cached and resumable.

- **Requires:** `--extract`; recommended `--allakhazam-login`.
- **Produces:** `data/02-scraped/allakhazam/mobs/<slug>.json` + raw HTML cache + `_report.json`.
- **Note:** CloudFront may throttle the IP. On HTTP 403 the scraper waits and retries; if the
  block persists it stops after saving progress — just re-run to resume.

```bash
node scripts/run-pipeline.js --allakhazam --limit 20   # trial run of 20 mobs
```
```
[08:33:21] [3] Aaric: 33 drops
[08:33:39] Allakhazam: matched 15, scraped now 15, cached 0, no result 4
```

#### `--eden-login`

Opens a **visible browser** for a one-time manual **Discord** login on eden-daoc.net.

- **Produces:** `data/.auth/eden-session.json` + persistent profile `data/.auth/eden-profile/`.

```bash
node scripts/run-pipeline.js --eden-login
```

#### `--eden-recon`

Saves the authenticated structure of `/items` (HTML, screenshot, network JSON). Recon only —
used to discover/verify the internal API endpoints.

- **Requires:** a valid Eden session.
- **Produces:** `data/02-scraped/eden-daoc/recon/`.

#### `--eden`

Scrape **eden-daoc.net** via its **internal JSON API**: enumerate the full item catalog
(`search.php`), download each item's **full detail** (`item.php` — stats, bonuses, proc/use,
and the mobs that drop it), resolve mobs (`mob.php`), and build the mob→item map filtered to
your targets.

- **Requires:** `--eden-login` and `--extract`.
- **Produces:** `data/02-scraped/eden-daoc/items/<id>.json` (~22,818), `pages/`, `_mobs.json`,
  and `mobs/<slug>.json` for matching targets.
- **Note:** resumable — re-run to continue from cache. If the session expired, re-run `--eden-login`.

```bash
node scripts/run-pipeline.js --eden
```
```
[11:38:18] Mobs resolved: 5300
[11:38:25] Eden done: 1713/7215 targets with drops on Eden.
```

#### `--eden-effects`

Extract **all use/proc/charge/reactive/passive effects** of Eden items **from the already
downloaded cache** (no re-scrape), with name, spell id, type, **value** and every attribute.

- **Requires:** the Eden item cache (`--eden` already run).
- **Produces (in `data/05-output/eden-effects/`):** `effects.csv` (one row per item×effect),
  `items.json` (per item), `by-effect.json` (grouped by effect).

```bash
node scripts/run-pipeline.js --eden-effects
```
```
[16:11:48]   items with effects: 6494 · proc 2677 · use/charge 2494 · reactive 2226 · passive 201
[16:11:48]   distinct effects (name+spell): 708 · CSV rows 7598
```

#### `--merge`

**Phase 3.** Merge Eden + Allakhazam per normalized mob name. Eden provides the stats,
Allakhazam confirms/extends coverage; legacy `(nld)` Allakhazam items are flagged separately.

- **Requires:** `--extract` and at least one scraping source.
- **Produces:** `data/03-merged/drop_merged.json`.

```bash
node scripts/run-pipeline.js --merge
```
```
[14:28:44] Merge: 2604/7215 mobs with at least one drop (Eden 1713, Allakhazam 2049).
```

#### `--report`

Generate the **HTML diff report** ("current DB vs proposed"), publishable as a shareable page.
Each item is expandable (readable stats + raw JSON), shows the resolved `Id_nb` (reuse / to
create), with zone/category/sort filters and clipboard export.

- **Requires:** `--merge`, `--extract-loot`, `--extract`.
- **Produces:** `data/05-output/diff-report.html`.

```bash
node scripts/run-pipeline.js --report
```
```
[14:37:23] Diff report written (item dictionary: 12417)
[14:37:23]   changed 2484 (new loot 2246, modified 238), confirmed 120
[14:37:23]   items added 35200, removed 245, legacy 369
```

#### `--sql`

**Phase 5.** Generate `drops.sql` in **ADD-ONLY** mode (non-destructive, idempotent): no
DELETEs, only inserts drops a mob doesn't already have, guarded by `NOT EXISTS`, wrapped in a
transaction. Existing rows (`-3` conditional chances, DropCount, item stats) are left untouched.

- **Requires:** `--merge`, `--extract-loot`, `--extract`.
- **Produces:** `data/05-output/drops.sql` (same content as `deliverables/sql/drops_all.sql`).

```bash
node scripts/run-pipeline.js --sql
```

#### `--deliverables`

Generate files **organized per DB table** (JSON + SQL) + a `README.md`, meant to be worked on
table by table. Also ADD-ONLY and idempotent.

- **Requires:** `--merge`, `--extract-loot`, `--extract`.
- **Produces (in `data/05-output/deliverables/`):** `json/` (itemtemplate_new, loottemplate_add,
  mobxloottemplate_add, mob_loot, skipped), `sql/` (numbered per table + drops_all), `README.md`.

```bash
node scripts/run-pipeline.js --deliverables
```
```
[14:14:30] Deliverables (ADD-ONLY) written
[14:14:30]   mobs touched 2416 · new itemtemplate 2372 · loottemplate +33521 · new links 663 · skipped 1679
```

#### `--export`

Export the merged data into "raw" reviewer-friendly files (JSON + CSV + one file per mob).

- **Requires:** `--merge`, `--extract-loot`, `--extract`.
- **Produces (in `data/05-output/export/`):** `drop_merged_full.json`, `items_eden.json`,
  `items_allakhazam.json`, `drops.csv`, `per-mob/<slug>.json`.

#### `--item-explorer`

Generate the **Item Explorer**: a self-contained HTML page that mirrors `item-finder.js` in the
browser — search by name/slot/level, item profile, drops, merchants, recipes + ingredient tree,
and the GM command. Dump data is embedded (~9 MB).

- **Requires:** the SQL dump. **Produces:** `data/05-output/item-explorer.html`.
- **Note:** static snapshot of the dump; regenerate if the DB changes.

```bash
node scripts/run-pipeline.js --item-explorer
```
```
[16:00:12] Item Explorer written (9.09 MB)
[16:00:12]   items 34546 · loot 1792 · merch 48449 · craft 23041 · spell 246
```

### Global options

| Option | Default | Description |
|---|---|---|
| `--dump <path>` | `../sql/ardred-db-...sql` | SQL dump path (or `DUMP_PATH` in `.env`) |
| `--limit <n>` | — | limit the number of mobs scraped in this run (for trials) |
| `--only <name>` | — | process only the mob with this exact name |
| `--force` | off | ignore the cache and re-download |
| `--rate <ms>` | ~900 | milliseconds between HTTP requests (see also `RATE_MS`) |

```bash
node scripts/run-pipeline.js --allakhazam --only "abysmal" --force
```

---

## Standalone tools

Not part of the pipeline — run them directly. They read the dump (or cache) and print to
screen / write files.

### `status.js`

Show scraping **progress** (bars, counts, and whether a crawl is currently running).

```bash
node scripts/status.js      # or: npm run status
```
```
ALLAKHAZAM   running: false
  processed:   7215/7215  [██████████████████████████████] 100.0%
    - with page/drop: 5842
    - absent from allakhazam: 1373
EDEN-DAOC   running: false
  item details: 22818/22818  [██████████████████████████████] 100.0%
  mobs mapped (target match): 1713
```

### `item-finder.js`

**The swiss-army tool.** Given an item (by name or `Id_nb`), or a slot/level filter, print the
full profile: what it is + stats + bonuses, spells, **who drops it**, **who sells it**, which
recipes use it as an ingredient, the **recipe with ingredient ramification**, all tables that
reference it, and the **GM `/item create` command** ready to copy.

```bash
node scripts/item-finder.js ["<name or Id_nb>"] [--<slot>] [--level X] [--name "x"] [--list]
```

- **3-stage name search:** exact → contiguous → all-words (`"reactive arcanium"` also matches "reactive … arcanium").
- **`--level X`** : items of level ≥ X only.
- **`--name "x"`** : explicit name alias (handy with slots).
- **`--list`** : list only, no detailed profile.
- **Slot flags:** `--head --chest --legs --arms --hands --boots --cloak --neck --belt --wrist --ring --jewel --mythical --2h --mainhand --offhand --ranged`
- A slot alone shows the **first 80** results + total count (narrow with a name/level).

```bash
node scripts/item-finder.js "reactive ablative arcanium armor tincture"
node scripts/item-finder.js --legs --level 50 --list
```
```
══ RECIPE & RAMIFICATION (ingredients → source) ══
  skill: Alchemy  level: 1094
  reactive ablative arcanium armor tincture  (product)
  ├─ 2x arcanium metal bars        sold by 19
  ├─ 1x reactive shielding catalyst   sold by 30
  └─ 2x silvery faerie hair        sold by 21
```

### `db-mob-loot.js`

Show a mob's **current loot table** in the DB.

```bash
node scripts/db-mob-loot.js "director kobil"
```

### `find-mob.js`

Search a mob by (part of) name and show where it appears: in the **DB targets**, in scraped
**Allakhazam**, and in mapped **Eden**.

```bash
node scripts/find-mob.js kobil
```

### `list-regions.js`

List **regions** with real zone names and mob counts. No args → in-scope regions; with an arg →
filter by zone/region name.

```bash
node scripts/list-regions.js            # in-scope regions
node scripts/list-regions.js avalon     # search "avalon"
```

### `verify-analysis.js`

Data-integrity checks: counts **active effects** on Eden items (proc/use/charge) and the
**chance distribution** in `loottemplate` (including the `-3` conditional drops).

```bash
node scripts/verify-analysis.js
```

### `show-itemtemplate-ddl.js`

Print the column **definitions** of the `itemtemplate` table (useful for understanding types
and defaults when generating INSERTs).

```bash
node scripts/show-itemtemplate-ddl.js
```

---

## npm scripts

Defined in `scraper/package.json` (shortcuts for the `node ...` commands):

```bash
npm run extract           # node scripts/run-pipeline.js --extract
npm run allakhazam-login  # ... --allakhazam-login
npm run allakhazam        # ... --allakhazam
npm run eden-login        # ... --eden-login
npm run eden              # ... --eden
npm run status            # node scripts/status.js
```

---

## Environment variables

`scraper/.env` (git-ignored):

| Variable | Default | Effect |
|---|---|---|
| `AK_USER` / `AK_PASS` | — | Allakhazam account (for `--allakhazam-login`) |
| `DUMP_PATH` | `../sql/ardred-db-...sql` | alternative dump path |
| `RATE_MS` | 900 | ms between HTTP requests (also `--rate`) |
| `PAUSE_EVERY` | 90 | requests between long courtesy pauses (0 = never) |
| `PAUSE_MS` | 30000 | long pause duration |
| `BLOCK_WAIT_MS` | 60000 | wait on HTTP 403 before retrying |
| `BLOCK_RETRIES` | 4 | retries on 403 before giving up |
| `EDEN_RATE_MS` | 500 | ms between Eden API calls |
| `NEW_CHANCE` | 100 | placeholder chance for new drops in generated SQL |

---

## Project structure

```
DaocScraper/
├── README.md                      # this file
├── baseproject.md                 # original technical brief
├── sql/                           # the database dump (input)
├── opendaocPatches/               # Ardred server source (reference)
└── scraper/                       # the tool
    ├── config/target-zones.json   # in-scope regions/zones (from --extract)
    ├── data/                      # all output (git-ignored)
    │   ├── .auth/                 # saved sessions (Allakhazam, Eden)
    │   ├── 01-extracted/          # mob_targets, item_existing, db_loot, db_items
    │   ├── 02-scraped/            # allakhazam/ and eden-daoc/ caches
    │   ├── 03-merged/             # drop_merged.json
    │   └── 05-output/             # diff-report.html, drops.sql, deliverables/,
    │                              # export/, item-explorer.html, eden-effects/
    ├── src/                       # pipeline code
    │   ├── 00-extract-db/  01-scrape-allakhazam/  02-scrape-eden/
    │   ├── 03-merge/  05-report/  06-sql/  07-explorer/  lib/
    ├── scripts/                   # CLI + standalone tools
    └── documentation/COMMANDS.md  # detailed command docs (Italian)
```

---

## Design notes

- **Add-only SQL.** Generated SQL never deletes or rewrites existing rows. It only inserts new
  mob→item associations (guarded by `NOT EXISTS`) and creates brand-new items with an `scrp_`
  `Id_nb` prefix, so existing chances (including conditional `-3`), DropCounts, and item stats
  stay intact. Drop-rate tuning and existing-item updates are deliberately separate concerns.
- **Caching.** All scraping is cached under `data/02-scraped/`; re-runs never repeat completed
  requests. Use `--force` to re-download.
- **Static artifacts.** The diff report and Item Explorer embed a snapshot of the dump —
  regenerate them if the database changes.
- **Never import to production directly.** Test generated SQL on a disposable staging copy first.

---

*Built for the OpenDAoC **Ardred** server (Classic + Shrouded Isles + Darkness Falls).*
