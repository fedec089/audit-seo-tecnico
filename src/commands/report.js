// Sub-comando `report` (Fase 4): aggrega tutto in audit-report.json.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildReport } from '../report/build.js';
import { resolveDbPath } from './audit.js';
import { logger } from '../util/logger.js';

export async function reportCommand(opts) {
  const dbPath = resolveDbPath(opts);
  const outPath = resolve(process.cwd(), opts.out || 'audit-report.json');

  const report = buildReport(dbPath, { generatedAt: new Date().toISOString() });
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  printSummary(report);
  logger.ok(`Report scritto in ${outPath}`);
  return report;
}

function printSummary(r) {
  const s = r.summary;
  logger.ok(`Pagine: ${s.totalPages} | Issue: ${s.issues.total} ` +
    `(error ${s.issues.bySeverity.error}, warning ${s.issues.bySeverity.warning}, notice ${s.issues.bySeverity.notice})`);
  logger.info(`Status: ${JSON.stringify(s.statusDistribution)}`);
  logger.info(`Sitemap vs crawl: solo-sitemap ${r.sitemapVsCrawl.counts.onlyInSitemap}, ` +
    `solo-link ${r.sitemapVsCrawl.counts.onlyInCrawl}, entrambi ${r.sitemapVsCrawl.counts.inBoth}`);
  if (s.performance.sampled) {
    logger.info(`Perf: ${s.performance.sampled} pagine, score medio ${s.performance.avgPerfScore}`);
  }
  for (const c of r.meta.caveats) logger.warn(c);
}
