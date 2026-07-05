// Costruisce il report finale aggregando pages + issues + perf + run_meta.
// Output: oggetto JSON pulito, senza troncamenti, pensato per la sintesi LLM.
import { readFileSync } from 'node:fs';
import { openDb } from '../db/index.js';
import { ALL_RULES } from '../audit/rules/index.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

// Mappa ruleId -> definizione, per messaggi/categorie canoniche.
const RULE_BY_ID = new Map(ALL_RULES.map((r) => [r.id, r]));

export function buildReport(dbPath, { generatedAt }) {
  const db = openDb(dbPath);

  const pages = db.prepare('SELECT * FROM pages').all();
  const issues = db.prepare('SELECT rule_id, category, severity, message, url, detail FROM issues').all();
  const perf = db.prepare('SELECT * FROM perf').all();
  const jsonld = db.prepare(`SELECT j.schema_type, j.parse_ok, p.url
                             FROM jsonld j JOIN pages p ON p.id = j.page_id`).all();
  const metaRows = db.prepare('SELECT key, value FROM run_meta').all();
  db.close();

  const meta = {};
  for (const r of metaRows) meta[r.key] = r.value;

  return {
    meta: buildMeta(meta, generatedAt),
    summary: buildSummary(pages, issues, perf),
    issues: buildIssues(issues),
    sitemapVsCrawl: buildSitemapDiff(pages, meta),
    structuredData: buildStructuredData(pages, jsonld),
    performance: buildPerformance(perf),
  };
}

// True se la riga e' una vera pagina HTML 200 (esclude xml/feed/sitemap).
function isContentPageRow(p) {
  if (p.status_code !== 200 || p.content_text == null) return false;
  if (!/text\/html|xhtml/i.test(p.content_type || '')) return false;
  let path = '';
  try { path = new URL(p.url).pathname.toLowerCase(); } catch { return false; }
  if (/\.(xml|rss|atom|txt|json)$/.test(path)) return false;
  return true;
}

// Censimento dello structured data: cosa c'e' e su quante pagine (presenza/assenza
// dei tipi chiave). Non valida i campi: serve a far emergere copertura e lacune.
function buildStructuredData(pages, jsonld) {
  const contentPages = pages.filter(isContentPageRow);
  const contentUrls = new Set(contentPages.map((p) => p.url));

  // type -> Set(url) (solo pagine contenuto), e pagine con/ senza JSON-LD valido.
  const typeToPages = new Map();
  const pagesWithJsonLd = new Set();
  const invalidPages = new Set();

  for (const row of jsonld) {
    if (!contentUrls.has(row.url)) continue;
    if (row.parse_ok === 0) { invalidPages.add(row.url); continue; }
    pagesWithJsonLd.add(row.url);
    for (const t of String(row.schema_type || '').split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!typeToPages.has(t)) typeToPages.set(t, new Set());
      typeToPages.get(t).add(row.url);
    }
  }

  const typeCoverage = [...typeToPages.entries()]
    .map(([type, urls]) => ({ type, pages: urls.size, samplePages: [...urls].slice(0, 3) }))
    .sort((a, b) => b.pages - a.pages);

  const pagesWithoutJsonLd = contentPages
    .filter((p) => !pagesWithJsonLd.has(p.url))
    .map((p) => p.url);

  return {
    contentPagesAnalyzed: contentPages.length,
    pagesWithJsonLd: pagesWithJsonLd.size,
    pagesWithoutJsonLd: { count: pagesWithoutJsonLd.length, urls: pagesWithoutJsonLd },
    pagesWithInvalidJsonLd: { count: invalidPages.size, urls: [...invalidPages] },
    typeCoverage,
  };
}

// ---- sezioni ----

function buildMeta(meta, generatedAt) {
  return {
    tool: pkg.name,
    version: pkg.version,
    generatedAt,
    site: {
      startUrl: meta.startUrl || null,
      canonicalHost: meta.canonicalHost || null,
      sitemapUrl: meta.sitemapUrl || null,
      userAgent: meta.userAgent || null,
      render: meta.render === 'true',
    },
    crawl: {
      startedAt: meta.startedAt || null,
      finishedAt: meta.finishedAt || null,
      crawledCount: toInt(meta.crawledCount),
      discoveredCount: toInt(meta.discoveredCount),
      uncrawledInScope: toInt(meta.uncrawledInScope),
      cappedByMaxUrls: meta.cappedByMaxUrls === 'true',
      sitemapUrlCount: toInt(meta.sitemapUrlCount),
      maxUrls: toInt(meta.maxUrls),
      maxDepth: toInt(meta.maxDepth),
      concurrency: toInt(meta.concurrency),
    },
    thresholds: safeJson(meta.thresholds, {}),
    // Avvisi di affidabilita' del report (es. copertura parziale).
    caveats: buildCaveats(meta),
  };
}

function buildCaveats(meta) {
  const caveats = [];
  if (meta.cappedByMaxUrls === 'true') {
    caveats.push(`Crawl limitato dal cap --max-urls (${meta.maxUrls}): ${meta.uncrawledInScope} URL in scope non sono stati crawlati. ` +
      'I risultati di "pagine orfane" e dei controlli sui target dei link (rotti/redirect) possono essere incompleti.');
  }
  if (!meta.robotsRaw) {
    caveats.push('robots.txt non disponibile durante il crawl.');
  }
  if (toInt(meta.sitemapUrlCount) === 0) {
    caveats.push('Nessun URL raccolto dalla sitemap (sitemap assente o non valida): il confronto sitemap<->crawl non e affidabile.');
  }
  return caveats;
}

