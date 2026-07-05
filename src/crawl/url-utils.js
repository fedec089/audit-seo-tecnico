// Utility per normalizzazione URL, scope (dominio/sottodomini) ed esclusioni.

/**
 * Normalizza un URL per dedup e confronto:
 * - risolve relativi rispetto a base
 * - scheme/host in minuscolo
 * - rimuove il fragment (#...)
 * - rimuove porte di default (80/443)
 * Non altera path/trailing slash ne' l'ordine dei query param (server-specific).
 * @returns {string|null} URL normalizzato oppure null se non valido/non http(s)
 */
export function normalizeUrl(href, base) {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  // Salta schemi non navigabili.
  if (/^(mailto:|tel:|javascript:|data:|#)/i.test(trimmed)) return null;
  let u;
  try {
    u = base ? new URL(trimmed, base) : new URL(trimmed);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  u.protocol = u.protocol.toLowerCase();
  if ((u.protocol === 'http:' && u.port === '80') ||
      (u.protocol === 'https:' && u.port === '443')) {
    u.port = '';
  }
  return u.toString();
}

/** Estrae l'hostname (lowercase) da un URL, o null. */
export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Restituisce il dominio registrabile "grezzo" (ultimi 2 label). */
export function registrableDomain(host) {
  if (!host) return null;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

/**
 * Decide se un URL e' "interno" rispetto all'host canonico.
 * @param {string} url
 * @param {string} canonicalHost es. "www.example.com"
 * @param {boolean} includeSubdomains
 */
export function isInternal(url, canonicalHost, includeSubdomains) {
  const host = hostOf(url);
  if (!host) return false;
  if (host === canonicalHost) return true;
  if (includeSubdomains) {
    return registrableDomain(host) === registrableDomain(canonicalHost);
  }
  return false;
}

/** Rimuove il prefisso www. da un hostname. */
export function stripWww(host) {
  return (host || '').replace(/^www\./i, '');
}

/**
 * Scope di CRAWL: interno (canonico/sottodomini) oppure variante www/non-www
 * dell'host canonico. Le varianti www vanno crawlate per rilevare le pagine
 * raggiungibili su host alternativo; i domini davvero esterni no.
 * @param {string} url
 * @param {string} canonicalHost
 * @param {boolean} includeSubdomains
 */
export function isSameSite(url, canonicalHost, includeSubdomains) {
  if (isInternal(url, canonicalHost, includeSubdomains)) return true;
  const host = hostOf(url);
  if (!host) return false;
  return stripWww(host) === stripWww(canonicalHost);
}

/**
 * Verifica se l'URL combacia con uno dei pattern di esclusione (regex su stringa URL).
 * @param {string} url
 * @param {RegExp[]} compiledPatterns
 */
export function isExcluded(url, compiledPatterns) {
  return compiledPatterns.some((re) => re.test(url));
}

/** Compila un array di stringhe regex in oggetti RegExp (case-insensitive). */
export function compilePatterns(patterns) {
  return (patterns || []).map((p) => new RegExp(p, 'i'));
}
