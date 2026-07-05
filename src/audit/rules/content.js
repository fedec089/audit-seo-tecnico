// Regole: contenuto (thin content e duplicati).
import { groupBy } from './_helpers.js';

function candidates(ds) {
  return ds.pages.filter((p) => ds.isContentPage(p) && p.indexable === 1);
}

export const contentRules = [
  {
    id: 'thin-content',
    category: 'content',
    severity: 'warning',
    message: 'Contenuto scarno (word count sotto soglia)',
    run(ds) {
      const min = ds.thresholds.thinContentWords;
      return candidates(ds)
        .filter((p) => (p.word_count ?? 0) < min)
        .map((p) => ({ url: p.url, message: `Thin content (${p.word_count} parole < ${min})`, detail: { wordCount: p.word_count } }));
    },
  },
  {
    id: 'duplicate-content',
    category: 'content',
    severity: 'warning',
    message: 'Contenuto duplicato (testo identico tra pagine)',
    run(ds) {
      // Duplicato esatto via content_hash (sha1 del testo visibile normalizzato).
      const groups = groupBy(candidates(ds), (p) => p.content_hash);
      const out = [];
      for (const [, pagesInGroup] of groups) {
        if (pagesInGroup.length < 2) continue;
        const urls = pagesInGroup.map((p) => p.url);
        for (const p of pagesInGroup) {
          out.push({
            url: p.url,
            message: `Contenuto identico ad altre ${urls.length - 1} pagine`,
            detail: { duplicateUrls: urls.filter((u) => u !== p.url).slice(0, 20) },
          });
        }
      }
      return out;
    },
  },
];
