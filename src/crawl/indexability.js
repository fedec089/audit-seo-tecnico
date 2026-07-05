// Verdetto di indicizzabilita': combina status + meta robots + X-Robots-Tag + canonical.
// Nota: e' un verdetto "a livello pagina"; l'audit (Fase 2) incrocia poi le incoerenze
// (es. noindex linkato internamente, canonical verso non-200, ecc.).

/**
 * @param {object} p
 * @param {number|null} p.statusCode
 * @param {string|null} p.metaRobots
 * @param {string|null} p.xRobotsTag
 * @param {string|null} p.canonical  URL canonical normalizzato
 * @param {string} p.url URL della pagina (normalizzato)
 * @returns {{ indexable: 0|1, reason: string }}
 */
export function computeIndexability({ statusCode, metaRobots, xRobotsTag, canonical, url }) {
  const directives = `${metaRobots || ''} ${xRobotsTag || ''}`.toLowerCase();

  if (statusCode == null) {
    return { indexable: 0, reason: 'nessuna risposta' };
  }
  if (statusCode >= 400) {
    return { indexable: 0, reason: `status ${statusCode}` };
  }
  if (statusCode >= 300) {
    return { indexable: 0, reason: `redirect ${statusCode}` };
  }
  if (/\bnoindex\b/.test(directives)) {
    return { indexable: 0, reason: 'noindex (meta/x-robots)' };
  }
  if (/\bnone\b/.test(directives)) {
    // "none" = noindex, nofollow
    return { indexable: 0, reason: 'robots: none' };
  }
  if (canonical && canonical !== url) {
    return { indexable: 0, reason: 'canonicalizzata verso altro URL' };
  }
  return { indexable: 1, reason: '200 indicizzabile' };
}
