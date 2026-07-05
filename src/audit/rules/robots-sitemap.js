// Regole: robots.txt vs sitemap.

function declaredSitemaps(robotsRaw) {
  return (robotsRaw || '')
    .split(/\r?\n/)
    .filter((l) => /^\s*sitemap\s*:/i.test(l))
    .map((l) => l.replace(/^\s*sitemap\s*:\s*/i, '').trim())
    .filter(Boolean);
}

export const robotsSitemapRules = [
  {
    id: 'sitemap-missing',
    category: 'sitemap',
    severity: 'warning',
    message: 'Nessuna sitemap XML valida trovata',
    run(ds) {
      // Scatta solo se la discovery non ha raccolto nessun URL da nessuna sitemap.
      if (Number(ds.meta.sitemapUrlCount || 0) > 0) return [];
      const declared = declaredSitemaps(ds.meta.robotsRaw);
      const note = declared.length
        ? 'La sitemap dichiarata in robots.txt non e raggiungibile (404 o redirect verso 404) e nessun percorso canonico esiste.'
        : 'Nessuna sitemap: robots.txt non la dichiara e i percorsi canonici (sitemap_index.xml / sitemap.xml / wp-sitemap.xml) non esistono.';
      return [{ url: ds.meta.startUrl || null, detail: { robotsDeclares: declared, note } }];
    },
  },
  {
    id: 'sitemap-not-in-robots',
    category: 'sitemap',
    severity: 'warning',
    message: 'Sitemap non dichiarata in robots.txt (direttiva Sitemap: assente)',
    run(ds) {
      const raw = ds.meta.robotsRaw;
      // Se robots.txt non esiste, e' un altro problema (non questo).
      if (!raw || !raw.trim()) return [];
      // Se non esiste alcuna sitemap, scatta gia' sitemap-missing: evita il doppione.
      if (Number(ds.meta.sitemapUrlCount || 0) === 0) return [];
      const hasSitemap = /^\s*sitemap\s*:/im.test(raw);
      if (hasSitemap) return [];
      let robotsUrl = 'robots.txt';
      try { robotsUrl = new URL('/robots.txt', ds.meta.startUrl).toString(); } catch { /* ignora */ }
      return [{ url: robotsUrl, detail: { sitemapUrl: ds.meta.sitemapUrl } }];
    },
  },
];
