// Motore di regole: esegue ogni regola sul dataset, raccoglie le issue,
// le persiste nella tabella `issues` e ritorna un sommario.
import { openDb } from '../db/index.js';
import { ALL_RULES } from './rules/index.js';
import { logger } from '../util/logger.js';

/**
 * @param {object} dataset prodotto da loadDataset()
 * @param {string} dbPath  DB su cui scrivere le issue
 * @param {object} opts    { checkExternal, onlyCategories }
 */
export async function runAudit(dataset, dbPath, opts = {}) {
  const issues = [];

  for (const rule of ALL_RULES) {
    if (opts.onlyCategories && !opts.onlyCategories.includes(rule.category)) continue;
    let occurrences = [];
    try {
      occurrences = await rule.run(dataset, opts) || [];
    } catch (err) {
      logger.warn(`Regola ${rule.id} fallita: ${err.message}`);
      continue;
    }
    for (const occ of occurrences) {
      issues.push({
        rule_id: rule.id,
        category: rule.category,
        // la severita' puo' essere sovrascritta per singola occorrenza
        severity: occ.severity || rule.severity,
        message: occ.message || rule.message,
        url: occ.url ?? null,
        detail: occ.detail != null ? JSON.stringify(occ.detail) : null,
      });
    }
    if (occurrences.length) {
      logger.info(`${rule.id}: ${occurrences.length} occorrenze`);
    }
  }

  // Persistenza (sostituisce le issue precedenti per questo DB).
  const db = openDb(dbPath);
  const insert = db.prepare(`INSERT INTO issues (rule_id, category, severity, message, url, detail)
                             VALUES (@rule_id, @category, @severity, @message, @url, @detail)`);
  const tx = db.transaction((rows) => {
    db.prepare('DELETE FROM issues').run();
    for (const r of rows) insert.run(r);
  });
  tx(issues);
  db.close();

  return summarize(issues);
}

function summarize(issues) {
  const bySeverity = { error: 0, warning: 0, notice: 0 };
  const byCategory = {};
  const byRule = {};
  for (const i of issues) {
    bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    byRule[i.rule_id] = (byRule[i.rule_id] || 0) + 1;
  }
  return { total: issues.length, bySeverity, byCategory, byRule };
}
