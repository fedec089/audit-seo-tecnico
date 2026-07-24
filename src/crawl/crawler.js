// Orchestrazione della Fase 1: sitemap + robots + crawl, scrittura su SQLite.
import { load as cheerioLoad } from 'cheerio';
import { openDb } from '../db/index.js';
import { createRepository } from '../db/repositories.js';
import { logger } from '../util/logger.js';
import { extractPage } from './extractors.js';
import { computeIndexability } from './indexability.js';
import { collectSitemapUrls } from './sitemap.js';
import { loadRobots } from './robots.js';
import {
  normalizeUrl, isSameSite, hostOf, stripWww, isExcluded, compilePatterns,
} from './url-utils.js';

// Estensioni di asset da non accodare come pagine (evita di crawlare binari).
const ASSET_RE = /\.(jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|json|pdf|zip|gz|rar|mp4|webm|mp3|wav|woff2?|ttf|eot|doc|docx|xls|xlsx|ppt|pptx)(\?|#|$)/i;

// Risolve l'host canonico EFFETTIVO seguendo l'eventuale redirect della start
// URL. Se la homepage reindirizza verso una variante www/non-www dello stesso
// dominio, quella destinazione e' la fonte di verita' piu' affidabile: un host
// canonico sbagliato (anche se dato esplicitamente via --host) scarterebbe in
// blocco i seed della sitemap dichiarati sulla variante corretta. Adotta il
// nuovo host SOLO se e' una variante www/non-www dello STESSO dominio: un
// redirect verso un host del tutto diverso non va mai seguito automaticamente.
async function resolveEffectiveHost(startUrl, canonicalHost, ua, timeoutMs) {
  for (const method of ['HEAD', 'GET']) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(startUrl, {
        method,
        headers: { 'user-agent': ua },
        redirect: 'follow',
        signal: ctrl.signal,
      });
      clearTimeout(t);
      try { await res.body?.cancel(); } catch { /* best effort */ }
      // Alcuni server rifiutano HEAD (405): riprova con GET.
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) continue;
      const finalHost = hostOf(res.url);
      if (finalHost && finalHost !== canonicalHost && stripWww(finalHost) === stripWww(canonicalHost)) {
        return res.url;
      }
      return null;
    } catch {
      clearTimeout(t);
      if (method === 'GET') return null;
      // altrimenti riprova con GET
    }
  }
  return null;
}

/**
 * Esegue il crawl completo e popola il database.
 * @param {object} config configurazione risolta
 * @param {object} opts { dbPath }
 */
