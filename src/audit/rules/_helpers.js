// Utility condivise dalle regole.

/** Normalizza una stringa per confronti di duplicati (lowercase, spazi collassati). */
export function normText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Raggruppa elementi per chiave; ritorna Map<chiave, elementi[]>. */
export function groupBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (k == null || k === '') continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return m;
}

/** Una pagina e' una pagina HTML con risposta 200? */
export function isHtml200(p) {
  return p.status_code === 200;
}

/** Lunghezza "visibile" di una stringa (trim). */
export function len(s) {
  return (s || '').trim().length;
}

// Paginazione (WP /page/N/, ?paged=N, ?page=N) e archivi (category/tag/author...).
const PAGINATION_RE = /\/page\/\d+\/?$|[?&]paged?=\d+/i;
const ARCHIVE_RE = /\/(category|categoria|categorie|tag|tags|author|autore|archivio|archive|argomento)\//i;

export function isPaginated(url) { return PAGINATION_RE.test(url || ''); }
export function isArchive(url) { return ARCHIVE_RE.test(url || ''); }
export function isArchiveOrPaginated(url) { return isPaginated(url) || isArchive(url); }

/**
 * Abbassa a "notice" le occorrenze su URL archivio/paginazione (pattern atteso),
 * marcandole con detail.archive, così le issue "vere" non annegano.
 */
export function downgradeArchives(occurrences) {
  return occurrences.map((o) => (
    isArchiveOrPaginated(o.url)
      ? { ...o, severity: 'notice', detail: { ...(o.detail || {}), archive: true } }
      : o
  ));
}
