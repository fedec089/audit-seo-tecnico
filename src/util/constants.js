// Costanti e default condivisi.

export const TOOL_NAME = 'audit-seo-tecnico';

// User-agent descrittivo di default; opzione --googlebot per emulare Googlebot.
// L'URL del repo permette ai webmaster che vedono il bot nei log di capire chi sei.
export const DEFAULT_UA =
  'Mozilla/5.0 (compatible; audit-seo-tecnico/0.1; +https://github.com/fedec089/audit-seo-tecnico)';

export const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

// Pattern di esclusione di default (WooCommerce/WordPress: gli URL esplodono).
// Applicati SOLO agli URL scoperti via link, non a quelli dichiarati in sitemap.
export const DEFAULT_EXCLUDE_PATTERNS = [
  '\\?orderby=',
  '\\?add-to-cart=',
  '[?&]add-to-cart=',
  '[?&]filter_',
  '[?&]orderby=',
  '[?&]min_price=',
  '[?&]max_price=',
  '/cart/?',
  '/checkout/?',
  '/wp-admin',
  '/wp-json',
  '[?&]s=',     // ricerca interna ?s=
  '/\\?s=',
  '[?&]replytocom=',
  // Parametri di tracking: stessa pagina, URL diverso -> duplicati fittizi.
  '[?&]utm_',
  '[?&]gclid=',
  '[?&]fbclid=',
];

// Soglie di default per i controlli on-page/contenuto (usate in Fase 2).
// Calibrate per avvicinarsi a Semrush (titoli ~28-30 char non sono "corti").
export const DEFAULT_THRESHOLDS = {
  titleMin: 15,            // Semrush non segnala titoli ~28-30 char
  titleMax: 70,            // Semrush flagga ~70+ char (misura ~600px)
  metaDescMin: 50,
  metaDescMax: 160,
  thinContentWords: 250,
  textHtmlRatioMin: 0.10,  // text/HTML ratio sotto il 10% = "low text to HTML ratio"
};

// Lunghezza massima del testo salvato in content_text.
export const CONTENT_TEXT_MAX = 20000;