export async function runCrawl(config, { dbPath }) {
  const startedAt = new Date().toISOString();
  await initCrawlee(); // carica le classi di Crawlee una volta sola
  const db = openDb(dbPath);
  const repo = createRepository(db);

  const startUrl = normalizeUrl(config.startUrl);
  if (!startUrl) throw new Error(`startUrl non valido: ${config.startUrl}`);
  let origin = new URL(startUrl).origin;
  let canonicalHost = config.canonicalHost || new URL(startUrl).hostname.toLowerCase();
  const excludeRes = compilePatterns(config.excludePatterns);
  const ua = config.userAgent;

  // Se la start URL reindirizza verso una variante www/non-www dello stesso
  // sito, quella e' l'host canonico vero: la adottiamo per l'intera sessione
  // (seed sitemap inclusi), altrimenti una sitemap dichiarata sulla variante
  // "giusta" ma diversa da --host verrebbe scartata in blocco.
  const resolvedUrl = await resolveEffectiveHost(startUrl, canonicalHost, ua, config.timeoutMs);
  if (resolvedUrl) {
    const resolved = new URL(resolvedUrl);
    logger.warn(`Host canonico corretto automaticamente: ${canonicalHost} -> ${resolved.hostname} ` +
      "(la start URL reindirizza a questa variante). Uso quest'ultimo per l'intera sessione.");
    canonicalHost = resolved.hostname.toLowerCase();
    origin = resolved.origin;
  }

  logger.info(`Host canonico: ${canonicalHost} | render=${config.render} | maxUrls=${config.maxUrls} maxDepth=${config.maxDepth}`);

  // 1) robots.txt (solo per registrare blocchi, non per saltare).
  const robots = await loadRobots(origin, { ua, timeoutMs: config.timeoutMs });

  // 2) Discovery sitemap (ricorsiva). Se --sitemap e' esplicita si usa solo quella;
  //    altrimenti si UNISCONO le direttive Sitemap: del robots.txt e i fallback
  //    canonici (una dichiarazione rotta nel robots non deve azzerare la discovery).
  let sitemapCandidates;
  if (config.sitemapUrl) {
    sitemapCandidates = [config.sitemapUrl];
    logger.info(`Sitemap (esplicita): ${config.sitemapUrl}`);
  } else {
    const canonical = [
      new URL('/sitemap_index.xml', origin).toString(),
      new URL('/sitemap.xml', origin).toString(),
      new URL('/wp-sitemap.xml', origin).toString(), // sitemap nativa WordPress
    ];
    sitemapCandidates = [...new Set([...robots.sitemaps, ...canonical])];
    logger.info(`Sitemap candidate: robots(${robots.sitemaps.length}) + fallback canonici`);
  }
  let sitemapUrls = [];
  try {
    sitemapUrls = await collectSitemapUrls(sitemapCandidates, { ua, timeoutMs: config.timeoutMs });
  } catch (err) {
    logger.warn(`Sitemap non elaborata: ${err.message}`);
  }
  const sitemapUrl = sitemapCandidates.join(', ');
  logger.ok(`URL dichiarati in sitemap: ${sitemapUrls.length}`);

  // 3) Mappa di provenienza (verita' sulla scoperta degli URL).
  //    Finalizzata a fine crawl in pages.discovered_via / source_url / depth.
  const discovery = new Map(); // url -> { viaSitemap, viaLink, source, depth }
  const mark = (url, patch) => {
    const cur = discovery.get(url) || { viaSitemap: false, viaLink: false, source: null, depth: null };
    if (patch.viaSitemap) cur.viaSitemap = true;
    if (patch.viaLink) cur.viaLink = true;
    if (patch.source && !cur.source) cur.source = patch.source;
    if (patch.depth != null && (cur.depth == null || patch.depth < cur.depth)) cur.depth = patch.depth;
    discovery.set(url, cur);
  };

  // Seed: homepage + URL della sitemap.
  mark(startUrl, { depth: 0 });
  const seedRequests = [{ url: startUrl, userData: { depth: 0 } }];
  for (const raw of sitemapUrls) {
    const u = normalizeUrl(raw);
    if (!u) continue;
    mark(u, { viaSitemap: true, depth: 0 });
    // Accoda al crawl solo gli URL in scope. isSameSite (non isInternal): una
    // sitemap dichiarata sulla variante www/non-www dell'host canonico non va
    // scartata in blocco solo per una differenza di www.
    if (isSameSite(u, canonicalHost, config.includeSubdomains)) {
      seedRequests.push({ url: u, userData: { depth: 0 } });
    }
  }

  // 4) Costruzione del crawler (Cheerio default, Playwright con --render).
  const sharedCtx = {
    canonicalHost,
    includeSubdomains: config.includeSubdomains,
    robots,
    discovery,
    mark,
    repo,
    excludeRes,
    config,
  };

  const crawler = config.render
    ? await buildPlaywrightCrawler(sharedCtx)
    : buildCheerioCrawler(sharedCtx, ua);

  // 5) Run.
  logger.info(`Avvio crawl con ${seedRequests.length} seed (homepage + sitemap)...`);
  await crawler.run(seedRequests);

  // 6) Finalizza la provenienza sulle pagine effettivamente presenti.
  finalizeProvenance(repo, discovery, startUrl);

  // 6b) Copertura del crawl: quanti URL scoperti NON sono stati crawlati
  //     (tipicamente per il cap --max-urls). Serve alla Fase 4 per sapere che
  //     orphan-pages e i check sui target dei link possono essere incompleti.
  const crawledUrls = repo.allUrls();
  let uncrawledInScope = 0;
  for (const [u, entry] of discovery.entries()) {
    if (crawledUrls.has(u)) continue;
    // Conta solo gli URL in scope (stesso criterio usato per accodare) e non-asset.
    if (!isSameSite(u, canonicalHost, config.includeSubdomains)) continue;
    if (ASSET_RE.test(u)) continue;
    if (entry.viaLink && isExcluded(u, excludeRes)) continue;
    uncrawledInScope++;
  }
  const cappedByMaxUrls = crawledUrls.size >= config.maxUrls;
  if (cappedByMaxUrls) {
    logger.warn(`Cap --max-urls (${config.maxUrls}) raggiunto: ${uncrawledInScope} URL scoperti in scope NON crawlati. ` +
      'I check su pagine orfane e target dei link possono essere parziali.');
  }

  // 7) Meta della run.
  const finishedAt = new Date().toISOString();
  repo.setMeta('startUrl', startUrl);
  repo.setMeta('canonicalHost', canonicalHost);
  repo.setMeta('sitemapUrl', sitemapUrl);
  repo.setMeta('sitemapUrlCount', String(sitemapUrls.length));
  repo.setMeta('userAgent', ua);
  repo.setMeta('render', String(config.render));
  repo.setMeta('includeSubdomains', String(config.includeSubdomains));
  repo.setMeta('maxUrls', String(config.maxUrls));
  repo.setMeta('maxDepth', String(config.maxDepth));
  repo.setMeta('concurrency', String(config.concurrency));
  repo.setMeta('excludePatterns', JSON.stringify(config.excludePatterns));
  repo.setMeta('thresholds', JSON.stringify(config.thresholds));
  repo.setMeta('robotsRaw', robots.raw || '');
  repo.setMeta('startedAt', startedAt);
  repo.setMeta('finishedAt', finishedAt);
  // Copertura del crawl (per la Fase 4).
  repo.setMeta('crawledCount', String(crawledUrls.size));
  repo.setMeta('discoveredCount', String(discovery.size));
  repo.setMeta('uncrawledInScope', String(uncrawledInScope));
  repo.setMeta('cappedByMaxUrls', String(cappedByMaxUrls));

  const total = repo.countPages();
  logger.ok(`Crawl completato: ${total} URL salvati in ${dbPath}`);
  db.close();
  return { total, dbPath };
}

