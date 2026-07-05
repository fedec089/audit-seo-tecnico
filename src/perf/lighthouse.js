// Runner Lighthouse: lancia Chrome headless e misura le metriche lab di una pagina.
// INP non e' una metrica lab (e' field-only): si ottiene da PSI/CrUX (psi.js).
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

/**
 * @param {string} url
 * @param {object} opts { desktop, chromeFlags }
 * @returns {Promise<object>} metriche estratte
 */
export async function runLighthouse(url, opts = {}) {
  // Sandbox di Chrome ATTIVO: si caricano pagine di terzi non fidate.
  // (--no-sandbox serve solo in container/root: passalo via opts se necessario.)
  const chromeFlags = opts.chromeFlags ?? ['--headless=new', '--disable-gpu'];
  const chrome = await chromeLauncher.launch({ chromeFlags });
  try {
    const flags = {
      port: chrome.port,
      onlyCategories: ['performance'],
      output: 'json',
      logLevel: 'error',
    };
    // Default Lighthouse = mobile con throttling. --desktop per desktop.
    const config = opts.desktop ? desktopConfig() : undefined;

    const runnerResult = await lighthouse(url, flags, config);
    const lhr = runnerResult?.lhr;
    if (!lhr) throw new Error('nessun risultato Lighthouse');

    const a = lhr.audits || {};
    const num = (id) => (a[id]?.numericValue ?? null);
    const score = lhr.categories?.performance?.score;

    return {
      ok: true,
      lcp_ms: num('largest-contentful-paint'),
      cls: num('cumulative-layout-shift'),
      tbt_ms: num('total-blocking-time'),
      inp_ms: null, // field-only
      perf_score: score != null ? Math.round(score * 100) : null,
      // extra lab utili (salvati in lab_json)
      lab_extra: {
        fcp_ms: num('first-contentful-paint'),
        speed_index_ms: num('speed-index'),
        tti_ms: num('interactive'),
        formFactor: lhr.configSettings?.formFactor || (opts.desktop ? 'desktop' : 'mobile'),
        lighthouseVersion: lhr.lighthouseVersion,
        finalUrl: lhr.finalDisplayedUrl || lhr.finalUrl,
      },
    };
  } finally {
    await chrome.kill();
  }
}

// Config desktop minimale (preset Lighthouse).
function desktopConfig() {
  return {
    extends: 'lighthouse:default',
    settings: {
      formFactor: 'desktop',
      screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
      throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
    },
  };
}
