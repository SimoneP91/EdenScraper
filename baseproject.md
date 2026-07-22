# Piano d'azione — Ricostruzione tabella Drop (Mob → Item) per server OpenDaoc PvP

**Ambito:** Classic + Shrouded Isles + Darkness Falls
**Fonti dati:** camelot.allakhazam.com (loginless) + eden-daoc.net/items (login Discord)
**Output finale:** file `.sql` pronto per l'import, con dati validati per ogni mob del DB allegato
**Stack consentito:** Node.js, React, ecosistema npm/npx (nessun altro linguaggio)
**Questo documento è il brief da consegnare così com'è all'agente che costruirà il sistema.**

---

## 1. Contesto — cosa sono le cose in gioco

### 1.1 Dark Age of Camelot (DAoC)
MMORPG del 2001 (Mythic Entertainment) basato su PvP a tre fazioni (Realm vs Realm): **Albion**, **Hibernia**, **Midgard**. Ogni fazione ha il proprio continente, le proprie classi/razze e i propri dungeon PvE. Il gioco ufficiale ha ricevuto espansioni nel tempo: *Shrouded Isles* (2002), *Trials of Atlantis* (2003), *Catacombs* (2004), *Darkness Rising* (2006), ecc. Il tuo progetto si ferma volutamente **prima** di Trials of Atlantis.

### 1.2 OpenDaoc
Emulatore server free/open-source (fork moderno del progetto storico "DOL / Dawn of Light") che reimplementa il game server di DAoC. Legge la propria "world" da un database MySQL/MariaDB con uno schema molto simile a quello originale DOL (tabelle `mob`, `itemtemplate`, `loottemplate`, ecc. — vedi sezione 4). È quello che gira sul file che mi hai allegato. Il fork specifico che usi si chiama **Ardred** — vedi sezione 3 per le patch rispetto al progetto originale.

### 1.3 Le zone Classic + SI + Darkness Falls (dati reali estratti dal tuo DB)

Nel dump, ogni riga della tabella `regions` ha un campo `Expansion`:

| Expansion | Significato | Nr. region nel tuo DB |
|---|---|---|
| **0** | Classic (incluse le città capitali, i dungeon classici e **Darkness Falls**, region 249) | 57 |
| **1** | Shrouded Isles | 16 |
| 2 | Trials of Atlantis | 35 — **fuori scope** |
| 3 | Catacombs (dungeon/housing) | 230 — **fuori scope** |
| 4 | Darkness Rising / Labyrinth of Minotaur | 16 — **fuori scope** |

➡️ **Filtro operativo: `Expansion IN (0,1)`** sulla tabella `regions`. Darkness Falls è già inclusa automaticamente (è Expansion=0, RegionID **249**), non serve trattarla come caso a parte se non per marcarla esplicitamente nei log (è una zona "instanziata" un po' particolare: l'accesso dipende dal controllo delle relic keep, ma i mob e i drop al suo interno sono normalissimi dati DB).

Con questo filtro, dal tuo DB attuale risultano:
- **97.522 mob-spawn** su un totale di 97.819 (il resto, ~300, è in ToA/Catacombs/DR e va escluso)
- **7.259 nomi di mob univoci** (questo è il numero reale di "creature" per cui serve reperire i drop — i mob-spawn sono le istanze nel mondo, ma il drop in OpenDaoc è definito **per nome**, non per singola istanza)
- **170 zone nominate** (es. Camelot Hills, Salisbury Plains, Trollheim, HyBrasil...) dentro le region Classic+SI, su 481 totali nel DB

Le region con più mob sono, in ordine: Midgard (100), Albion (1), Hibernia (200), Aegir (151, SI), Avalon (51, SI), HyBrasil (181, SI), Darkness Falls (249), Trollheim (150, SI).

---

## 2. Insight critico dal DB: non tutti i mob hanno bisogno di scraping

Questo è il punto più importante del piano, perché cambia la dimensione reale del lavoro.

In OpenDaoc/DOL il drop di un mob viene deciso in due modi diversi:

