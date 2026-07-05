// Esempio di configurazione. Copia in `audit.config.js` per attivarla
// (i flag CLI hanno comunque la precedenza sui valori qui).
export default {
  // Host canonico "vero": la versione che consideri ufficiale.
  // Le altre versioni (www/non-www, http/https) verranno segnalate in Fase 2.
  canonicalHost: 'www.example.com',

  // Sitemap: se omesso si usa <origin>/sitemap.xml
  sitemapUrl: null,

  includeSubdomains: false,
  useGooglebot: false,

  // Rate limit conservativo per non sovraccaricare il server target.
  concurrency: 5,
  delayMs: 250,

  // Limiti di sicurezza contro crawl infiniti.
  maxUrls: 1000,
  maxDepth: 10,

  timeoutMs: 30000,
  maxRetries: 1,

  // Pattern regex (stringhe) da escludere SOLO dagli URL trovati via link.
  // Se omesso vengono usati i default WooCommerce/WordPress.
  // excludePatterns: ['\\?orderby=', '/cart/?', '/wp-admin'],

  // Soglie usate dai controlli on-page/contenuto (Fase 2).
  thresholds: {
    titleMin: 15,
    titleMax: 70,
    metaDescMin: 50,
    metaDescMax: 160,
    thinContentWords: 250,
    textHtmlRatioMin: 0.10, // sotto il 10% -> "low text to HTML ratio"
  },
};
