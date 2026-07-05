// Regole: confronto sitemap <-> crawl e qualita' della sitemap.

function isNoindex(p) {
  return /(\bnoindex\b|\bnone\b)/i.test(`${p.meta_robots || ''} ${p.x_robots_tag || ''}`);
}

export const sitemapCrawlRules = [
  {
    id: 'sitemap-dirty',
    category: 'sitemap',
    severity: 'warning',
    message: 'URL in sitemap che non e 200 indicizzabile (404 / redirect / noindex)',
    run(ds) {
      const out = [];
      for (const p of ds.pages) {
        if (!ds.inSitemap(p)) continue;
        let reason = null;
        if (p.status_code >= 400) reason = `status ${p.status_code}`;
        else if (p.status_code >= 300) reason = `redirect ${p.status_code}`;
        else if (isNoindex(p)) reason = 'noindex';
        else if (p.canonical && p.canonical !== p.url) reason = 'canonicalizzata altrove';
        if (reason) out.push({ url: p.url, detail: { reason, status: p.status_code } });
      }
      return out;
    },
  },
  {
    id: 'orphan-pages',
    category: 'sitemap',
    severity: 'warning',
    message: 'Pagina in sitemap ma non raggiunta da link interni (potenziale orfana)',
    run(ds) {
      if (Number(ds.meta.sitemapUrlCount || 0) === 0) return []; // niente sitemap = confronto impossibile
      // Solo 'sitemap' (mai 'both'/'link') e indicizzabile 200.
      return ds.pages
        .filter((p) => p.discovered_via === 'sitemap' && p.status_code === 200 && p.indexable === 1)
        .map((p) => ({
          url: p.url,
          detail: { nota: 'verifica che non sia un falso positivo dovuto a --max-urls/--max-depth' },
        }));
    },
  },
  {
    id: 'linked-not-in-sitemap',
    category: 'sitemap',
    severity: 'notice',
    message: 'Pagina indicizzabile raggiunta da link ma non dichiarata in sitemap',
    run(ds) {
      // Se la sitemap non e' stata trovata, ogni pagina sembrerebbe "non in sitemap":
      // sarebbero notice fantasma -> salta il confronto.
      if (Number(ds.meta.sitemapUrlCount || 0) === 0) return [];
      return ds.pages
        .filter((p) => p.discovered_via === 'link' && p.status_code === 200 && p.indexable === 1)
        .map((p) => ({ url: p.url }));
    },
  },
];
