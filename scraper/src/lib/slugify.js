export function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Chiave di join per nomi mob/item: case-insensitive, trim, spazi collassati. */
export function normalizeName(name) {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}
