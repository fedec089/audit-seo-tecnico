// Estrazione dei dati on-page da un documento HTML.
// Funzione pura: input ($ Cheerio + meta della risposta) -> oggetto record.
// Nessun accesso a rete o DB qui, cosi' e' testabile in isolamento.
import { createHash } from 'node:crypto';
import { normalizeUrl, isInternal } from './url-utils.js';
import { computeIndexability } from './indexability.js';
import { CONTENT_TEXT_MAX } from '../util/constants.js';

/**
 * @param {import('cheerio').CheerioAPI} $
 * @param {object} ctx
 * @param {string}  ctx.url            URL finale (normalizzato)
 * @param {number}  ctx.statusCode
 * @param {number}  ctx.responseTimeMs
 * @param {object}  ctx.headers        headers di risposta (lowercased keys)
 * @param {string}  ctx.canonicalHost
 * @param {boolean} ctx.includeSubdomains
 * @param {boolean} ctx.robotsBlocked
 * @param {Array}   ctx.redirects      [{from,to,status}]
 * @returns {object} record pronto per il repository
 */
export function extractPage($, ctx) {
  const {
    url, statusCode, responseTimeMs, headers = {},
    canonicalHost, includeSubdomains, robotsBlocked, redirects = [],
  } = ctx;

  const title = textOrNull($('head > title').first().text());
  const metaDescription = attrOrNull($('meta[name="description"]').first(), 'content');
  const metaRobots = attrOrNull($('meta[name="robots"]').first(), 'content');

  // Canonical da <link rel=canonical> (risolto e normalizzato).
  const canonicalRaw = attrOrNull($('link[rel="canonical"]').first(), 'href');
  const canonical = canonicalRaw ? normalizeUrl(canonicalRaw, url) : null;

  // Headers rilevanti.
  const xRobotsTag = headerVal(headers, 'x-robots-tag');
  const canonicalHeader = parseLinkCanonical(headerVal(headers, 'link'), url);
  const cacheControl = headerVal(headers, 'cache-control');
  const contentType = headerVal(headers, 'content-type');

  // Heading H1..H6 in ordine di documento.
  const headings = [];
  $('h1, h2, h3, h4, h5, h6').each((i, el) => {
    const level = Number(el.tagName.slice(1));
    headings.push({ level, text: collapse($(el).text()), position: i });
  });

  // Link: interni/esterni con anchor e rel.
  const links = [];
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = normalizeUrl($el.attr('href'), url);
    if (!href) return;
    links.push({
      href,
      // Accessible name: testo visibile (heading annidati inclusi) oppure, se
      // vuoto, alt dell'immagine / aria-label / title. E' il nome che userebbe
      // Google: un link-immagine con alt NON e' "senza anchor text".
      anchor_text: accessibleName($, $el).slice(0, 300),
      rel: attrOrNull($el, 'rel'),
      is_internal: isInternal(href, canonicalHost, includeSubdomains),
    });
  });

  // Immagini: alt = null se l'attributo e' assente (diverso da alt="").
  const images = [];
  $('img').each((_, el) => {
    const $el = $(el);
    const src = normalizeUrl($el.attr('src') || $el.attr('data-src'), url);
    if (!src) return;
    images.push({
      src,
      alt: $el.attr('alt') === undefined ? null : $el.attr('alt'),
      loading: attrOrNull($el, 'loading'),
      width: intOrNull($el.attr('width')),
      height: intOrNull($el.attr('height')),
    });
  });

  // hreflang: tutte le coppie lingua -> URL.
  const hreflang = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const $el = $(el);
    const href = normalizeUrl($el.attr('href'), url);
    hreflang.push({ hreflang: ($el.attr('hreflang') || '').trim(), href });
  });

  // JSON-LD: salvati grezzi + flag parse + @type se estraibile.
  const jsonld = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    let parseOk = 1;
    let schemaType = null;
    try {
      const parsed = JSON.parse(raw);
      schemaType = extractSchemaType(parsed);
    } catch {
      parseOk = 0;
    }
    jsonld.push({ raw: raw.slice(0, 50000), parse_ok: parseOk, schema_type: schemaType });
  });

  // Risorse referenziate (per mixed content).
  const resources = [];
  collectResources($, url, resources);

  // Open Graph / Twitter card.
  const og = collectMetaMap($, 'property', 'og:');
  const twitter = collectMetaMap($, 'name', 'twitter:');

  // Testo visibile per thin/duplicati. fullText serve per text_size e word count
  // completi; content_text viene troncato solo per lo storage.
  const bodyClone = $('body').clone();
  bodyClone.find('script, style, noscript, template').remove();
  const fullText = collapse(bodyClone.text());
  const contentText = fullText.slice(0, CONTENT_TEXT_MAX);
  const wordCount = fullText ? fullText.split(/\s+/).filter(Boolean).length : 0;
  const contentHash = contentText
    ? createHash('sha1').update(contentText).digest('hex')
    : null;

  // Attributi HTML di base.
  const htmlLang = attrOrNull($('html').first(), 'lang');
  const charset = detectCharset($);
  const viewport = attrOrNull($('meta[name="viewport"]').first(), 'content');

  const { indexable, reason } = computeIndexability({
    statusCode, metaRobots, xRobotsTag, canonical, url,
  });

  return {
    page: {
      url,
      status_code: statusCode ?? null,
      response_time_ms: responseTimeMs ?? null,
      content_type: contentType,
      fetched_at: new Date().toISOString(),
      error: null,
      x_robots_tag: xRobotsTag,
      canonical_header: canonicalHeader,
      cache_control: cacheControl,
      title,
      meta_description: metaDescription,
      meta_robots: metaRobots,
      canonical,
      word_count: wordCount,
      content_text: contentText || null,
      content_hash: contentHash,
      og_json: Object.keys(og).length ? JSON.stringify(og) : null,
      twitter_json: Object.keys(twitter).length ? JSON.stringify(twitter) : null,
      html_lang: htmlLang,
      charset,
      has_doctype: ctx.hasDoctype ? 1 : 0,
      viewport,
      html_size: ctx.rawHtmlSize ?? null,
      text_size: fullText.length,
      depth: ctx.depth ?? null,
      discovered_via: ctx.discoveredVia ?? null,
      source_url: ctx.sourceUrl ?? null,
      robots_blocked: robotsBlocked ? 1 : 0,
      indexable,
      indexable_reason: reason,
    },
    redirects: redirects.map((r) => ({ from: r.from, to: r.to, status: r.status })),
    headings,
    links,
    images,
    hreflang,
    jsonld,
    resources,
  };
}