// ---------------------------------------------------------------------------
// Logica di gestione di una risposta, condivisa tra Cheerio e Playwright.
// `html` puo' essere null (es. fetch fallita o risorsa non-HTML).
// ---------------------------------------------------------------------------
async function handleResponse(sharedCtx, {
  requestUrl, finalUrl, statusCode, headers, html, responseTimeMs,
  redirects, depth, enqueue,
}) {
  const { canonicalHost, includeSubdomains, robots, mark, repo, excludeRes, config } = sharedCtx;

  const url = normalizeUrl(requestUrl);
  if (!url) return;
  const robotsBlocked = robots.isBlocked(url);

  // L'URL ha risposto con un redirect: salva una riga "redirect-only" e
  // accoda la destinazione finale come pagina a se' stante.
  if (redirects && redirects.length > 0) {
    const firstStatus = redirects[0].status ?? statusCode ?? null;
    const { indexable, reason } = computeIndexability({
      statusCode: firstStatus, metaRobots: null, xRobotsTag: null, canonical: null, url,
    });
    repo.savePage({
      page: minimalPage(url, {
        status_code: firstStatus,
        response_time_ms: responseTimeMs ?? null,
        content_type: headerVal(headers, 'content-type'),
        x_robots_tag: headerVal(headers, 'x-robots-tag'),
        cache_control: headerVal(headers, 'cache-control'),
        robots_blocked: robotsBlocked ? 1 : 0,
        indexable, indexable_reason: reason,
      }),
      redirects: redirects.map((r) => ({ from: r.from, to: r.to, status: r.status })),
    });
    // Accoda la destinazione finale (sara' crawlata e salvata con il suo contenuto).
    // L'await e' essenziale: senza, Crawlee puo' concludere "coda vuota" e
    // chiudere il crawler prima che questa richiesta sia davvero scritta in coda.
    const finalNorm = normalizeUrl(finalUrl);
    if (finalNorm && finalNorm !== url) {
      const req = planEnqueue(finalNorm, url, depth, sharedCtx);
      if (req) await enqueue([req]);
    }
    return;
  }

  // Nessun HTML (risorsa non-HTML, binario o errore): salva solo lo status.
  if (html == null) {
    const sc = statusCode ?? null;
    const { indexable, reason } = computeIndexability({
      statusCode: sc, metaRobots: null, xRobotsTag: null, canonical: null, url,
    });
    repo.savePage({
      page: minimalPage(url, {
        status_code: sc,
        response_time_ms: responseTimeMs ?? null,
        content_type: headerVal(headers, 'content-type'),
        x_robots_tag: headerVal(headers, 'x-robots-tag'),
        cache_control: headerVal(headers, 'cache-control'),
        robots_blocked: robotsBlocked ? 1 : 0,
        indexable, indexable_reason: reason,
      }),
    });
    return;
  }

  // Pagina HTML 2xx: estrazione completa.
  const $ = cheerioLoad(html);
  const provenance = discoveryToProvenance(sharedCtx.discovery.get(url));
  const record = extractPage($, {
    url,
    statusCode: statusCode ?? null,
    responseTimeMs: responseTimeMs ?? null,
    headers,
    canonicalHost,
    includeSubdomains,
    robotsBlocked,
    redirects: [],
    depth,
    discoveredVia: provenance.discovered_via,
    sourceUrl: provenance.source_url,
    hasDoctype: /^\s*<!doctype/i.test(html),
    rawHtmlSize: Buffer.byteLength(html),
  });
  repo.savePage(record);

  // Accoda in un unico batch i link interni non esclusi entro maxDepth, e
  // ATTENDI che la scrittura in coda sia completata prima di considerare
  // questa richiesta conclusa: altrimenti Crawlee puo' chiudersi in anticipo
  // (coda apparentemente vuota) se questa era l'ultima richiesta "in volo",
  // perdendo tutte le pagine che si sarebbero dovute accodare da qui.
  const toEnqueue = [];
  for (const link of record.links) {
    if (!link.is_internal) continue;
    const req = planEnqueue(link.href, url, depth, sharedCtx);
    if (req) toEnqueue.push(req);
  }
  if (toEnqueue.length) await enqueue(toEnqueue);
}

