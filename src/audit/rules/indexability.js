// Regole: indicizzabilita' (noindex, robots, canonical).

function isNoindex(p) {
  return /(\bnoindex\b|\bnone\b)/i.test(`${p.meta_robots || ''} ${p.x_robots_tag || ''}`);
}

export const indexabilityRules = [
  {
    id: 'noindex-in-sitemap',
    category: 'indexability',
    severity: 'warning',
    message: 'Pagina noindex presente nella sitemap',
    run(ds) {
      return ds.pages
        .filter((p) => ds.inSitemap(p) && isNoindex(p))
        .map((p) => ({ url: p.url, detail: { meta_robots: p.meta_robots, x_robots_tag: p.x_robots_tag } }));
    },
  },
  {
    id: 'noindex-linked-internally',
    category: 'indexability',
    severity: 'notice',
    message: 'Pagina noindex con link interni in ingresso',
    run(ds) {
      const out = [];
      for (const p of ds.pages) {
        if (!isNoindex(p)) continue;
        const inbound = ds.inboundInternal.get(p.url);
        if (inbound && inbound.size > 0) {
          out.push({ url: p.url, detail: { inboundCount: inbound.size, sample: [...inbound].slice(0, 5) } });
        }
      }
      return out;
    },
  },
  {
    id: 'robots-blocked-indexable',
    category: 'indexability',
    severity: 'error',
    message: 'Pagina indicizzabile ma bloccata da robots.txt',
    run(ds) {
      return ds.pages
        .filter((p) => p.robots_blocked === 1 && p.indexable === 1)
        .map((p) => ({ url: p.url }));
    },
  },
  {
    id: 'canonical-missing',
    category: 'indexability',
    severity: 'warning',
    message: 'Canonical assente su pagina indicizzabile',
    run(ds) {
      return ds.pages
        .filter((p) => ds.isContentPage(p) && p.indexable === 1 && !p.canonical)
        .map((p) => ({ url: p.url }));
    },
  },
  {
    id: 'canonical-to-non-200',
    category: 'indexability',
    severity: 'error',
    message: 'Canonical che punta a un URL non-200',
    run(ds) {
      const out = [];
      for (const p of ds.pages) {
        if (!p.canonical || p.canonical === p.url) continue;
        const target = ds.byUrl.get(p.canonical);
        if (target && target.status_code !== 200) {
          out.push({ url: p.url, detail: { canonical: p.canonical, targetStatus: target.status_code } });
        }
      }
      return out;
    },
  },
  {
    id: 'canonical-chain',
    category: 'indexability',
    severity: 'warning',
    message: 'Canonical concatenato (il target ha a sua volta un canonical diverso)',
    run(ds) {
      const out = [];
      for (const p of ds.pages) {
        if (!p.canonical || p.canonical === p.url) continue;
        const target = ds.byUrl.get(p.canonical);
        if (target && target.canonical && target.canonical !== target.url) {
          out.push({
            url: p.url,
            detail: { canonical: p.canonical, targetCanonical: target.canonical },
          });
        }
      }
      return out;
    },
  },
];
