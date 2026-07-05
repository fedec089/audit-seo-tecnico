// Selezione di un campione rappresentativo di pagine su cui girare Lighthouse.
// Raggruppa per "template" (euristica sul path) e prende un rappresentante per
// gruppo, dando priorita' ai template piu' diffusi + alla homepage.

/**
 * Deriva una chiave di template dall'URL:
 * - "/"                      -> "home"
 * - "/fabbro-varese/"        -> "/(top-level)"
 * - "/servizi/x/"            -> "/servizi/"
 * - "/blog/x/y/"             -> "/blog/x/"
 */
export function templateKey(url) {
  let path;
  try { path = new URL(url).pathname; } catch { return '?'; }
  path = path.replace(/\/+$/, '');
  if (path === '' || path === '/') return 'home';
  const segs = path.split('/').filter(Boolean);
  if (segs.length === 1) return '/(top-level)';
  return `/${segs.slice(0, -1).join('/')}/`;
}

/**
 * Seleziona fino a maxSamples pagine rappresentative.
 * @param {object} ds dataset (loadDataset)
 * @param {object} opts { maxSamples, startUrl }
 * @returns {{url:string, template:string}[]}
 */
export function selectSamples(ds, { maxSamples = 6, startUrl = null } = {}) {
  // Candidate: vere pagine HTML 200 indicizzabili.
  const candidates = ds.pages.filter((p) => ds.isContentPage(p) && p.indexable === 1);

  // Raggruppa per template.
  const groups = new Map();
  for (const p of candidates) {
    const key = templateKey(p.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const inbound = (url) => (ds.inboundInternal.get(url)?.size ?? 0);

  // Per ogni gruppo, il rappresentante = piu' link interni in ingresso,
  // a parita' URL piu' corto (di solito il piu' "canonico").
  const reps = [];
  for (const [key, pages] of groups.entries()) {
    const rep = pages.slice().sort((a, b) =>
      inbound(b.url) - inbound(a.url) || a.url.length - b.url.length)[0];
    reps.push({ url: rep.url, template: key, groupSize: pages.length });
  }

  // Ordina: homepage prima, poi i template piu' diffusi.
  reps.sort((a, b) => {
    if (a.template === 'home') return -1;
    if (b.template === 'home') return 1;
    return b.groupSize - a.groupSize;
  });

  // Garantisce la homepage nel campione se presente tra i candidati.
  const startNorm = startUrl;
  if (startNorm && !reps.some((r) => r.url === startNorm)) {
    const home = candidates.find((p) => p.url === startNorm);
    if (home) reps.unshift({ url: home.url, template: 'home', groupSize: 1 });
  }

  return reps.slice(0, maxSamples).map(({ url, template }) => ({ url, template }));
}