// Decide se un href va accodato per il crawl (scope/depth/esclusioni) e
// registra SEMPRE la provenienza via link, anche se poi non lo accodiamo.
// Funzione pura (nessun I/O): ritorna la request da accodare, o null.
function planEnqueue(href, sourceUrl, depth, sharedCtx) {
  const { mark, excludeRes, config, canonicalHost, includeSubdomains } = sharedCtx;
  const nextDepth = (depth ?? 0) + 1;
  mark(href, { viaLink: true, source: sourceUrl, depth: nextDepth });
  // Guardia di scope: mai accodare domini esterni (le varianti www/non-www
  // dell'host canonico invece si', servono al check alternate-host).
  if (!isSameSite(href, canonicalHost, includeSubdomains)) return null;
  if (nextDepth > config.maxDepth) return null;
  if (ASSET_RE.test(href)) return null;
  if (isExcluded(href, excludeRes)) return null;
  return { url: href, userData: { depth: nextDepth } };
}

// ---------------------------------------------------------------------------
// Crawler Cheerio (default).
// ---------------------------------------------------------------------------
function buildCheerioCrawler(sharedCtx, ua) {
  // Import lazy per non caricare Playwright quando non serve.
  const { CheerioCrawler } = requireCrawlee();
  const { config } = sharedCtx;

  return new CheerioCrawler({
    maxConcurrency: config.concurrency,
    maxRequestsPerCrawl: config.maxUrls,
    maxRequestRetries: config.maxRetries,
    sameDomainDelaySecs: config.delayMs / 1000,
    requestHandlerTimeoutSecs: Math.ceil(config.timeoutMs / 1000) + 30,
    navigationTimeoutSecs: Math.ceil(config.timeoutMs / 1000),
    additionalMimeTypes: ['application/xhtml+xml'],
    preNavigationHooks: [
      (crawlingContext, gotOptions) => {
        // Non lanciare su 4xx/5xx: vogliamo registrare lo status, non fallire.
        gotOptions.throwHttpErrors = false;
        gotOptions.followRedirect = true;
        gotOptions.useHeaderGenerator = false;
        gotOptions.headers = { ...(gotOptions.headers || {}), 'user-agent': ua };
        // Cattura ogni hop di redirect.
        const redirects = [];
        crawlingContext.request.userData._redirects = redirects;
        gotOptions.hooks = {
          beforeRedirect: [
            (options, plainResponse) => {
              redirects.push({
                from: String(plainResponse.url || plainResponse.requestUrl || ''),
                to: String(options.url?.href || options.url || ''),
                status: plainResponse.statusCode,
              });
            },
          ],
        };
      },
    ],
    async requestHandler({ request, response, body, addRequests, log }) {
      const depth = request.userData.depth ?? 0;
      const redirects = request.userData._redirects || [];
      const headers = response?.headers || {};
      const statusCode = response?.statusCode ?? null;
      const responseTimeMs = response?.timings?.phases?.total ?? null;
      const contentType = String(headers['content-type'] || '');
      const isHtml = /text\/html|xml/i.test(contentType);
      const html = isHtml ? body?.toString?.() ?? String(body || '') : null;

      log.info(`${statusCode} (${responseTimeMs ?? '?'}ms) d${depth} ${request.url}`);

      await handleResponse(sharedCtx, {
        requestUrl: request.url,
        finalUrl: request.loadedUrl || request.url,
        statusCode,
        headers,
        html,
        responseTimeMs,
        redirects,
        depth,
        enqueue: (reqs) => addRequests(reqs),
      });
    },
    failedRequestHandler({ request, response, log }, error) {
      // Errori di rete o status non gestiti: registra cio' che sappiamo.
      const depth = request.userData.depth ?? 0;
      const statusCode = response?.statusCode ?? null;
      log.warning(`FAIL ${statusCode ?? '-'} ${request.url}: ${error?.message || ''}`);
      handleFailure(sharedCtx, request, response, error, depth);
    },
  });
}

