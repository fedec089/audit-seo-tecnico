// Sub-comando `perf` (Fase 3): seleziona un campione di pagine, gira Lighthouse
// in headless su ciascuna e (opzionale) recupera i dati di campo CrUX via PSI.
import { openDb } from '../db/index.js';
import { loadDataset } from '../audit/dataset.js';
import { selectSamples } from '../perf/sampler.js';
import { runLighthouse } from '../perf/lighthouse.js';
import { fetchPSI } from '../perf/psi.js';
import { resolveDbPath } from './audit.js';
import { logger } from '../util/logger.js';

export async function perfCommand(opts) {
  const dbPath = resolveDbPath(opts);
  const ds = loadDataset(dbPath);
  // API key PSI: flag CLI oppure (preferito, non finisce nella shell history) env var.
  const psiKey = opts.psiKey || process.env.PSI_API_KEY || null;

  // Campione: URL espliciti via --sample, altrimenti auto per template.
  let samples;
  if (opts.sample && opts.sample.length) {
    samples = opts.sample.map((url) => ({ url, template: 'manuale' }));
  } else {
    samples = selectSamples(ds, {
      maxSamples: opts.maxSamples ?? 6,
      startUrl: ds.meta.startUrl || null,
    });
  }

  if (!samples.length) {
    logger.warn('Nessuna pagina campionabile (servono pagine HTML 200 indicizzabili). Esegui prima il crawl.');
    return;
  }

  logger.info(`Campione (${samples.length} pagine, ${opts.desktop ? 'desktop' : 'mobile'}):`);
  for (const s of samples) logger.info(`  • [${s.template}] ${s.url}`);

  const measuredAt = new Date().toISOString();
  const results = [];

  for (const s of samples) {
    logger.info(`Lighthouse → ${s.url} ...`);
    const row = {
      url: s.url, template: s.template,
      lcp_ms: null, cls: null, inp_ms: null, tbt_ms: null, perf_score: null,
      crux_json: null, measured_at: measuredAt,
    };
    try {
      const lh = await runLighthouse(s.url, { desktop: !!opts.desktop });
      Object.assign(row, {
        lcp_ms: lh.lcp_ms, cls: lh.cls, tbt_ms: lh.tbt_ms, perf_score: lh.perf_score,
      });
      row._lab = lh.lab_extra;
      logger.ok(`  score ${row.perf_score} | LCP ${fmt(row.lcp_ms)}ms CLS ${round(row.cls, 3)} TBT ${fmt(row.tbt_ms)}ms`);
    } catch (err) {
      logger.error(`  Lighthouse fallito: ${err.message}`);
      row._error = err.message;
    }

    // PSI/CrUX opzionale.
    if (psiKey) {
      try {
        const { crux, inp_ms } = await fetchPSI(s.url, {
          key: psiKey,
          strategy: opts.desktop ? 'desktop' : 'mobile',
        });
        row.inp_ms = inp_ms;
        row._crux = crux;
        logger.ok(`  CrUX field: INP ${inp_ms ?? 'n/a'}ms`);
      } catch (err) {
        logger.warn(`  PSI fallito: ${err.message}`);
      }
    }

    // crux_json raccoglie sia gli extra lab sia il campo CrUX.
    row.crux_json = JSON.stringify({ lab: row._lab ?? null, crux: row._crux ?? null, error: row._error ?? null });
    delete row._lab; delete row._crux; delete row._error;
    results.push(row);
  }

  // Persistenza (sostituisce le misure precedenti).
  const db = openDb(dbPath);
  const ins = db.prepare(`INSERT INTO perf (url, template, lcp_ms, cls, inp_ms, tbt_ms, perf_score, crux_json, measured_at)
                          VALUES (@url, @template, @lcp_ms, @cls, @inp_ms, @tbt_ms, @perf_score, @crux_json, @measured_at)`);
  const tx = db.transaction((rows) => {
    db.prepare('DELETE FROM perf').run();
    for (const r of rows) ins.run(r);
  });
  tx(results);
  db.close();

  logger.ok(`Perf completata: ${results.length} pagine misurate. Salvate in tabella perf.`);
  return results;
}

function fmt(v) { return v == null ? 'n/a' : Math.round(v); }
function round(v, d) { return v == null ? 'n/a' : Number(v.toFixed(d)); }
