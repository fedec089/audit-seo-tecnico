import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { extractPage } from '../src/crawl/extractors.js';

const HTML = `<!doctype html>
<html lang="it"><head>
<meta charset="utf-8">
<title> Il mio titolo </title>
<meta name="description" content="Descrizione di prova">
<meta name="robots" content="index, follow">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="/pagina/">
<link rel="alternate" hreflang="it-IT" href="/pagina/">
<link rel="alternate" hreflang="x-default" href="/">
<meta property="og:title" content="OG titolo">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>
<script type="application/ld+json">{questo non e json</script>
</head><body>
<h1>Titolo H1</h1>
<h3>Salto di gerarchia</h3>
<a href="/interno/">Link interno</a>
<a href="https://esterno.com/pagina">Esterno</a>
<a href="/logo/"><img src="/logo.png" alt="Logo alt"></a>
<a href="/senza-nome/"><img src="/x.png"></a>
<img src="/no-alt.jpg">
<img src="/alt-vuoto.jpg" alt="">
<script src="http://insecure.example/s.js"></script>
<p>testo di prova con un po' di parole dentro il body</p>
</body></html>`;

function extract() {
  const $ = load(HTML);
  return extractPage($, {
    url: 'https://a.it/pagina/',
    statusCode: 200,
    responseTimeMs: 42,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    canonicalHost: 'a.it',
    includeSubdomains: false,
    robotsBlocked: false,
    redirects: [],
    depth: 1,
    hasDoctype: /^\s*<!doctype/i.test(HTML),
    rawHtmlSize: Buffer.byteLength(HTML),
  });
}

test('title, meta e attributi HTML di base', () => {
  const r = extract();
  assert.equal(r.page.title, 'Il mio titolo');
  assert.equal(r.page.meta_description, 'Descrizione di prova');
  assert.equal(r.page.html_lang, 'it');
  assert.equal(r.page.charset, 'utf-8');
  assert.equal(r.page.has_doctype, 1);
  assert.ok(r.page.viewport.includes('width=device-width'));
  assert.ok(r.page.html_size > 0);
  assert.ok(r.page.word_count > 0);
});

test('canonical risolto assoluto e indexability auto-referenziale', () => {
  const r = extract();
  assert.equal(r.page.canonical, 'https://a.it/pagina/');
  assert.equal(r.page.indexable, 1);
});

test('heading in ordine con livelli corretti', () => {
  const r = extract();
  assert.deepEqual(r.headings.map((h) => h.level), [1, 3]);
  assert.equal(r.headings[0].text, 'Titolo H1');
});

test('link: interni/esterni e accessible name', () => {
  const r = extract();
  const byHref = Object.fromEntries(r.links.map((l) => [l.href, l]));
  assert.equal(byHref['https://a.it/interno/'].is_internal, true);
  assert.equal(byHref['https://a.it/interno/'].anchor_text, 'Link interno');
  assert.equal(byHref['https://esterno.com/pagina'].is_internal, false);
  // link-immagine con alt: l'accessible name e' l'alt
  assert.equal(byHref['https://a.it/logo/'].anchor_text, 'Logo alt');
  // link-immagine senza alt/aria/title: nessun nome accessibile
  assert.equal(byHref['https://a.it/senza-nome/'].anchor_text, '');
});

test('immagini: alt assente (null) vs alt vuoto ("")', () => {
  const r = extract();
  const bySrc = Object.fromEntries(r.images.map((im) => [im.src, im]));
  assert.equal(bySrc['https://a.it/no-alt.jpg'].alt, null);
  assert.equal(bySrc['https://a.it/alt-vuoto.jpg'].alt, '');
});

test('JSON-LD: blocchi validi e malformati', () => {
  const r = extract();
  assert.equal(r.jsonld.length, 2);
  const ok = r.jsonld.find((j) => j.parse_ok === 1);
  const ko = r.jsonld.find((j) => j.parse_ok === 0);
  assert.equal(ok.schema_type, 'Article');
  assert.ok(ko);
});

test('hreflang: coppie lingua -> URL assoluto', () => {
  const r = extract();
  assert.equal(r.hreflang.length, 2);
  const xd = r.hreflang.find((h) => h.hreflang === 'x-default');
  assert.equal(xd.href, 'https://a.it/');
});

test('risorse: scheme http rilevato (mixed content)', () => {
  const r = extract();
  const script = r.resources.find((res) => res.kind === 'script');
  assert.equal(script.scheme, 'http');
});
