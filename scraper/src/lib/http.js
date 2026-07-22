import PQueue from 'p-queue';
import { log } from './logger.js';

const USER_AGENT =
  'daoc-drop-scraper/0.1 (personal OpenDaoc freeshard research; contact: sponte91@gmail.com)';

// Rate limit configurabile via RATE_MS. Da loggati (cookie sessione) la soglia di
// blocco CloudFront sale da ~120-160 a ~440 richieste, ma NON è illimitata: sotto
// crawl sostenuto scatta comunque un blocco IP-wide. Quindi rate moderato + pausa.
const interval = Number(process.env.RATE_MS ?? 900);
const queue = new PQueue({ concurrency: 1, interval, intervalCap: 1 });

// Pausa periodica per restare SOTTO il limite cumulativo per IP di CloudFront.
// Un IP appena sbloccato ha soglia più bassa (~150), quindi pausa frequente+breve.
const PAUSE_EVERY = Number(process.env.PAUSE_EVERY ?? 90);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 30_000);
let requestCount = 0;

let cookieHeader = null;
/** Imposta l'header Cookie inviato con ogni richiesta (sessione loggata). */
export function setCookie(header) {
  cookieHeader = header;
}

// Su 403 (blocco CloudFront, spesso transitorio) aspetta e riprova più volte
// prima di arrendersi: assorbe i blocchi a finestra rolling senza abortire il run.
const BLOCK_WAIT_MS = Number(process.env.BLOCK_WAIT_MS ?? 60_000);
const BLOCK_RETRIES = Number(process.env.BLOCK_RETRIES ?? 4);

export class BlockedError extends Error {}

export async function fetchHtml(url, { retries = 3 } = {}) {
  return queue.add(async () => {
    if (PAUSE_EVERY > 0 && ++requestCount % PAUSE_EVERY === 0) {
      log.info(`Pausa di cortesia ${PAUSE_MS / 1000}s dopo ${requestCount} richieste...`);
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    let delay = 3000;
    let blockHits = 0;
    for (let attempt = 1; ; attempt++) {
      try {
        const headers = { 'user-agent': USER_AGENT, accept: 'text/html' };
        if (cookieHeader) headers.cookie = cookieHeader;
        const res = await fetch(url, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(60_000),
        });
        if (res.status === 200) return await res.text();
        if (res.status === 404) return null;
        if (res.status === 403) {
          blockHits++;
          if (blockHits > BLOCK_RETRIES)
            throw new BlockedError(
              `HTTP 403 persistente dopo ${BLOCK_RETRIES} attese: blocco prolungato, riprendi più tardi`
            );
          log.warn(
            `403 (blocco transitorio) su ${url}, attesa ${BLOCK_WAIT_MS / 1000}s e retry ${blockHits}/${BLOCK_RETRIES}...`
          );
          await new Promise((r) => setTimeout(r, BLOCK_WAIT_MS));
          continue; // non conta come attempt "normale"
        }
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        if (err instanceof BlockedError) throw err;
        if (attempt > retries) throw err;
        log.warn(`fetch ${url} fallita (${err.message}), retry ${attempt}/${retries} tra ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }
  });
}
