// Sub-comando `audit` (Fase 2): carica i dati crawlati, esegue il motore di
// regole e salva le issue nel DB. Stampa un sommario.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDataset } from '../audit/dataset.js';
import { runAudit } from '../audit/engine.js';
import { CATEGORIES } from '../audit/rules/index.js';
import { logger } from '../util/logger.js';

/** Risolve il path del DB: --db esplicito oppure data/latest.db. */
export function resolveDbPath(opts, cwd = process.cwd()) {
  const p = opts.db ? resolve(cwd, opts.db) : resolve(cwd, 'data', 'latest.db');
  if (!existsSync(p)) {
    throw new Error(`DB non trovato: ${p}. Esegui prima 'seo-audit crawl <url>'.`);
  }
  return p;
}

export async function auditCommand(opts) {
  const dbPath = resolveDbPath(opts);
  logger.info(`Audit su ${dbPath}`);

  const onlyCategories = opts.only
    ? opts.only.split(',').map((s) => s.trim()).filter(Boolean)
    : null;
  if (onlyCategories) {
    const invalid = onlyCategories.filter((c) => !CATEGORIES.includes(c));
    if (invalid.length) {
      logger.warn(`Categorie sconosciute ignorate: ${invalid.join(', ')}`);
    }
  }

  const dataset = loadDataset(dbPath);
  logger.info(`Pagine in analisi: ${dataset.pages.length}`);
  if (dataset.meta.cappedByMaxUrls === 'true') {
    logger.warn(`Crawl limitato da --max-urls: ${dataset.meta.uncrawledInScope} URL in scope non crawlati. ` +
      'orphan-pages e i check sui target dei link possono essere parziali.');
  }

  const summary = await runAudit(dataset, dbPath, {
    checkExternal: !!opts.checkExternal,
    maxExternal: opts.maxExternal,
    onlyCategories,
  });

  printSummary(summary);
  logger.ok('Audit completato. Issue salvate nel DB (tabella issues).');
  return summary;
}

function printSummary(s) {
  logger.ok(`Issue totali: ${s.total}`);
  console.log('\n  Per severita:');
  for (const sev of ['error', 'warning', 'notice']) {
    console.log(`    ${sev.padEnd(8)} ${s.bySeverity[sev] || 0}`);
  }
  console.log('\n  Per categoria:');
  for (const [cat, n] of Object.entries(s.byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(16)} ${n}`);
  }
  console.log('');
}
