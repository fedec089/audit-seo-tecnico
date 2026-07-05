// Regole: internazionalizzazione (hreflang).

export const hreflangRules = [
  {
    id: 'hreflang-non-reciprocal',
    category: 'hreflang',
    severity: 'warning',
    message: 'hreflang non reciproco (A punta a B ma B non punta ad A)',
    run(ds) {
      const out = [];
      for (const [url, entries] of ds.hreflangByUrl.entries()) {
        for (const e of entries) {
          if (!e.href || e.href === url) continue;
          if ((e.hreflang || '').toLowerCase() === 'x-default') continue;
          const target = ds.byUrl.get(e.href);
          const targetEntries = ds.hreflangByUrl.get(e.href);
          // Verificabile solo se il target e' stato crawlato e dichiara hreflang.
          if (!target || !targetEntries) continue;
          const pointsBack = targetEntries.some((te) => te.href === url);
          if (!pointsBack) {
            out.push({ url, detail: { points_to: e.href, hreflang: e.hreflang } });
          }
        }
      }
      return out;
    },
  },
  {
    id: 'hreflang-target-non-200',
    category: 'hreflang',
    severity: 'warning',
    message: 'hreflang che punta a un URL non-200',
    run(ds) {
      const out = [];
      for (const [url, entries] of ds.hreflangByUrl.entries()) {
        for (const e of entries) {
          if (!e.href) continue;
          const target = ds.byUrl.get(e.href);
          if (target && target.status_code !== 200) {
            out.push({ url, detail: { href: e.href, hreflang: e.hreflang, status: target.status_code } });
          }
        }
      }
      return out;
    },
  },
  {
    id: 'hreflang-missing-xdefault',
    category: 'hreflang',
    severity: 'notice',
    message: 'Cluster hreflang senza x-default',
    run(ds) {
      const out = [];
      for (const [url, entries] of ds.hreflangByUrl.entries()) {
        if (entries.length === 0) continue;
        const hasXDefault = entries.some((e) => (e.hreflang || '').toLowerCase() === 'x-default');
        if (!hasXDefault) out.push({ url });
      }
      return out;
    },
  },
  {
    id: 'hreflang-canonical-conflict',
    category: 'hreflang',
    severity: 'warning',
    message: 'Conflitto hreflang/canonical (canonical non auto-referenziale con hreflang attivo)',
    run(ds) {
      const out = [];
      for (const [url, entries] of ds.hreflangByUrl.entries()) {
        if (entries.length === 0) continue;
        const p = ds.byUrl.get(url);
        if (p && p.canonical && p.canonical !== url) {
          out.push({ url, detail: { canonical: p.canonical } });
        }
      }
      return out;
    },
  },
];
