import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUrl, isInternal, isSameSite, stripWww, compilePatterns, isExcluded,
} from '../src/crawl/url-utils.js';

test('normalizeUrl: rimuove fragment e porta di default, lowercase host', () => {
  assert.equal(normalizeUrl('https://A.IT:443/x#frag'), 'https://a.it/x');
  assert.equal(normalizeUrl('http://a.it:80/'), 'http://a.it/');
});

test('normalizeUrl: risolve i relativi rispetto alla base', () => {
  assert.equal(normalizeUrl('/rel', 'https://a.it/dir/'), 'https://a.it/rel');
  assert.equal(normalizeUrl('sotto/', 'https://a.it/dir/'), 'https://a.it/dir/sotto/');
});

test('normalizeUrl: scarta schemi non navigabili', () => {
  assert.equal(normalizeUrl('mailto:x@y.it'), null);
  assert.equal(normalizeUrl('javascript:void(0)'), null);
  assert.equal(normalizeUrl('tel:+391234'), null);
  assert.equal(normalizeUrl('#top', 'https://a.it/p'), null);
  assert.equal(normalizeUrl('ftp://a.it/x'), null);
});

test('normalizeUrl: conserva la query string', () => {
  assert.equal(normalizeUrl('https://a.it/p?x=1&y=2'), 'https://a.it/p?x=1&y=2');
});

test('isInternal: host canonico esatto, no www/sottodomini', () => {
  assert.equal(isInternal('https://a.it/x', 'a.it', false), true);
  assert.equal(isInternal('https://www.a.it/x', 'a.it', false), false);
  assert.equal(isInternal('https://blog.a.it/x', 'a.it', false), false);
  assert.equal(isInternal('https://altro.com/x', 'a.it', false), false);
});

test('isInternal: con includeSubdomains accetta i sottodomini', () => {
  assert.equal(isInternal('https://blog.a.it/x', 'a.it', true), true);
  assert.equal(isInternal('https://altro.com/x', 'a.it', true), false);
});

test('isSameSite: variante www in scope, domini esterni no', () => {
  assert.equal(isSameSite('https://www.a.it/x', 'a.it', false), true);
  assert.equal(isSameSite('https://a.it/x', 'www.a.it', false), true);
  assert.equal(isSameSite('https://facebook.com/x', 'a.it', false), false);
  // sottodominio senza --subdomains: fuori scope
  assert.equal(isSameSite('https://blog.a.it/x', 'a.it', false), false);
});

test('stripWww', () => {
  assert.equal(stripWww('www.a.it'), 'a.it');
  assert.equal(stripWww('a.it'), 'a.it');
  assert.equal(stripWww('WWW.a.it'.toLowerCase()), 'a.it');
});

test('isExcluded: pattern WooCommerce/WP e tracking di default', () => {
  const res = compilePatterns(['[?&]add-to-cart=', '/wp-admin', '[?&]utm_', '[?&]gclid=']);
  assert.equal(isExcluded('https://a.it/?add-to-cart=5', res), true);
  assert.equal(isExcluded('https://a.it/prodotto/?add-to-cart=5', res), true);
  assert.equal(isExcluded('https://a.it/wp-admin/edit.php', res), true);
  assert.equal(isExcluded('https://a.it/p?utm_source=x', res), true);
  assert.equal(isExcluded('https://a.it/p?gclid=abc', res), true);
  assert.equal(isExcluded('https://a.it/pagina-normale/', res), false);
});
