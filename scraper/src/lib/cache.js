import fs from 'node:fs';
import path from 'node:path';

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

export function exists(file) {
  return fs.existsSync(file);
}

/** Scrive un heartbeat (epoch ms) per segnalare che uno scraper è vivo. */
export function heartbeat(file) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, String(Date.now()), 'utf8');
  } catch {
    /* best-effort: un heartbeat mancato non deve fermare lo scraping */
  }
}