function buildSummary(pages, issues, perf) {
  const statusDistribution = {};
  let indexable = 0;
  let nonIndexable = 0;
  for (const p of pages) {
    const key = p.status_code == null ? 'error' : String(p.status_code);
    statusDistribution[key] = (statusDistribution[key] || 0) + 1;
    if (p.indexable === 1) indexable++;
    else nonIndexable++;
  }

  const bySeverity = { error: 0, warning: 0, notice: 0 };
  const byCategory = {};
  const byRuleMap = new Map();
  for (const i of issues) {
    bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    byRuleMap.set(i.rule_id, (byRuleMap.get(i.rule_id) || 0) + 1);
  }
  const byRule = [...byRuleMap.entries()]
    .map(([ruleId, count]) => ({
      ruleId,
      count,
      category: RULE_BY_ID.get(ruleId)?.category ?? null,
      severity: RULE_BY_ID.get(ruleId)?.severity ?? null,
      message: RULE_BY_ID.get(ruleId)?.message ?? null,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalPages: pages.length,
    statusDistribution,
    indexability: { indexable, nonIndexable },
    issues: {
      total: issues.length,
      bySeverity,
      byCategory,
      byRule,
    },
    performance: buildPerfSummary(perf),
  };
}

function buildPerfSummary(perf) {
  if (!perf.length) return { sampled: 0 };
  const scores = perf.map((p) => p.perf_score).filter((v) => v != null);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  return {
    sampled: perf.length,
    avgPerfScore: avg,
    worstLcpMs: maxOf(perf.map((p) => p.lcp_ms)),
    worstCls: maxOf(perf.map((p) => p.cls)),
    worstTbtMs: maxOf(perf.map((p) => p.tbt_ms)),
  };
}

// Issue raggruppate per categoria -> regola, con tutte le occorrenze (no troncamenti).
function buildIssues(issues) {
  const byCategory = {};
  // raggruppa per categoria poi per ruleId
  const cats = new Map();
  for (const i of issues) {
    if (!cats.has(i.category)) cats.set(i.category, new Map());
    const rules = cats.get(i.category);
    if (!rules.has(i.rule_id)) rules.set(i.rule_id, []);
    rules.get(i.rule_id).push(i);
  }

  for (const [category, rules] of cats.entries()) {
    const ruleGroups = [];
    for (const [ruleId, rows] of rules.entries()) {
      const groupSeverity = modalSeverity(rows);
      ruleGroups.push({
        ruleId,
        severity: groupSeverity,
        message: RULE_BY_ID.get(ruleId)?.message ?? rows[0]?.message ?? null,
        count: rows.length,
        occurrences: rows.map((r) => {
          const occ = { url: r.url, detail: safeJson(r.detail, null) };
          // severita' per-occorrenza solo se diversa da quella di gruppo.
          if (r.severity !== groupSeverity) occ.severity = r.severity;
          // messaggio specifico solo se diverso da quello canonico.
          if (r.message && r.message !== RULE_BY_ID.get(ruleId)?.message) occ.message = r.message;
          return occ;
        }),
      });
    }
    // ordina le regole per gravita' e poi per numero di occorrenze
    ruleGroups.sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || b.count - a.count);
    byCategory[category] = ruleGroups;
  }
  return byCategory;
}

// I tre insiemi del confronto sitemap <-> crawl.
function buildSitemapDiff(pages, meta) {
  const onlyInSitemap = [];   // in sitemap ma mai linkata internamente (orfane potenziali)
  const onlyInCrawl = [];     // linkata ma non in sitemap
  let inBoth = 0;

  for (const p of pages) {
    if (p.discovered_via === 'sitemap') {
      onlyInSitemap.push({ url: p.url, status: p.status_code, indexable: p.indexable === 1 });
    } else if (p.discovered_via === 'link') {
      onlyInCrawl.push({ url: p.url, status: p.status_code, indexable: p.indexable === 1 });
    } else if (p.discovered_via === 'both') {
      inBoth++;
    }
  }

  return {
    counts: {
      onlyInSitemap: onlyInSitemap.length,
      onlyInCrawl: onlyInCrawl.length,
      inBoth,
    },
    // Pagine orfane "vere": in sitemap, 200, indicizzabili, mai linkate.
    orphanCandidates: onlyInSitemap.filter((p) => p.status === 200 && p.indexable),
    // Indicizzabili 200 raggiunte da link ma non dichiarate in sitemap.
    linkedNotInSitemap: onlyInCrawl.filter((p) => p.status === 200 && p.indexable),
    onlyInSitemap,
    onlyInCrawl,
    note: meta.cappedByMaxUrls === 'true'
      ? 'Copertura parziale (--max-urls): alcune "orfane" potrebbero essere falsi positivi.'
      : null,
  };
}

function buildPerformance(perf) {
  return perf.map((p) => {
    const extra = safeJson(p.crux_json, {});
    return {
      url: p.url,
      template: p.template,
      measuredAt: p.measured_at,
      lab: {
        perfScore: p.perf_score,
        lcpMs: p.lcp_ms,
        cls: p.cls,
        tbtMs: p.tbt_ms,
        ...(extra.lab || {}),
      },
      field: { inpMs: p.inp_ms, crux: extra.crux || null },
      error: extra.error || null,
    };
  });
}

// ---- helper ----

function toInt(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
function safeJson(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } }
function maxOf(arr) { const v = arr.filter((x) => x != null); return v.length ? Math.max(...v) : null; }
function sevRank(s) { return s === 'error' ? 3 : s === 'warning' ? 2 : s === 'notice' ? 1 : 0; }
function modalSeverity(rows) {
  const c = {};
  for (const r of rows) c[r.severity] = (c[r.severity] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'notice';
}