1. **Drop generico/procedurale** (la stragrande maggioranza dei mob comuni): oro, materiali di crafting generici, item "filler" di livello coerente col mob. Questo **non è quasi mai salvato riga-per-riga nel DB**: è generato a runtime dal codice server (classe `LootGenerator*`) in base a livello/razza/regno del mob. Per questi mob **non esiste un drop "da scrapare"** in senso stretto — allakhazam/eden-daoc li segnano quasi sempre come "no special loot" o non li listano affatto.
2. **Drop esplicito/nominale** (mob nominati, boss, epici, mob con item unici o notevoli): questi hanno righe dedicate nelle tabelle `mobxloottemplate` + `loottemplate`.

Nel tuo DB attuale:
- `mobxloottemplate`: **3.219 righe**, **3.072 nomi di mob distinti** con almeno un template di loot assegnato
- `loottemplate`: **1.792 righe** raggruppate in **659 TemplateName distinti** (i mob "importanti" con paniere di drop esplicito, in media ~2,7 item ciascuno)
- Le tabelle legacy `mobdroptemplate` e `droptemplatexitemtemplate` sono **vuote** (0 righe): non più usate in questa versione, ignorale.
- `itemtemplate`: **34.546 item totali** definiti nel DB (armi, armature, materiali, quest item — non solo drop).

➡️ **Conseguenza pratica per lo scraping:** la priorità assoluta va data ai **~3.072–7.259 nomi di mob** (a seconda che tu voglia coprire solo chi ha già loot esplicito o *tutti* i nomi presenti in Classic+SI+DF), e per ciascuno l'obiettivo è determinare "ha drop notevoli sì/no" e in caso positivo l'elenco preciso. Per i mob senza alcun drop trovato su nessuna delle due fonti, la strategia corretta è **lasciare il drop generico** (non forzare un item a caso), oppure eventualmente generare un drop di "moneta/materiale" coerente col livello — decisione da prendere in fase di design, non di scraping.

---

## 3. Il fork "Ardred": patch rispetto a OpenDaoc vanilla, e cosa conta per i drop

Il file `src.zip` che hai allegato è una repo git vera e propria: un solo commit base (`82e43aa`, upstream ufficiale `github.com/OpenDAoC/OpenDAoC-Core`) con le vostre modifiche non ancora committate sopra. Questo mi ha permesso di fare `git diff` contro l'upstream reale e vedere **esattamente** cosa cambia, riga per riga, invece di ipotizzare. Il progetto si chiama **Ardred** (compare nei commenti del codice, ed è lo stesso prefisso del file DB che mi avevi mandato: `ardred-db-...`) ed è esplicitamente descritto in codice come *"PvP-everywhere"* — coerente con quanto mi avevi detto.

Bilancio: **28 file esistenti modificati** (542 righe aggiunte, 299 rimosse) **+ 1 file nuovo** (`GameServer/scripts/ardred/ArdredTeleporter.cs`, un teleporter cross-reame per i 3 hub principali). La maggior parte **non riguarda i drop** — la elenco per trasparenza, senza approfondire perché fuori dal tuo scope dichiarato:

