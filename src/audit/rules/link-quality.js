// Regole: igiene dei link interni (redirect, nofollow, anchor vuoto).

// Status che indicano un redirect "permanente" vs "temporaneo".
const PERMANENT = new Set([301, 308]);
const TEMPORARY = new Set([302, 303, 307]);

export const linkQualityRules = [
  {
    id: 'internal-link-to-redirect',
    category: 'links',
    severity: 'notice',
    message: 'Link interno che punta a un URL che redirige',
    run(ds) {
      const out = [];
      const seen = new Set();
      for (const l of ds.linksAll) {
        if (!l.is_internal || !l.href || !l.sourceUrl) continue;
        const target = ds.byUrl.get(l.href);
        if (!target) continue;
        const sc = target.status_code;
        const isPermanent = PERMANENT.has(sc);
        const isTemporary = TEMPORARY.has(sc);
        if (!isPermanent && !isTemporary) continue;
        const key = `${l.sourceUrl} -> ${l.href}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Permanente -> notice (come Semrush "Permanent redirects"),
        // temporaneo -> warning ("Temporary redirects").
        const finalTo = (ds.redirectsByUrl.get(l.href) || []).slice(-1)[0]?.to_url || null;
        out.push({
          url: l.sourceUrl,
          severity: isTemporary ? 'warning' : 'notice',
          message: `Link interno verso un redirect ${sc}: ${l.href}`,
          detail: { target: l.href, status: sc, redirectsTo: finalTo },
        });
      }
      return out;
    },
  },
  {
    id: 'internal-link-nofollow',
    category: 'links',
    severity: 'warning',
    message: 'Link interno con attributo nofollow',
    run(ds) {
      const out = [];
      const seen = new Set();
      for (const l of ds.linksAll) {
        if (!l.is_internal || !l.href || !l.sourceUrl) continue;
        if (!/\bnofollow\b/i.test(l.rel || '')) continue;
        const key = `${l.sourceUrl} -> ${l.href}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ url: l.sourceUrl, detail: { target: l.href, rel: l.rel } });
      }
      return out;
    },
  },
  {
    id: 'link-empty-anchor',
    category: 'links',
    severity: 'notice',
    message: 'Link interno senza nome accessibile (no testo, no alt/aria-label)',
    run(ds) {
      const out = [];
      const seen = new Set();
      for (const l of ds.linksAll) {
        if (!l.is_internal || !l.href || !l.sourceUrl) continue;
        // anchor_text = accessible name (testo/alt/aria-label/title): se vuoto,
        // il link non ha davvero un nome per l'utente/Google.
        if (l.anchor_text && l.anchor_text.trim()) continue;
        const key = `${l.sourceUrl} -> ${l.href}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ url: l.sourceUrl, detail: { target: l.href } });
      }
      return out;
    },
  },
];
