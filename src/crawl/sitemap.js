// Fetch + parsing ricorsivo della sitemap (gestisce i sitemap index annidati).
import { XMLParser } from 'fast-xml-parser';
import { logger } from '../util/logger.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

/**
 * Risolve ricorsivamente una o piu' sitemap (o sitemap index) e raccoglie gli URL.
 * @param {string|string[]} sitemapUrls una o piu' sitemap di partenza
 * @param {object} opts { ua, maxSitemaps, timeoutMs }
 * @returns {Promise<string[]>} lista di URL (deduplicata)
 */
export async function collectSitemapUrls(sitemapUrls, opts = {}) {
  const { ua, maxSitemaps = 200, timeoutMs = 30000 } = opts;
  const seenSitemaps = new Set();
  const urls = new Set();
  const queue = (Array.isArray(sitemapUrls) ? sitemapUrls : [sitemapUrls]).filter(Boolean);

  while (queue.length && seenSitemaps.size < maxSitemaps) {
    const current = queue.shift();
    if (seenSitemaps.has(current)) continue;
    seenSitemaps.add(current);

    let xml;
    try {
      xml = await fetchText(current, ua, timeoutMs);
    } catch (err) {
      logger.warn(`Sitemap non scaricata: ${current} (${err.message})`);
      continue;
    }

    let doc;
    try {
      doc = parser.parse(xml);
    } catch (err) {
      logger.warn(`Sitemap non parsabile: ${current} (${err.message})`);
      continue;
    }

    // Sitemap index -> altre sitemap
    if (doc.sitemapindex?.sitemap) {
      for (const entry of toArray(doc.sitemapindex.sitemap)) {
        if (entry?.loc) queue.push(String(entry.loc).trim());
      }
      logger.info(`Sitemap index: ${current} -> ${toArray(doc.sitemapindex.sitemap).length} sub-sitemap`);
      continue;
    }

    // urlset -> URL effettivi
    if (doc.urlset?.url) {
      const entries = toArray(doc.urlset.url);
      for (const entry of entries) {
        if (entry?.loc) urls.add(String(entry.loc).trim());
      }
      logger.info(`Sitemap: ${current} -> ${entries.length} URL`);
      continue;
    }

    logger.warn(`Sitemap senza urlset/sitemapindex: ${current}`);
  }

  return [...urls];
}

function toArray(v) {
  return Array.isArray(v) ? v : [v];
}

// Limite prudenziale: una sitemap oltre 50 MB e' fuori standard (e rischia l'OOM).
const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;

async function fetchText(url, ua, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': ua || 'audit-seo-tecnico' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_SITEMAP_BYTES) {
      try { await res.body?.cancel(); } catch { /* best effort */ }
      throw new Error(`sitemap troppo grande (${declared} byte > ${MAX_SITEMAP_BYTES})`);
    }
    const text = await res.text();
    if (text.length > MAX_SITEMAP_BYTES) {
      throw new Error(`sitemap troppo grande (${text.length} byte > ${MAX_SITEMAP_BYTES})`);
    }
    return text;
  } finally {
    clearTimeout(t);
  }
}
