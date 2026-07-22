import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = fs.readFileSync(path.resolve(root, '..', 'sql', 'ardred-db-20260717-222844.sql'), 'utf8');
const m = sql.match(/CREATE TABLE `itemtemplate` \(([\s\S]*?)\n\) ENGINE/);
const lines = m[1].split('\n').filter((l) => /^\s*`/.test(l));
for (const l of lines) console.log(l.trim());
