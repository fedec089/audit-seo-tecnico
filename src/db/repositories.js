// Accesso ai dati: prepared statements per inserire un record di pagina
// e le sue tabelle figlie in modo transazionale. Nessun SQL sparso altrove.

/**
 * Costruisce un repository legato a una connessione DB.
 * @param {import('better-sqlite3').Database} db
 */
export function createRepository(db) {
  const insertPageStmt = db.prepare(`
    INSERT INTO pages (
      url, status_code, response_time_ms, content_type, fetched_at, error,
      x_robots_tag, canonical_header, cache_control,
      title, meta_description, meta_robots, canonical,
      word_count, content_text, content_hash, og_json, twitter_json,
      html_lang, charset, has_doctype, viewport, html_size, text_size,
      depth, discovered_via, source_url, robots_blocked,
      indexable, indexable_reason
    ) VALUES (
      @url, @status_code, @response_time_ms, @content_type, @fetched_at, @error,
      @x_robots_tag, @canonical_header, @cache_control,
      @title, @meta_description, @meta_robots, @canonical,
      @word_count, @content_text, @content_hash, @og_json, @twitter_json,
      @html_lang, @charset, @has_doctype, @viewport, @html_size, @text_size,
      @depth, @discovered_via, @source_url, @robots_blocked,
      @indexable, @indexable_reason
    )
    ON CONFLICT(url) DO UPDATE SET
      status_code=excluded.status_code,
      response_time_ms=excluded.response_time_ms,
      content_type=excluded.content_type,
      fetched_at=excluded.fetched_at,
      error=excluded.error,
      x_robots_tag=excluded.x_robots_tag,
      canonical_header=excluded.canonical_header,
      cache_control=excluded.cache_control,
      title=excluded.title,
      meta_description=excluded.meta_description,
      meta_robots=excluded.meta_robots,
      canonical=excluded.canonical,
      word_count=excluded.word_count,
      content_text=excluded.content_text,
      content_hash=excluded.content_hash,
      og_json=excluded.og_json,
      twitter_json=excluded.twitter_json,
      html_lang=excluded.html_lang,
      charset=excluded.charset,
      has_doctype=excluded.has_doctype,
      viewport=excluded.viewport,
      html_size=excluded.html_size,
      text_size=excluded.text_size,
      robots_blocked=excluded.robots_blocked,
      indexable=excluded.indexable,
      indexable_reason=excluded.indexable_reason
  `);

  const insRedirect = db.prepare(`INSERT INTO redirects (page_id, step, from_url, to_url, status_code)
                                  VALUES (?, ?, ?, ?, ?)`);
  const insHeading = db.prepare(`INSERT INTO headings (page_id, level, text, position)
                                 VALUES (?, ?, ?, ?)`);
  const insLink = db.prepare(`INSERT INTO links (page_id, href, anchor_text, rel, is_internal)
                              VALUES (?, ?, ?, ?, ?)`);
  const insImage = db.prepare(`INSERT INTO images (page_id, src, alt, loading, width, height)
                               VALUES (?, ?, ?, ?, ?, ?)`);
  const insHreflang = db.prepare(`INSERT INTO hreflang (page_id, hreflang, href)
                                  VALUES (?, ?, ?)`);
  const insJsonld = db.prepare(`INSERT INTO jsonld (page_id, raw, parse_ok, schema_type)
                                VALUES (?, ?, ?, ?)`);
  const insResource = db.prepare(`INSERT INTO resources (page_id, url, kind, scheme)
                                  VALUES (?, ?, ?, ?)`);

  // Pulizia tabelle figlie quando una pagina viene riscritta (idempotenza).
  const delChildren = {
    redirects: db.prepare('DELETE FROM redirects WHERE page_id = ?'),
    headings: db.prepare('DELETE FROM headings WHERE page_id = ?'),
    links: db.prepare('DELETE FROM links WHERE page_id = ?'),
    images: db.prepare('DELETE FROM images WHERE page_id = ?'),
    hreflang: db.prepare('DELETE FROM hreflang WHERE page_id = ?'),
    jsonld: db.prepare('DELETE FROM jsonld WHERE page_id = ?'),
    resources: db.prepare('DELETE FROM resources WHERE page_id = ?'),
  };

  const getPageId = db.prepare('SELECT id FROM pages WHERE url = ?');

  const updateProvenance = db.prepare(`
    UPDATE pages SET discovered_via = @discovered_via, source_url = @source_url, depth = @depth
    WHERE url = @url
  `);

  const setMeta = db.prepare(`INSERT INTO run_meta (key, value) VALUES (?, ?)
                              ON CONFLICT(key) DO UPDATE SET value=excluded.value`);

  /**
   * Salva una pagina completa (record + figli) in un'unica transazione.
   * @param {object} record output di extractPage + campi di crawl
   */
  const savePage = db.transaction((record) => {
    insertPageStmt.run(record.page);
    const { id } = getPageId.get(record.page.url);

    // Idempotenza: ripulisci i figli prima di reinserirli.
    for (const stmt of Object.values(delChildren)) stmt.run(id);

    record.redirects?.forEach((r, i) =>
      insRedirect.run(id, i, r.from, r.to, r.status));
    record.headings?.forEach((h) =>
      insHeading.run(id, h.level, h.text, h.position));
    record.links?.forEach((l) =>
      insLink.run(id, l.href, l.anchor_text, l.rel, l.is_internal ? 1 : 0));
    record.images?.forEach((im) =>
      insImage.run(id, im.src, im.alt, im.loading, im.width, im.height));
    record.hreflang?.forEach((hf) =>
      insHreflang.run(id, hf.hreflang, hf.href));
    record.jsonld?.forEach((j) =>
      insJsonld.run(id, j.raw, j.parse_ok ? 1 : 0, j.schema_type));
    record.resources?.forEach((res) =>
      insResource.run(id, res.url, res.kind, res.scheme));

    return id;
  });

  return {
    savePage,
    updateProvenance: (row) => updateProvenance.run(row),
    setMeta: (key, value) => setMeta.run(key, value),
    countPages: () => db.prepare('SELECT COUNT(*) AS n FROM pages').get().n,
    allUrls: () => new Set(db.prepare('SELECT url FROM pages').all().map((r) => r.url)),
  };
}
