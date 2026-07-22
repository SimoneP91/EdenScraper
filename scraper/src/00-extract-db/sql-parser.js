/**
 * Parser minimale per dump mysqldump: estrae colonne (da CREATE TABLE)
 * e righe (da INSERT INTO ... VALUES) di una singola tabella.
 * Gestisce stringhe quotate con escape backslash e '' raddoppiato.
 */

export function extractColumns(sql, table) {
  const re = new RegExp('CREATE TABLE `' + table + '` \\(([\\s\\S]*?)\\n\\)', 'm');
  const m = sql.match(re);
  if (!m) throw new Error(`CREATE TABLE \`${table}\` non trovato nel dump`);
  const cols = [];
  for (const line of m[1].split('\n')) {
    const cm = line.match(/^\s*`([^`]+)`/);
    if (cm) cols.push(cm[1]);
  }
  return cols;
}

export function* extractRows(sql, table) {
  const marker = 'INSERT INTO `' + table + '` VALUES ';
  let idx = 0;
  while ((idx = sql.indexOf(marker, idx)) !== -1) {
    idx += marker.length;
    idx = yield* parseTuples(sql, idx);
  }
}

/** Parsa (v1,v2,...),(...),...; a partire da start. Ritorna l'indice dopo il ';'. */
function* parseTuples(sql, start) {
  let i = start;
  const len = sql.length;
  while (i < len) {
    while (i < len && (sql[i] === ',' || sql[i] === ' ' || sql[i] === '\n')) i++;
    if (sql[i] === ';') return i + 1;
    if (sql[i] !== '(') throw new Error(`Atteso '(' a offset ${i}, trovato '${sql[i]}'`);
    i++;
    const row = [];
    let cur = '';
    let inStr = false;
    let wasQuoted = false;
    let done = false;
    const push = () => {
      row.push(wasQuoted ? cur : cur.trim() === 'NULL' ? null : cur.trim());
      cur = '';
      wasQuoted = false;
    };
    while (i < len && !done) {
      const c = sql[i];
      if (inStr) {
        if (c === '\\') {
          const n = sql[i + 1];
          cur += n === 'n' ? '\n' : n === 'r' ? '\r' : n === 't' ? '\t' : n === '0' ? '\0' : n;
          i += 2;
        } else if (c === "'") {
          if (sql[i + 1] === "'") {
            cur += "'";
            i += 2;
          } else {
            inStr = false;
            i++;
          }
        } else {
          cur += c;
          i++;
        }
      } else if (c === "'") {
        inStr = true;
        wasQuoted = true;
        i++;
      } else if (c === ',') {
        push();
        i++;
      } else if (c === ')') {
        push();
        done = true;
        i++;
      } else {
        cur += c;
        i++;
      }
    }
    yield row;
  }
  return i;
}