// ---------------------------------------------------------------------------
// Crawler Playwright (--render): rendering JS prima dell'estrazione.
// ---------------------------------------------------------------------------
async function buildPlaywrightCrawler(sharedCtx) {
  const { PlaywrightCrawler } = requireCrawlee();
  const { config } = sharedCtx;
  const ua = config.userAgent;

  return new PlaywrightCrawler({
    maxConcurrency: config.concurrency,
    maxRequestsPerCrawl: config.maxUrls,
    maxRequestRetries: config.maxRetries,
    sameDomainDelaySecs: config.delayMs / 1000,
    requestHandlerTimeoutSecs: Math.ceil(config.timeoutMs / 1000) + 60,
    navigationTimeoutSecs: Math.ceil(config.timeoutMs / 1000),
    launchContext: { userAgent: ua },
    async requestHandler({ request, response, page, addRequests, log }) {
      const depth = request.userData.depth ?? 0;
      const status = response?.status?.() ?? null;
      const headers = response ? await safeHeaders(response) : {};
      const finalUrl = page.url();

      // Ricostruisce la catena di redirect dalla request di Playwright.
      const redirects = buildPwRedirects(response);

      const html = await page.content();
      log.info(`${status} d${depth} ${request.url}`);

      await handleResponse(sharedCtx, {
        requestUrl: request.url,
        finalUrl,
        statusCode: status,
        headers,
        html,
        responseTimeMs: null,
        redirects,
        depth,
        enqueue: (reqs) => addRequests(reqs),
      });
    },
    failedRequestHandler({ request, response, log }, error) {
      const depth = request.userData.depth ?? 0;
      log.warning(`FAIL ${request.url}: ${error?.message || ''}`);
      const status = response?.status?.() ?? null;
      handleFailure(sharedCtx, request, { statusCode: status, headers: {} }, error, depth);
    },
  });
}

