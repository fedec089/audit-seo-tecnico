// Carica l'intero contenuto del DB in una struttura in-memory comoda per le regole.
// Le regole NON toccano SQL: interrogano questo dataset.
import { openDb } from '../db/index.js';
import { DEFAULT_THRESHOLDS } from '../util/constants.js';

/**
 * @param {string} dbPath
 * @returns {object} dataset
 */
export function loadDataset(dbPath) {
  const db = openDb(dbPath);

  const pages = db.prepare('SELECT * FROM pages').all();
  const redirects = db.prepare('SELECT * FROM redirects ORDER BY page_id, step').all();
  const headings = db.prepare('SELECT * FROM headings ORDER BY page_id, position').all();
  const links = db.prepare('SELECT * FROM links').all();
  const images = db.prepare('SELECT * FROM images').all();
  const hreflang = db.prepare('SELECT * FROM hreflang').all();
  const jsonld = db.prepare('SELECT * FROM jsonld').all();
  const resources = db.prepare('SELECT * FROM resources').all();
  const metaRows = db.prepare('SELECT key, value FROM run_meta').all();

  db.close();

  // Indici principali.
  const byUrl = new Map();
  const byId = new Map();
  for (const p of pages) {
    byUrl.set(p.url, p);
    byId.set(p.id, p);
  }

  const urlOf = (pageId) => byId.get(pageId)?.url ?? null;

  const group = (rows, mapFn) => {
    const m = new Map();
    for (const r of rows) {
      const url = urlOf(r.page_id);
      if (!url) continue;
      if (!m.has(url)) m.set(url, []);
      m.get(url).push(mapFn ? mapFn(r) : r);
    }
    return m;
  };

  const redirectsByUrl = group(redirects);
  const headingsByUrl = group(headings);
  const imagesByUrl = group(images);
  const hreflangByUrl = group(hreflang);
  const jsonldByUrl = group(jsonld);
  const resourcesByUrl = group(resources);

  // Link arricchiti con l'URL sorgente.
  const linksAll = links.map((l) => ({ ...l, sourceUrl: urlOf(l.page_id) }));

  // Link interni in ingresso: targetUrl -> Set(sourceUrl).
  const inboundInternal = new Map();
  for (const l of linksAll) {
    if (!l.is_internal || !l.href) continue;
    if (!inboundInternal.has(l.href)) inboundInternal.set(l.href, new Set());
    inboundInternal.get(l.href).add(l.sourceUrl);
  }

  // run_meta come oggetto.
  const meta = {};
  for (const r of metaRows) meta[r.key] = r.value;

  let thresholds = { ...DEFAULT_THRESHOLDS };
  try {
    if (meta.thresholds) thresholds = { ...thresholds, ...JSON.parse(meta.thresholds) };
  } catch { /* usa default */ }

  return {
    pages,
    byUrl,
    byId,
    redirectsByUrl,
    headingsByUrl,
    imagesByUrl,
    hreflangByUrl,
    jsonldByUrl,
    resourcesByUrl,
    linksAll,
    inboundInternal,
    meta,
    thresholds,
    canonicalHost: meta.canonicalHost || null,

    // --- helper riutilizzati dalle regole ---
    /** True se la pagina e' una vera pagina HTML 200 (esclude xml/rss/feed/sitemap). */
    isContentPage(p) {
      if (p.status_code !== 200 || p.content_text == null) return false;
      if (!/text\/html|xhtml/i.test(p.content_type || '')) return false;
      // Alcuni server etichettano male sitemap/feed come text/html: filtra per estensione.
      let path = '';
      try { path = new URL(p.url).pathname.toLowerCase(); } catch { /* ignora */ }
      if (/\.(xml|rss|atom|txt|json)$/.test(path)) return false;
      return true;
    },
    /** Pagine HTML con risposta 200 (candidate ai controlli on-page/contenuto). */
    htmlPages200() {
      return pages.filter((p) => p.status_code === 200 && /text\/html|xhtml/i.test(p.content_type || ''));
    },
    /** Una pagina e' "dichiarata in sitemap"? */
    inSitemap(p) {
      return p.discovered_via === 'sitemap' || p.discovered_via === 'both';
    },
    /** Una pagina e' stata raggiunta via link interno? */
    viaLink(p) {
      return p.discovered_via === 'link' || p.discovered_via === 'both';
    },
  };
}
