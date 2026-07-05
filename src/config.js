// Caricamento e merge della configurazione: default <- file <- flag CLI.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_UA, GOOGLEBOT_UA, DEFAULT_EXCLUDE_PATTERNS, DEFAULT_THRESHOLDS,
} from './util/constants.js';

export const DEFAULT_CONFIG = {
  // Host canonico: la versione "vera" del sito (con/ senza www, http/https).
  // Se non specificato viene derivato dall'URL di partenza.
  canonicalHost: null,
  startUrl: null,
  sitemapUrl: null,        // se null: prova <origin>/sitemap.xml
  includeSubdomains: false,
  userAgent: DEFAULT_UA,
  useGooglebot: false,
  concurrency: 5,
  delayMs: 250,            // delay minimo same-domain
  maxUrls: 1000,
  maxDepth: 10,
  timeoutMs: 30000,
  maxRetries: 1,
  render: false,           // true = PlaywrightCrawler
  excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS],
  thresholds: { ...DEFAULT_THRESHOLDS },
};

/**
 * Carica la config dal file (audit.config.js o .json) se presente.
 * @param {string} cwd
 */
async function loadConfigFile(cwd) {
  const candidates = ['audit.config.js', 'audit.config.mjs', 'audit.config.json'];
  for (const name of candidates) {
    const p = resolve(cwd, name);
    if (!existsSync(p)) continue;
    if (name.endsWith('.json')) {
      const raw = await readFile(p, 'utf8');
      return { file: name, data: JSON.parse(raw) };
    }
    const mod = await import(pathToFileURL(p).href);
    return { file: name, data: mod.default ?? mod.config ?? {} };
  }
  return { file: null, data: {} };
}

/**
 * Risolve la configurazione effettiva combinando default, file e flag CLI.
 * @param {object} cliOverrides valori non-undefined dai flag CLI
 * @param {string} cwd
 */
export async function resolveConfig(cliOverrides = {}, cwd = process.cwd()) {
  const { file, data } = await loadConfigFile(cwd);

  // Merge poco profondo, con merge dedicato per thresholds.
  const merged = {
    ...DEFAULT_CONFIG,
    ...data,
    ...stripUndefined(cliOverrides),
    thresholds: {
      ...DEFAULT_CONFIG.thresholds,
      ...(data.thresholds || {}),
      ...(cliOverrides.thresholds || {}),
    },
    excludePatterns: cliOverrides.excludePatterns
      ?? data.excludePatterns
      ?? DEFAULT_CONFIG.excludePatterns,
  };

  // UA: se richiesto Googlebot ha precedenza sull'UA di default.
  if (merged.useGooglebot && !cliOverrides.userAgent && !data.userAgent) {
    merged.userAgent = GOOGLEBOT_UA;
  }

  // Deriva canonicalHost dallo startUrl se non fornito.
  if (!merged.canonicalHost && merged.startUrl) {
    try {
      merged.canonicalHost = new URL(merged.startUrl).hostname.toLowerCase();
    } catch { /* validato altrove */ }
  }

  merged._configFile = file;
  return merged;
}

function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