function handleFailure(sharedCtx, request, response, error, depth) {
  const { robots, repo } = sharedCtx;
  const url = normalizeUrl(request.url);
  if (!url) return;
  const statusCode = response?.statusCode ?? null;
  const { indexable, reason } = computeIndexability({
    statusCode, metaRobots: null, xRobotsTag: null, canonical: null, url,
  });
  repo.savePage({
    page: minimalPage(url, {
      status_code: statusCode,
      error: error?.message ? String(error.message).slice(0, 500) : 'fetch fallita',
      robots_blocked: robots.isBlocked(url) ? 1 : 0,
      indexable, indexable_reason: reason,
    }),
  });
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

// Carica le classi di Crawlee (import dinamico per evitare overhead inutile).
let _crawlee = null;
function requireCrawlee() {
  if (!_crawlee) throw new Error('Crawlee non inizializzato');
  return _crawlee;
}
export async function initCrawlee() {
  if (!_crawlee) _crawlee = await import('crawlee');
  return _crawlee;
}

function minimalPage(url, overrides = {}) {
  return {
    url,
    status_code: null,
    response_time_ms: null,
    content_type: null,
    fetched_at: new Date().toISOString(),
    error: null,
    x_robots_tag: null,
    canonical_header: null,
    cache_control: null,
    title: null,
    meta_description: null,
    meta_robots: null,
    canonical: null,
    word_count: null,
    content_text: null,
    content_hash: null,
    og_json: null,
    twitter_json: null,
    html_lang: null,
    charset: null,
    has_doctype: null,
    viewport: null,
    html_size: null,
    text_size: null,
    depth: null,
    discovered_via: null,
    source_url: null,
    robots_blocked: 0,
    indexable: null,
    indexable_reason: null,
    ...overrides,
  };
}

function discoveryToProvenance(entry) {
  if (!entry) return { discovered_via: null, source_url: null };
  let via = null;
  if (entry.viaSitemap && entry.viaLink) via = 'both';
  else if (entry.viaSitemap) via = 'sitemap';
  else if (entry.viaLink) via = 'link';
  return { discovered_via: via, source_url: entry.source };
}

function finalizeProvenance(repo, discovery, startUrl) {
  for (const [url, entry] of discovery.entries()) {
    let { discovered_via } = discoveryToProvenance(entry);
    // La homepage e' il seed del crawl: se non e' ne' in sitemap ne' linkata,
    // classificala come 'link' (punto d'ingresso) per non lasciarla nulla.
    if (!discovered_via && url === startUrl) discovered_via = 'link';
    if (!discovered_via) continue;
    repo.updateProvenance({
      url,
      discovered_via,
      source_url: entry.source,
      depth: entry.depth,
    });
  }
}

function headerVal(headers, name) {
  const v = headers?.[name];
  if (v == null) return null;
  return Array.isArray(v) ? v.join(', ') : String(v);
}

async function safeHeaders(response) {
  try {
    return await response.allHeaders();
  } catch {
    return response.headers?.() || {};
  }
}

// Ricostruisce la catena di redirect da una response Playwright.
function buildPwRedirects(response) {
  const out = [];
  if (!response) return out;
  try {
    let req = response.request();
    const chain = [];
    let prev = req.redirectedFrom();
    while (prev) {
      chain.unshift(prev);
      prev = prev.redirectedFrom();
    }
    for (const r of chain) {
      const resp = r.response();
      out.push({
        from: r.url(),
        to: r.redirectedTo()?.url() || response.url(),
        status: resp ? resp.status() : null,
      });
    }
  } catch {
    /* best effort */
  }
  return out;
}
