// Fetch di robots.txt + matcher. NON usato per saltare URL: serve solo a
// registrare se un URL SAREBBE bloccato (per scoprire blocchi accidentali).
import robotsParser from 'robots-parser';
import { logger } from '../util/logger.js';

/**
 * Scarica robots.txt dalla root dell'host e costruisce un matcher.
 * @param {string} origin es. "https://www.example.com"
 * @param {object} opts { ua, timeoutMs }
 * @returns {Promise<{ raw:string|null, isBlocked:(url:string)=>boolean }>}
 */
export async function loadRobots(origin, opts = {}) {
  const { ua, timeoutMs = 15000 } = opts;
  const robotsUrl = new URL('/robots.txt', origin).toString();
  let raw = null;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(robotsUrl, {
      headers: { 'user-agent': ua || 'audit-seo-tecnico' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      raw = await res.text();
      logger.ok(`robots.txt scaricato (${raw.length} byte)`);
    } else {
      logger.info(`robots.txt non disponibile (HTTP ${res.status})`);
    }
  } catch (err) {
    logger.warn(`robots.txt non scaricato: ${err.message}`);
  }

  const robots = raw ? robotsParser(robotsUrl, raw) : null;

  // Direttive Sitemap: dichiarate nel robots.txt (usate per la discovery).
  let sitemaps = [];
  try { sitemaps = robots?.getSitemaps?.() || []; } catch { sitemaps = []; }

  return {
    raw,
    sitemaps,
    isBlocked(url) {
      if (!robots) return false;
      // robots-parser: isDisallowed(url, ua) -> true se bloccato per quell'UA.
      return robots.isDisallowed(url, ua || '*') === true;
    },
  };
}
