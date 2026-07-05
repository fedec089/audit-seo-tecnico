#!/usr/bin/env node
// Entrypoint CLI. Definisce i sub-comandi crawl/audit/perf/report.
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { crawlCommand } from '../src/commands/crawl.js';
import { auditCommand } from '../src/commands/audit.js';
import { perfCommand } from '../src/commands/perf.js';
import { reportCommand } from '../src/commands/report.js';
import { logger } from '../src/util/logger.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const program = new Command();

program
  .name('seo-audit')
  .description('Audit SEO tecnico on-site: crawl + regole + performance + report JSON')
  .version(pkg.version);

// --- helper di parsing per i flag numerici ---
const toInt = (v) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Valore numerico non valido: ${v}`);
  return n;
};
// Accumula i pattern --exclude ripetuti in un array.
const collect = (v, acc) => { acc.push(v); return acc; };

program
  .command('crawl')
  .description('Fase 1: crawla il sito (homepage + sitemap) e salva i dati in SQLite')
  .argument('<url>', 'URL di partenza (homepage)')
  .option('--host <host>', 'host canonico (es. www.example.com); default: host dello startUrl')
  .option('--sitemap <url>', 'URL della sitemap; default: <origin>/sitemap.xml')
  .option('--subdomains', 'includi i sottodomini nello scope', false)
  .option('--user-agent <ua>', 'User-Agent personalizzato')
  .option('--googlebot', 'usa lo User-Agent di Googlebot', false)
  .option('--render', 'usa PlaywrightCrawler (rendering JS) invece di Cheerio', false)
  .option('--concurrency <n>', 'richieste parallele', toInt)
  .option('--delay <ms>', 'delay minimo same-domain in ms', toInt)
  .option('--max-urls <n>', 'numero massimo di URL da crawlare', toInt)
  .option('--max-depth <n>', 'profondita massima dal seed', toInt)
  .option('--timeout <ms>', 'timeout di rete per richiesta in ms', toInt)
  .option('--retries <n>', 'numero di retry per richiesta', toInt)
  .option('--exclude <pattern>', 'pattern regex da escludere (ripetibile)', collect, [])
  .option('--db <path>', 'percorso del file DB (default: data/<host>-<timestamp>.db)')
  .action(async (url, opts) => {
    // commander usa il default [] per --exclude: se vuoto, lascia decidere alla config.
    if (Array.isArray(opts.exclude) && opts.exclude.length === 0) opts.exclude = undefined;
    await crawlCommand(url, opts);
  });

program
  .command('audit')
  .description('Fase 2: esegue il motore di regole sui dati crawlati')
  .option('--db <path>', 'percorso del DB della run (default: data/latest.db)')
  .option('--only <categories>', 'esegui solo alcune categorie (separate da virgola)')
  .option('--check-external', 'verifica anche i link esterni (richieste di rete extra)', false)
  .option('--max-external <n>', 'numero massimo di link esterni da verificare', toInt)
  .action(auditCommand);

program
  .command('perf')
  .description('Fase 3: Lighthouse su un campione di pagine')
  .option('--db <path>', 'percorso del DB della run (default: data/latest.db)')
  .option('--max-samples <n>', 'numero massimo di pagine campionate', toInt)
  .option('--sample <url>', 'URL specifico da misurare (ripetibile; bypassa il campionamento auto)', collect, [])
  .option('--desktop', 'misura in modalità desktop invece di mobile', false)
  .option('--psi-key <key>', 'API key PageSpeed Insights per i dati CrUX (preferibile: env PSI_API_KEY)')
  .action((opts) => {
    if (Array.isArray(opts.sample) && opts.sample.length === 0) opts.sample = undefined;
    return perfCommand(opts);
  });

program
  .command('report')
  .description('Fase 4: aggrega tutto in audit-report.json')
  .option('--db <path>', 'percorso del DB della run (default: data/latest.db)')
  .option('--out <path>', 'file di output', 'audit-report.json')
  .action(reportCommand);

program.parseAsync(process.argv).catch((err) => {
  logger.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
