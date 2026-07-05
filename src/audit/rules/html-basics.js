// Regole: attributi HTML di base (lang, charset, doctype, viewport) e
// text-to-HTML ratio. Operano sulle vere pagine HTML 200.

function htmlPages(ds) {
  return ds.pages.filter((p) => ds.isContentPage(p));
}

export const htmlBasicsRules = [
  {
    id: 'missing-html-lang',
    category: 'html',
    severity: 'warning',
    message: 'Attributo lang mancante su <html>',
    run(ds) {
      return htmlPages(ds)
        .filter((p) => !p.html_lang || !String(p.html_lang).trim())
        .map((p) => ({ url: p.url }));
    },
  },
  {
    id: 'missing-charset',
    category: 'html',
    severity: 'warning',
    message: 'Charset non dichiarato',
    run(ds) {
      return htmlPages(ds)
        .filter((p) => !p.charset || !String(p.charset).trim())
        .map((p) => ({ url: p.url }));
    },
  },
  {
    id: 'missing-doctype',
    category: 'html',
    severity: 'warning',
    message: 'Doctype non dichiarato',
    run(ds) {
      return htmlPages(ds)
        .filter((p) => p.has_doctype === 0)
        .map((p) => ({ url: p.url }));
    },
  },
  {
    id: 'missing-viewport',
    category: 'html',
    severity: 'warning',
    message: 'Meta viewport mancante',
    run(ds) {
      return htmlPages(ds)
        .filter((p) => !p.viewport || !String(p.viewport).trim())
        .map((p) => ({ url: p.url }));
    },
  },
  {
    id: 'low-text-html-ratio',
    category: 'html',
    severity: 'warning',
    message: 'Rapporto testo/HTML basso',
    run(ds) {
      const min = ds.thresholds.textHtmlRatioMin ?? 0.10;
      const out = [];
      for (const p of htmlPages(ds)) {
        if (!p.html_size || p.html_size <= 0 || p.text_size == null) continue;
        const ratio = p.text_size / p.html_size;
        if (ratio < min) {
          out.push({
            url: p.url,
            message: `Text/HTML ratio ${(ratio * 100).toFixed(1)}% (< ${(min * 100).toFixed(0)}%)`,
            detail: { ratio: Number(ratio.toFixed(3)), textSize: p.text_size, htmlSize: p.html_size },
          });
        }
      }
      return out;
    },
  },
];