- 9 file in `realmabilities/handlers/` → ribilanciamento Realm Abilities (Avoidance of Magic, Determination, Falcon's Eye, Mastery of Stealth, ecc.), non tocca item
- `AttackComponent.cs`, `GameLiving.cs`, `GamePlayer.cs` (in parte), `MaxSpeedCalculator.cs`, `StyleProcessor.cs`, `SkillBase.cs` → combattimento e normalizzazione armi cross-realm (vedi §3.2), oltre a un fix per cui un giocatore morto-ma-non-rilasciato non guadagna più XP
- `Guild.cs`, `AccountVaultKeeper.cs`, parte di `GamePlayer.cs`/`GamePlayerInventory.cs` → vault ed economia (oro) condivisi **per account** invece che per singolo regno (vedi §3.3)
- `Hastener.cs`, `SimpleTeleporter.cs`, `scripts/teleporters/*`, `ArdredTeleporter.cs` (nuovo) → NPC di viaggio custom
- `ZoneBonusRotator.cs` → il rotator nativo di bonus RP/BP per zona di frontiera esiste ma è disattivato di default (evento di avvio commentato), riattivabile a mano via comando GM

Le due modifiche che invece contano davvero per il tuo progetto:

### 3.1 Loot generico (RoG) — conferma da codice di quanto ipotizzato in Sezione 2

`GameServer/Managers/RandomObjectGeneration/AtlasMobLoot.cs` **è** il sistema procedurale a cui accennavo in Sezione 2 (quello che genera oro/materiali/item "filler" a runtime, non da tabella `loottemplate`). Il fork prende la chance base di drop — originariamente una costante hardcoded al 14% — e la trasforma in una server property hot-tunable: `ardred_base_rog_chance`. **Nel tuo DB attuale vale 40, non più 14**: il server genera quindi molto più loot procedurale casuale di un OpenDaoc vanilla, modificabile a caldo senza restart.

Non cambia nulla di operativo rispetto al piano: conferma solo che per i mob "comuni" (senza loot esplicito in `mobxloottemplate`) le due fonti quasi certamente non riportano drop fissi, perché anche in gioco quel loot è casuale — solo *più frequente* qui che su un server vanilla.

### 3.2 Cross-realm items abilitato — rilevante per la Fase 4 (mapping)

Confermato sia nel codice (nuovo metodo `NormalizeWeaponType` in `AbstractServerRules.cs`, usato da combattimento ed equip) sia **live nel tuo DB**: `serverproperty.allow_cross_realm_items = True`. Sul server i giocatori possono equipaggiare item nativi di un altro regno — coerente con l'`ArdredTeleporter` che fa girare chiunque tra le 3 capitali.

Due file **non toccati dalla patch** (quindi vanilla) sono comunque rilevanti: `LootGeneratorMobTemplate.cs` e `LootGeneratorTemplate.cs` — cioè il codice che legge `mobxloottemplate`/`loottemplate`, le tabelle che riempiremo noi — filtrano già un drop mostrandolo solo se `drop.Realm == player.Realm || drop.Realm == 0 || player.CanUseCrossRealmItems`. Due conseguenze concrete per la Fase 4:

- Il campo `itemtemplate.Realm` (0 = universale, 1/2/3 = nativo di un regno) **resta significativo e va popolato con criterio** per ogni item nuovo creato dallo scraping, anche se il cross-equip è abilitato — è quel campo a decidere a chi viene mostrato il drop.
- La patch blocca **intenzionalmente** le armi Axe/LeftAxe di Midgard (famiglia senza equivalente su Albion/Hibernia) dall'essere equipaggiate da quei due regni, in qualunque forma. Non impatta l'inserimento dei drop in sé, ma se la Fase 4 crea un nuovo `itemtemplate` per un'arma scrapata, `Object_Type`/`Item_Type` vanno impostati copiando i valori da un'arma esistente della stessa categoria già in DB — mai inventati — per non confondere questa logica di normalizzazione.

### 3.3 Nota di contesto, non-drop: vault ed economia unificati per account
`AccountVaultKeeper.cs` e la gestione di `DbAccountXMoney` sono stati cambiati per condividere vault e monete **per account** invece che per singolo regno. Coerente con un server dove un account gioca su più regni. Non tocca `itemtemplate`/`loottemplate`/`mobxloottemplate`, la segnalo solo per completezza.

*Nota minore:* nel DB sono presenti anche property `ardred_hotspot_*` (bonus RP/BP a rotazione su "zone calde") senza codice corrispondente in questo `src.zip` — probabilmente appartengono a un'altra patch non allegata qui. Non toccano i drop, quindi non le ho approfondite; te lo segnalo solo per completezza nel caso ti aspettassi di vederle.

---

## 4. Come funziona il database (schema rilevante ai drop)

Tabelle coinvolte, con le colonne che contano davvero:

```
regions (RegionID PK, Name, Expansion, IsFrontier, ...)
   └─ zones (ZoneID, RegionID FK, Name, ...)          → nomi "leggibili" tipo "Camelot Hills"

mob (Mob_ID PK uuid, Name, Region FK→regions.RegionID,
     X, Y, Z, Level, Realm, Guild, ...)                → ogni riga è UNA istanza/spawn nel mondo

mobxloottemplate (MobXLootTemplate_ID PK,
     MobName,            → testo, si lega a mob.Name (NON a Mob_ID!)
     LootTemplateName,   → chiave verso loottemplate.TemplateName
     DropCount)          → quanti item random tra quelli del template droppano insieme

loottemplate (LootTemplate_ID PK,
     TemplateName,        → raggruppa più righe = "paniere" di drop
     ItemTemplateID,      → FK verso itemtemplate.Id_nb
     Chance,               → probabilità 0-100
     Count)                → quantità droppata

itemtemplate (Id_nb PK varchar,   → chiave leggibile tipo "0_Demon_Bound_Bracelet"
     Name, Level, Object_Type, Item_Type, Model,
     DPS_AF, SPD_ABS, Bonus1..10, Bonus1Type..10Type,
     Quality, Price, ecc.)        → 80 colonne, definizione COMPLETA dell'item
```

**Punto chiave sul legame:** `mob.Name` e `mobxloottemplate.MobName` sono **stringhe testuali**, non ID. Questo significa che **tutti gli spawn con lo stesso nome condividono lo stesso drop table** — è così che funziona nativamente OpenDaoc, ed è coerente col fatto che allakhazam/eden-daoc indicizzano i drop *per nome del mostro*, non per singola posizione sulla mappa. Questo semplifica moltissimo il matching: la chiave di join per tutto il progetto è **il nome del mob (case-insensitive, trim)**.

**Punto sugli item:** quando uno scraping trova un drop che corrisponde a un item già presente in `itemtemplate` (stesso nome, stesse stat), va riusato l'`Id_nb` esistente. Quando l'item non esiste (o le fonti disagree sulle stat), va creato un nuovo `Id_nb` con una convenzione chiara (es. prefisso `scrp_` + slug del nome) per non confondere i dati scrapati con quelli originali del DB — questo rende anche più facile un rollback.

---

## 5. Le due fonti

| Fonte | Autenticazione | Contenuto | Rischio tecnico |
|---|---|---|---|
| **camelot.allakhazam.com** | nessuna | Enciclopedia storica DAoC: pagine mob con elenco drop, pagine item con stat complete | Sito vecchio, HTML non sempre coerente tra pagine, servono selettori robusti + fallback |
| **eden-daoc.net/items** | Discord OAuth | Database drop di un freeshard "Eden" (probabilmente più aggiornato/coerente con la classic ruleset moderna) | Serve sessione autenticata persistente; possibile rate-limit o protezione anti-bot (Cloudflare) |

Le due fonti vanno trattate come **indipendenti e poi riconciliate**: è molto probabile che non coincidano su tutto (item mancanti su una fonte, nomi leggermente diversi, chance diverse). Il piano prevede uno step di merge con priorità configurabile (di default: eden-daoc vince se in conflitto diretto sullo stesso mob+item, perché è dato specifico di un altro freeshard OpenDaoc-like già "giocabile"; allakhazam riempie i buchi).

---

## 6. Architettura del progetto (Node.js)

Struttura di cartelle proposta (monorepo semplice, no framework pesanti):

```
daoc-drop-scraper/
├── package.json
├── .env                          # credenziali/percorsi, MAI committare
├── config/
│   └── target-zones.json         # elenco RegionID Classic+SI+DF, generato da step 0
├── data/
│   ├── 00-source/                # dump SQL originale (sola lettura)
│   ├── 01-extracted/             # mob_targets.json, item_existing.json (estratti dal DB)
│   ├── 02-scraped/
│   │   ├── allakhazam/           # 1 json per mob grezzo, cache immutabile
│   │   └── eden-daoc/
│   ├── 03-merged/                # drop_merged.json (fonte unica riconciliata)
│   ├── 04-mapped/                # drop_mapped.json (con Id_nb risolti/creati)
│   └── 05-output/
│       ├── drops.json            # output finale in JSON
│       └── drops.sql             # output finale in SQL
├── src/
│   ├── 00-extract-db/            # legge il dump .sql (o si connette a mysql) → mob_targets.json
│   ├── 01-scrape-allakhazam/     # crawler + parser
│   ├── 02-scrape-eden/           # auth Discord (manuale una tantum) + crawler + parser
│   ├── 03-merge/                 # riconciliazione multi-fonte
│   ├── 04-map-to-db/             # matching/creazione itemtemplate.Id_nb
│   ├── 05-generate-sql/          # emette lo .sql finale
│   └── lib/
│       ├── http.js               # client con rate-limit, retry, user-agent
│       ├── cache.js               # cache su disco per non ri-scrapare
│       ├── logger.js
│       └── slugify.js
├── scripts/
│   └── run-pipeline.js           # orchestratore CLI (esegue gli step in sequenza)
└── report/
    └── dashboard/                 # (opzionale) piccola app React per revisione umana
```

Librerie npm consigliate (tutte nell'ecosistema consentito):
- **playwright** — per eden-daoc.net (serve un vero browser per l'OAuth Discord e per superare eventuali protezioni JS/Cloudflare); persiste il profilo utente su disco così il login va fatto a mano una sola volta
- **cheerio** + **undici/axios** — per allakhazam (HTML statico, non serve browser reale → molto più veloce e leggero)
- **better-sqlite3** — database di staging locale per fare join/query comode tra estrazione DB, scraping e mapping, senza reinventare un motore di query in JS puro
- **p-queue** — per limitare le richieste concorrenti e rispettare i siti target
- **commander** — CLI per lanciare i singoli step (`node scripts/run-pipeline.js --step=scrape-allakhazam --resume`)
- **zod** — validazione degli oggetti JSON intermedi ad ogni step (per intercettare dati scrapati malformati prima che inquinino lo step successivo)
- **dotenv** — configurazione
- (opzionale) **react** solo per una dashboard locale di revisione — vedi §8

---

## 7. Le fasi operative

### Fase 0 — Estrazione dei target dal DB (nessuno scraping ancora)
Obiettivo: produrre `data/01-extracted/mob_targets.json`, la lista definitiva e univoca dei mob da cercare.

1. Parsing del dump `.sql` (o import in MySQL/MariaDB locale via Docker, se si preferisce lavorare con query reali invece che parsing testuale — **consigliato**, perché più robusto di un parser SQL scritto a mano).
2. Query: `SELECT DISTINCT Name, MIN(Level) as minLvl, MAX(Level) as maxLvl, Realm, Region FROM mob WHERE Region IN (<lista region Expansion 0/1>) GROUP BY Name`.
3. Join con `mobxloottemplate` per marcare quali nomi hanno *già* drop espliciti nel DB (utile come base di confronto/QA, non da buttare).
4. Output: un record per ogni mob univoco, con: nome, livelli min/max osservati, region/e in cui compare, realm, e flag `hasExistingLoot`.
5. Estrazione anche di `data/01-extracted/item_existing.json`: tutti gli `itemtemplate` esistenti (per il matching in Fase 4), indicizzati per nome normalizzato.

Questo step **non richiede alcuna connessione a Internet** e va fatto per primo perché definisce esattamente cosa cercare nelle fasi successive (evita di scrapare a caso).

### Fase 1 — Scraping Allakhazam (loginless)
1. Per ogni mob in `mob_targets.json`, costruire l'URL/ricerca sul sito (allakhazam espone una ricerca testuale — va verificata la struttura reale delle URL con un piccolo script di ricognizione prima di scrivere il parser definitivo, perché siti storici come questo spesso hanno URL non banali/con ID interni).
2. Gestire i casi "nessun risultato" e "risultati multipli con lo stesso nome" (loggare come `ambiguous`, da rivedere manualmente).
3. Per ogni pagina mob trovata, estrarre: nome esatto, livello, region/zona indicata dal sito, elenco item droppati con eventuale % chance se presente.
4. Cache su disco per nome mob (`data/02-scraped/allakhazam/<slug>.json`) — fondamentale: lo scraping di ~7.000 pagine richiederà ore/giorni con rate-limit rispettoso, e non va MAI ripetuto da zero per un rerun.
5. Rate limiting conservativo (es. 1 richiesta ogni 1-2 secondi, backoff esponenziale sugli errori 429/503).

### Fase 2 — Scraping eden-daoc.net/items (autenticato Discord)
1. **Login iniziale manuale**: uno script Playwright apre un browser reale (non headless), l'utente fa login con Discord a mano, poi lo script salva lo `storageState` (cookie + local storage) di Playwright su disco (`data/.auth/eden-session.json`).
2. Tutti i run successivi riusano quella sessione salvata (headless), senza richiedere login ogni volta — va solo previsto un controllo "sessione scaduta → richiedi nuovo login manuale" con messaggio chiaro.
3. Stessa logica di Fase 1: ricerca per nome mob, estrazione item+chance, cache su disco, rate limiting.
4. Nota: se eden-daoc espone un'API JSON sotto il cofano (molti siti "moderni" fatti con framework tipo Next.js la hanno), va **preferita all'HTML scraping** — va verificato ispezionando le richieste di rete della pagina reale prima di scrivere il parser. Questo va scoperto/validato dall'agente in fase di ricognizione, non assunto qui.

### Fase 3 — Merge multi-fonte
1. Per ogni mob, unire i risultati Allakhazam + Eden-DAoC su chiave nome-normalizzato.
2. Regole di conflitto (default proposto, configurabile):
   - Item presente su una sola fonte → tenuto, con campo `source` tracciato.
   - Item presente su entrambe con stesso nome ma chance/quantità diverse → vince eden-daoc (più vicino a un contesto OpenDaoc), ma il valore scartato va comunque salvato in un campo `conflicts[]` per audit, mai buttato via silenziosamente.
   - Nomi item leggermente diversi (typo, capitalizzazione, "of" vs "Of") → normalizzazione + fuzzy match (es. libreria `string-similarity`) con soglia alta, sotto soglia → flag `needsReview`.
3. Output: `data/03-merged/drop_merged.json`, un record per mob con l'elenco item finale + provenienza.

### Fase 4 — Mapping verso il DB (Id_nb)
1. Per ogni item scrapato, cercare corrispondenza in `item_existing.json` (nome normalizzato + eventualmente livello/tipo se disponibili come ulteriore discriminante).
2. Se trovato → riusa `Id_nb` esistente (comportamento "aggiorna", coerente con la tua richiesta "al massimo aggiorni, ma meglio sostituire").
3. Se non trovato → crea un nuovo `Id_nb` sintetico e un record `itemtemplate` minimo ma coerente (Name, Level plausibile, placeholder per le stat non note dallo scraping) — va deciso e documentato esplicitamente quali campi lasciare a default quando la fonte non fornisce le stat complete dell'item (è un limite reale dello scraping: allakhazam/eden spesso mostrano l'item ma non tutti gli 80 campi di `itemtemplate`).
4. **`Realm` e `Object_Type`/`Item_Type` non sono campi "a caso" su questo server** (vedi §3.2): il primo decide a chi viene mostrato il drop anche col cross-realm equip abilitato, i secondi alimentano la logica custom di normalizzazione armi. Per ogni item nuovo, popolarli copiando i valori da un `itemtemplate` esistente della stessa categoria/regno (query di riferimento), mai a valori inventati o di default silenzioso.
5. Output: `data/04-mapped/drop_mapped.json`, pronto per la generazione SQL.

### Fase 5 — Generazione output finale
1. **JSON finale** (`drops.json`): elenco completo e leggibile, utile per revisione umana e per future integrazioni.
2. **SQL finale** (`drops.sql`): dato che hai chiesto "sostituire piuttosto che aggiornare", la strategia consigliata è:
   - `DELETE FROM mobxloottemplate WHERE MobName IN (<mob coperti da questo run>);`
   - `DELETE FROM loottemplate WHERE TemplateName IN (<template coperti>);`
   - seguito da `INSERT INTO loottemplate (...) VALUES (...)` e `INSERT INTO mobxloottemplate (...) VALUES (...)` per i nuovi dati
   - eventuali `INSERT ... ON DUPLICATE KEY UPDATE` per gli `itemtemplate` nuovi/aggiornati (qui "sostituire" è più delicato perché un item potrebbe già essere equipaggiato su un personaggio esistente — va preferito l'update mirato ai soli campi noti, non una sostituzione totale della riga)
   - Tutto lo script SQL generato va **wrappato in una transazione** (`START TRANSACTION; ... COMMIT;`) così un import fallito a metà è annullabile.
3. Un file di log/report a fianco (`drops-report.md` o `.csv`) con: quanti mob coperti, quanti item nuovi creati, quanti conflitti irrisolti, quanti mob senza alcun risultato su nessuna fonte (questi ultimi sono normali — vedi §2, sono probabilmente mob "generici").

### Fase 6 — QA / validazione prima dell'import
1. Validazione sintattica dello `.sql` generato (parse a vuoto su un DB di test, non sul DB di produzione).
2. Controllo di integrità referenziale: ogni `LootTemplateName` in `mobxloottemplate` deve avere almeno una riga in `loottemplate`; ogni `ItemTemplateID` deve esistere in `itemtemplate`.
3. Import su un **DB di staging/copia**, mai direttamente su quello di produzione — poi diff numerico (conteggio righe prima/dopo) prima del rollout reale.

---

## 8. (Opzionale ma consigliata) Dashboard di revisione in React

Dato che l'ecosistema consentito include React: una piccola SPA locale (anche solo `vite` + React, servita in dev) che legge `data/03-merged/drop_merged.json` e mostra:
- lista mob con badge di stato (ok / needsReview / noResult / conflicts)
- per ogni mob, confronto affiancato Allakhazam vs Eden-DAoC
- possibilità di marcare manualmente "approvato" prima che un mob entri nella Fase 4

Questo è ciò che rende il progetto gestibile su ~7.000 mob senza dover fidarsi ciecamente del merge automatico: è il punto in cui l'occhio umano interviene sui casi ambigui, che con ogni probabilità saranno qualche centinaio, non migliaia.

---

## 9. Note etiche/operative sullo scraping (da rispettare nell'implementazione)

- Rispettare `robots.txt` di entrambi i siti e i rispettivi Termini di Servizio.
- Identificarsi con uno User-Agent onesto (non spacciarsi per un browser reale se il sito lo richiede esplicitamente per policy, salvo dove serve un vero browser per l'auth Discord).
- Rate limiting conservativo per non sovraccaricare i server (specialmente allakhazam, sito storico probabilmente con infrastruttura limitata).
- Caching aggressivo per non ri-richiedere la stessa pagina più volte tra un run e l'altro.
- Per eden-daoc.net, l'unica autenticazione prevista è quella dell'account Discord dell'utente stesso (login manuale, sessione riusata) — nessun bypass di protezioni anti-bot va tentato.

---

## 10. Stima approssimativa delle fasi (a scopo di pianificazione, non impegno vincolante)

| Fase | Complessità | Nota |
|---|---|---|
| 0 — Estrazione DB | Bassa | Un giorno di lavoro, è puro parsing/query locale |
| 1 — Scraping Allakhazam | Media-Alta | Il grosso del tempo è I/O (rate limit), non lo sviluppo. Ricognizione struttura sito richiesta prima di scrivere il parser definitivo |
| 2 — Scraping Eden-DAoC | Media-Alta | Setup auth Discord + verifica se esiste API JSON sottostante (riduce di molto il lavoro se sì) |
| 3 — Merge | Media | Qui vive la logica di business più delicata (conflitti, fuzzy match) |
| 4 — Mapping DB | Media | Decisioni su come trattare item "nuovi" senza stat complete |
| 5 — Generazione SQL | Bassa | Meccanico, una volta chiaro il formato target |
| 6 — QA | Bassa-Media | Da fare su ambiente di staging, mai in produzione diretta |
| 7 — Dashboard (opz.) | Media | Solo se si vuole revisione visuale invece che via JSON/CSV grezzi |

---

## 11. Riepilogo numeri chiave (dal tuo DB reale, per calibrare l'agente)

- Region totali nel DB: 354 → in scope (Expansion 0+1): **73**
- Zone nominate totali: 481 → in scope: **170**
- Mob-spawn totali: 97.819 → in scope: **97.522**
- **Nomi di mob univoci in scope: 7.259** ← questo è il numero reale di ricerche da fare sulle 2 fonti
- Mob con loot esplicito già presente nel DB attuale: 3.072 (base di confronto/QA)
- Righe `loottemplate` attuali: 1.792, raggruppate in 659 template nominati
- `itemtemplate` totali nel DB: 34.546 (universo item esistente su cui fare matching prima di crearne di nuovi)
- Darkness Falls = RegionID 249, Expansion 0, già incluso nel filtro Classic — 2.493 mob-spawn al suo interno
- Chance base di loot procedurale (RoG, non da tabella): **40%** (property `ardred_base_rog_chance`, hot-tunable, era 14% in vanilla) — conferma da codice dell'Insight §2
- Cross-realm items: **abilitato** (`allow_cross_realm_items = True`) — il campo `Realm` su ogni `itemtemplate` nuovo va popolato con criterio, vedi §3.2 e Fase 4 punto 4

---

*Documento pronto per essere passato integralmente come prompt/brief iniziale a Claude Fable per l'implementazione tecnica.*
