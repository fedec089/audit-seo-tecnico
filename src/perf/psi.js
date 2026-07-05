// PageSpeed Insights API (opzionale): recupera i dati di CAMPO CrUX (field data),
// inclusi LCP/CLS/INP reali degli utenti. Richiede una API key.
// Docs: https://developers.google.com/speed/docs/insights/v5/get-started

/**
 * @param {string} url
 * @param {object} opts { key, strategy, timeoutMs }
 * @returns {Promise<{ crux: object|null, inp_ms: number|null }>}
 */
export async function fetchPSI(url, opts = {}) {
  const { key, strategy = 'mobile', timeoutMs = 30000 } = opts;
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', url);
  api.searchParams.set('category', 'performance');
  api.searchParams.set('strategy', strategy);
  if (key) api.searchParams.set('key', key);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(api, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`PSI HTTP ${res.status}`);
    const data = await res.json();
    // loadingExperience = dati di campo (CrUX) per la pagina.
    const crux = data.loadingExperience || null;
    const inpMetric = crux?.metrics?.INTERACTION_TO_NEXT_PAINT;
    const inp_ms = inpMetric?.percentile ?? null; // p75 di campo
    return { crux, inp_ms };
  } finally {
    clearTimeout(t);
  }
}
