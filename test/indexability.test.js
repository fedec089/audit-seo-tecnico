import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeIndexability } from '../src/crawl/indexability.js';

const base = { metaRobots: null, xRobotsTag: null, canonical: null, url: 'https://a.it/p' };

test('200 senza direttive: indicizzabile', () => {
  const r = computeIndexability({ ...base, statusCode: 200 });
  assert.equal(r.indexable, 1);
});

test('4xx e 5xx: non indicizzabile', () => {
  assert.equal(computeIndexability({ ...base, statusCode: 404 }).indexable, 0);
  assert.equal(computeIndexability({ ...base, statusCode: 500 }).indexable, 0);
});

test('redirect 3xx: non indicizzabile', () => {
  const r = computeIndexability({ ...base, statusCode: 301 });
  assert.equal(r.indexable, 0);
  assert.match(r.reason, /redirect/);
});

test('noindex via meta robots', () => {
  const r = computeIndexability({ ...base, statusCode: 200, metaRobots: 'noindex, follow' });
  assert.equal(r.indexable, 0);
});

test('noindex via X-Robots-Tag header', () => {
  const r = computeIndexability({ ...base, statusCode: 200, xRobotsTag: 'noindex' });
  assert.equal(r.indexable, 0);
});

test('robots "none" equivale a noindex', () => {
  const r = computeIndexability({ ...base, statusCode: 200, metaRobots: 'none' });
  assert.equal(r.indexable, 0);
});

test('canonicalizzata verso altro URL: non indicizzabile', () => {
  const r = computeIndexability({ ...base, statusCode: 200, canonical: 'https://a.it/altra' });
  assert.equal(r.indexable, 0);
});

test('canonical auto-referenziale: indicizzabile', () => {
  const r = computeIndexability({ ...base, statusCode: 200, canonical: 'https://a.it/p' });
  assert.equal(r.indexable, 1);
});

test('nessuna risposta: non indicizzabile', () => {
  const r = computeIndexability({ ...base, statusCode: null });
  assert.equal(r.indexable, 0);
});
