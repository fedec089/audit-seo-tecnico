// Sub-comando `crawl`: risolve la config, calcola il path del DB della run,
// lancia il crawler e aggiorna il symlink data/latest.db.
import { mkdirSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, basename, relative } from 'node:path';
import { resolveConfig } from '../config.js';
import { runCrawl } from '../crawl/crawler.js';
import { logger } from '../util/logger.js';

/**
 * @param {string} url URL di partenza (homepage)
 * @param {object} opts flag CLI gia' normalizzati
 */
export async function crawlCommand(url, opts) {
  const cwd = process.cwd();

  const cliOverrides = {
    startUrl: url,
    sitemapUrl: opts.sitemap,
    canonicalHost: opts.host,
    includeSubdomains: opts.subdomains,
    userAgent: opts.userAgent,
    useGooglebot: opts.googlebot,
    concurrency: opts.concurrency,
    delayMs: opts.delay,
    maxUrls: opts.maxUrls,
    maxDepth: opts.maxDepth,
    timeoutMs: opts.timeout,
    maxRetries: opts.retries,
    render: opts.render,
    excludePatterns: opts.exclude, // array o undefined
  };

  const config = await resolveConfig(cliOverrides, cwd);
  if (!config.startUrl) throw new Error('URL di partenza mancante.');
  if (config._configFile) logger.info(`Config caricata da ${config._configFile}`);

  // Path del DB: data/<host>-<timestamp>.db (oppure --db esplicito).
  const dataDir = resolve(cwd, 'data');
  mkdirSync(dataDir, { recursive: true });

  let dbPath;
  if (opts.db) {
    dbPath = resolve(cwd, opts.db);
  } else {
    const host = safeHostSlug(config.startUrl);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    dbPath = join(dataDir, `${host}-${stamp}.db`);
  }

  const result = await runCrawl(config, { dbPath });

  // Symlink di comodo: data/latest.db -> ultima run.
  updateLatestSymlink(dataDir, dbPath);

  logger.ok(`DB: ${dbPath}`);
  logger.ok(`Symlink aggiornato: ${join(dataDir, 'latest.db')} -> ${basename(dbPath)}`);
  return result;
}

function safeHostSlug(url) {
  try {
    return new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
  } catch {
    return 'site';
  }
}

function updateLatestSymlink(dataDir, dbPath) {
  const link = join(dataDir, 'latest.db');
  try {
    if (existsSync(link)) rmSync(link, { force: true });
    // Path relativo se il DB e' dentro data/, assoluto se l'utente ha usato
    // --db verso un percorso esterno (altrimenti il symlink sarebbe rotto).
    const rel = relative(dataDir, dbPath);
    symlinkSync(rel.startsWith('..') ? dbPath : rel, link);
  } catch (err) {
    logger.warn(`Impossibile aggiornare il symlink latest.db: ${err.message}`);
  }
}
