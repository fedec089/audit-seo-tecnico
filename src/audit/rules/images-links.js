// Regole: immagini & link (alt mancante, link interni/esterni rotti).
import { logger } from '../../util/logger.js';

export const imagesLinksRules = [
  {
    id: 'img-missing-alt',
    category: 'images',
    severity: 'warning',
    message: 'Immagini senza attributo alt',
    run(ds) {
      const out = [];
      for (const p of ds.pages) {
        if (p.status_code !== 200) continue;
        const imgs = ds.imagesByUrl.get(p.url) || [];
        // alt === null => attributo assente (alt="" e' valido per immagini decorative).
        const missing = imgs.filter((im) => im.alt === null);
        if (missing.length) {
          out.push({
            url: p.url,
            message: `${missing.length} immagini senza alt`,
            detail: { count: missing.length, sample: missing.slice(0, 5).map((im) => im.src) },
          });
        }
      }
      return out;
    },
  },
  {
    id: 'broken-internal-link',
    category: 'links',
    severity: 'error',
    message: 'Link interno rotto (punta a una pagina 4xx/5xx)',
    run(ds) {
      const out = [];
      const seen = new Set();
      for (const l of ds.linksAll) {
        if (!l.is_internal || !l.href || !l.sourceUrl) continue;
        const target = ds.byUrl.get(l.href);
        if (target && target.status_code >= 400) {
          const key = `${l.sourceUrl} -> ${l.href}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            url: l.sourceUrl,
            message: `Link interno rotto verso ${l.href} (${target.status_code})`,
            detail: { target: l.href, status: target.status_code, anchor: l.anchor_text },
          });
        }
      }
      return out;
    },
  },
  {
    id: 'broken-external-link',
    category: 'links',
    severity: 'warning',
    message: 'Link esterno rotto',
    // Eseguito SOLO con --check-external (richiede richieste di rete aggiuntive).
    async run(ds, opts) {
      if (!opts.checkExternal) return [];
      const ua = ds.meta.userAgent || 'audit-seo-tecnico';
      // Raccoglie gli URL esterni unici e la prima pagina sorgente.
      const externals = new Map(); // href -> sourceUrl
      for (const l of ds.linksAll) {
        if (l.is_internal || !l.href) continue;
        if (!externals.has(l.href)) externals.set(l.href, l.sourceUrl);
      }
      const all = [...externals.entries()];
      const cap = opts.maxExternal || 500;
      const entries = all.slice(0, cap);
      if (all.length > entries.length) {
        // Mai troncare in silenzio: il report sembrerebbe "completo" senza esserlo.
        logger.warn(`broken-external-link: verificati ${entries.length}/${all.length} link esterni ` +
          `(alza --max-external per coprirli tutti)`);
      }
      const out = [];
      await mapLimit(entries, opts.externalConcurrency || 8, async ([href, source]) => {
        const status = await probe(href, ua, opts.timeoutMs || 15000);
        if (status === null || status >= 400) {
          out.push({
            url: source,
            message: `Link esterno rotto: ${href} (${status ?? 'no response'})`,
            detail: { href, status },
          });
        }
      });
      return out;
    },
  },
];

// Prova HEAD, poi GET in fallback. Ritorna lo status o null (errore di rete).
async function probe(url, ua, timeoutMs) {
  for (const method of ['HEAD', 'GET']) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'user-agent': ua },
        redirect: 'follow',
        signal: ctrl.signal,
      });
      clearTimeout(t);
      // Serve solo lo status: chiudi il body per liberare la connessione.
      try { await res.body?.cancel(); } catch { /* best effort */ }
      // Alcuni server rifiutano HEAD (405): riprova con GET.
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) continue;
      return res.status;
    } catch {
      clearTimeout(t);
      if (method === 'GET') return null;
    }
  }
  return null;
}

// Esegue fn su items con un limite di concorrenza.
async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}