// ---- helper ----

function textOrNull(s) {
  const t = collapse(s);
  return t || null;
}
function attrOrNull($el, name) {
  if (!$el || $el.length === 0) return null;
  const v = $el.attr(name);
  return v == null ? null : (Array.isArray(v) ? v.join(' ') : String(v)).trim() || null;
}
function intOrNull(v) {
  if (v == null) return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
function collapse(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}
function headerVal(headers, name) {
  const v = headers[name];
  if (v == null) return null;
  return Array.isArray(v) ? v.join(', ') : String(v);
}

// Estrae il primo rel=canonical da un header Link.
function parseLinkCanonical(linkHeader, base) {
  if (!linkHeader) return null;
  const parts = linkHeader.split(',');
  for (const part of parts) {
    if (/rel\s*=\s*"?canonical"?/i.test(part)) {
      const m = part.match(/<([^>]+)>/);
      if (m) return normalizeUrl(m[1], base);
    }
  }
  return null;
}

// Estrae @type da una struttura JSON-LD (anche @graph o array).
function extractSchemaType(parsed) {
  const types = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node['@type']) {
      const t = node['@type'];
      (Array.isArray(t) ? t : [t]).forEach((x) => types.add(String(x)));
    }
    if (node['@graph']) visit(node['@graph']);
  };
  visit(parsed);
  return types.size ? [...types].join(', ') : null;
}

// Accessible name di un link: testo visibile (inclusi heading annidati) e, se
// vuoto, alt dell'immagine interna / aria-label / title.
function accessibleName($, $el) {
  const text = collapse($el.text());
  if (text) return text;
  const imgAlt = $el.find('img[alt]').first().attr('alt');
  if (imgAlt && imgAlt.trim()) return collapse(imgAlt);
  const aria = $el.attr('aria-label');
  if (aria && aria.trim()) return collapse(aria);
  const title = $el.attr('title');
  if (title && title.trim()) return collapse(title);
  return '';
}

// Rileva il charset dichiarato: <meta charset> o http-equiv Content-Type.
function detectCharset($) {
  const metaCharset = $('meta[charset]').first().attr('charset');
  if (metaCharset && metaCharset.trim()) return metaCharset.trim();
  const httpEquiv = $('meta[http-equiv="Content-Type"]').first().attr('content');
  if (httpEquiv) {
    const m = httpEquiv.match(/charset=([\w-]+)/i);
    if (m) return m[1];
  }
  return null;
}

function collectMetaMap($, attr, prefix) {
  const map = {};
  $(`meta[${attr}^="${prefix}"]`).each((_, el) => {
    const key = $(el).attr(attr);
    const content = $(el).attr('content');
    if (key && content != null) map[key] = content;
  });
  return map;
}

function collectResources($, base, out) {
  const push = (raw, kind) => {
    const u = normalizeUrl(raw, base);
    if (!u) return;
    out.push({ url: u, kind, scheme: u.startsWith('https:') ? 'https' : 'http' });
  };
  $('script[src]').each((_, el) => push($(el).attr('src'), 'script'));
  $('link[rel="stylesheet"][href]').each((_, el) => push($(el).attr('href'), 'style'));
  $('img[src]').each((_, el) => push($(el).attr('src'), 'img'));
  $('iframe[src]').each((_, el) => push($(el).attr('src'), 'iframe'));
  $('source[src]').each((_, el) => push($(el).attr('src'), 'source'));
  $('audio[src]').each((_, el) => push($(el).attr('src'), 'audio'));
  $('video[src]').each((_, el) => push($(el).attr('src'), 'video'));
}
