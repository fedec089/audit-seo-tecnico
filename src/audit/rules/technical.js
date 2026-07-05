// Regole: tecnico/sicurezza (mixed content, versioni host duplicate).
import { stripWww } from '../../crawl/url-utils.js';

export const technicalRules = [
  {
    id: 'mixed-content',
    category: 'technical',
    severity: 'error',
    message: 'Mixed content: risorse http su pagina https',
    run(ds) {
      const out = [];
      for (const p of ds.pages) {
        if (!p.url || !p.url.startsWith('https:')) continue;
        const res = ds.resourcesByUrl.get(p.url) || [];
        const http = res.filter((r) => r.scheme === 'http');
        if (http.length) {
          out.push({
            url: p.url,
            message: `${http.length} risorse http su pagina https`,
            detail: { count: http.length, sample: http.slice(0, 5).map((r) => `${r.kind}:${r.url}`) },
          });
        }
      }
      return out;
    },
  },
  {
    id: 'http-not-redirected',
    category: 'technical',
    severity: 'error',
    message: 'Pagina http che risponde 200 invece di redirigere a https',
    run(ds) {
      return ds.pages
        .filter((p) => p.url?.startsWith('http:') && p.status_code === 200)
        .map((p) => ({ url: p.url }));
    },
  },
  {
    id: 'alternate-host-reachable',
    category: 'technical',
    severity: 'warning',
    message: 'Pagina raggiungibile sulla variante www/non-www senza redirect',
    run(ds) {
      const canonical = ds.canonicalHost;
      if (!canonical) return [];
      const out = [];
      for (const p of ds.pages) {
        if (p.status_code !== 200) continue;
        let host = null;
        try { host = new URL(p.url).hostname.toLowerCase(); } catch { continue; }
        // Solo la variante www/non-www dell'host canonico: i sottodomini
        // legittimi (blog.example.it con --subdomains) non sono "alternativi".
        if (host !== canonical && stripWww(host) === stripWww(canonical)) {
          out.push({ url: p.url, detail: { host, canonicalHost: canonical } });
        }
      }
      return out;
    },
  },
];
