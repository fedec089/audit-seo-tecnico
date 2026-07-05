// Regole: status code & redirect.

export const statusRules = [
  {
    id: 'status-4xx',
    category: 'status',
    severity: 'error',
    message: 'Pagina che risponde con errore client 4xx',
    run(ds) {
      return ds.pages
        .filter((p) => p.status_code >= 400 && p.status_code < 500)
        .map((p) => ({ url: p.url, detail: { status: p.status_code, source: p.source_url } }));
    },
  },
  {
    id: 'status-5xx',
    category: 'status',
    severity: 'error',
    message: 'Pagina che risponde con errore server 5xx',
    run(ds) {
      return ds.pages
        .filter((p) => p.status_code >= 500 && p.status_code < 600)
        .map((p) => ({ url: p.url, detail: { status: p.status_code, source: p.source_url } }));
    },
  },
  {
    id: 'redirect-chain',
    category: 'status',
    severity: 'warning',
    message: 'Catena di redirect con piu di un hop',
    run(ds) {
      const out = [];
      for (const [url, hops] of ds.redirectsByUrl.entries()) {
        if (hops.length > 1) {
          out.push({
            url,
            message: `Catena di redirect (${hops.length} hop)`,
            detail: { hops: hops.map((h) => ({ from: h.from_url, to: h.to_url, status: h.status_code })) },
          });
        }
      }
      return out;
    },
  },
  {
    id: 'redirect-loop',
    category: 'status',
    severity: 'error',
    message: 'Loop di redirect',
    run(ds) {
      const out = [];
      for (const [url, hops] of ds.redirectsByUrl.entries()) {
        if (!hops.length) continue;
        // Sequenza dei nodi attraversati: primo "from" + tutti i "to".
        // In una catena A->B->C la sequenza e' [A,B,C] (nessun nodo ripetuto).
        // E' un loop solo se un nodo si ripete: A->B->A => [A,B,A].
        const seq = [hops[0].from_url, ...hops.map((h) => h.to_url)];
        const isLoop = new Set(seq).size < seq.length;
        if (isLoop) {
          out.push({
            url,
            detail: { hops: hops.map((h) => ({ from: h.from_url, to: h.to_url, status: h.status_code })) },
          });
        }
      }
      return out;
    },
  },
];
