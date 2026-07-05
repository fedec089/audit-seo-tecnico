import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateKey } from '../src/perf/sampler.js';

test('templateKey: raggruppamento per pattern di path', () => {
  assert.equal(templateKey('https://a.it/'), 'home');
  assert.equal(templateKey('https://a.it/pagina/'), '/(top-level)');
  assert.equal(templateKey('https://a.it/pagina'), '/(top-level)');
  assert.equal(templateKey('https://a.it/servizi/x/'), '/servizi/');
  assert.equal(templateKey('https://a.it/blog/cat/post/'), '/blog/cat/');
});
