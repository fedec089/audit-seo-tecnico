// Regole: on-page (title, meta description, H1, gerarchia heading).
import { normText, groupBy, len, downgradeArchives } from './_helpers.js';

// Candidate ai controlli on-page: vere pagine HTML 200 indicizzabili.
function candidates(ds) {
  return ds.pages.filter((p) => ds.isContentPage(p) && p.indexable === 1);
}

function duplicateOccurrences(ds, valueFn, kind) {
  const cand = candidates(ds).filter((p) => valueFn(p));
  const groups = groupBy(cand, (p) => normText(valueFn(p)));
  const out = [];
  for (const [, pagesInGroup] of groups) {
    if (pagesInGroup.length < 2) continue;
    const urls = pagesInGroup.map((p) => p.url);
    for (const p of pagesInGroup) {
      out.push({
        url: p.url,
        message: `${kind} duplicato su ${urls.length} pagine`,
        detail: { value: valueFn(p), duplicateUrls: urls.filter((u) => u !== p.url).slice(0, 20) },
      });
    }
  }
  return out;
}

export const onpageRules = [
  {
    id: 'title-missing', category: 'onpage', severity: 'error',
    message: 'Title mancante',
    run(ds) { return candidates(ds).filter((p) => !len(p.title)).map((p) => ({ url: p.url })); },
  },
  {
    id: 'title-short', category: 'onpage', severity: 'warning',
    message: 'Title troppo corto',
    run(ds) {
      const min = ds.thresholds.titleMin;
      return candidates(ds)
        .filter((p) => len(p.title) > 0 && len(p.title) < min)
        .map((p) => ({ url: p.url, message: `Title troppo corto (${len(p.title)} < ${min})`, detail: { title: p.title } }));
    },
  },
  {
    id: 'title-long', category: 'onpage', severity: 'warning',
    message: 'Title troppo lungo',
    run(ds) {
      const max = ds.thresholds.titleMax;
      return candidates(ds)
        .filter((p) => len(p.title) > max)
        .map((p) => ({ url: p.url, message: `Title troppo lungo (${len(p.title)} > ${max})`, detail: { title: p.title } }));
    },
  },
  {
    id: 'title-duplicate', category: 'onpage', severity: 'warning',
    message: 'Title duplicato',
    // Su archivi/paginazioni il title duplicato e' atteso -> declassato a notice.
    run(ds) { return downgradeArchives(duplicateOccurrences(ds, (p) => p.title, 'Title')); },
  },
  {
    id: 'metadesc-missing', category: 'onpage', severity: 'warning',
    message: 'Meta description mancante',
    // Su archivi/paginazioni la meta description mancante e' attesa -> notice.
    run(ds) {
      return downgradeArchives(
        candidates(ds).filter((p) => !len(p.meta_description)).map((p) => ({ url: p.url })),
      );
    },
  },
  {
    id: 'metadesc-short', category: 'onpage', severity: 'notice',
    message: 'Meta description troppo corta',
    run(ds) {
      const min = ds.thresholds.metaDescMin;
      return candidates(ds)
        .filter((p) => len(p.meta_description) > 0 && len(p.meta_description) < min)
        .map((p) => ({ url: p.url, message: `Meta description troppo corta (${len(p.meta_description)} < ${min})` }));
    },
  },
  {
    id: 'metadesc-long', category: 'onpage', severity: 'notice',
    message: 'Meta description troppo lunga',
    run(ds) {
      const max = ds.thresholds.metaDescMax;
      return candidates(ds)
        .filter((p) => len(p.meta_description) > max)
        .map((p) => ({ url: p.url, message: `Meta description troppo lunga (${len(p.meta_description)} > ${max})` }));
    },
  },
  {
    id: 'metadesc-duplicate', category: 'onpage', severity: 'notice',
    message: 'Meta description duplicata',
    run(ds) { return duplicateOccurrences(ds, (p) => p.meta_description, 'Meta description'); },
  },
  {
    id: 'h1-missing', category: 'onpage', severity: 'warning',
    message: 'H1 mancante o vuoto',
    run(ds) {
      const out = [];
      for (const p of candidates(ds)) {
        const hs = ds.headingsByUrl.get(p.url) || [];
        const h1s = hs.filter((h) => h.level === 1);
        // Mancante (nessun <h1>) oppure presente ma senza testo utile.
        const hasUsefulH1 = h1s.some((h) => (h.text || '').trim());
        if (!hasUsefulH1) {
          out.push({ url: p.url, detail: { h1Count: h1s.length, empty: h1s.length > 0 } });
        }
      }
      return out;
    },
  },
  {
    id: 'h1-multiple', category: 'onpage', severity: 'notice',
    message: 'H1 multipli',
    run(ds) {
      const out = [];
      for (const p of candidates(ds)) {
        const hs = ds.headingsByUrl.get(p.url) || [];
        const n = hs.filter((h) => h.level === 1).length;
        if (n > 1) out.push({ url: p.url, message: `H1 multipli (${n})` });
      }
      return out;
    },
  },
  {
    id: 'h1-equals-title', category: 'onpage', severity: 'warning',
    message: 'H1 identico al title (contenuto duplicato h1/title)',
    run(ds) {
      const out = [];
      for (const p of candidates(ds)) {
        if (!len(p.title)) continue;
        const hs = ds.headingsByUrl.get(p.url) || [];
        const h1 = hs.find((h) => h.level === 1);
        if (h1 && normText(h1.text) && normText(h1.text) === normText(p.title)) {
          out.push({ url: p.url, detail: { value: p.title } });
        }
      }
      return out;
    },
  },
  {
    id: 'heading-hierarchy-skip', category: 'onpage', severity: 'notice',
    message: 'Gerarchia heading saltata (es. H2 -> H4)',
    run(ds) {
      const out = [];
      for (const p of candidates(ds)) {
        const hs = (ds.headingsByUrl.get(p.url) || []).slice().sort((a, b) => a.position - b.position);
        let prev = 0;
        const jumps = [];
        for (const h of hs) {
          if (prev > 0 && h.level > prev + 1) jumps.push(`H${prev}->H${h.level}`);
          prev = h.level;
        }
        if (jumps.length) out.push({ url: p.url, detail: { jumps } });
      }
      return out;
    },
  },
];
