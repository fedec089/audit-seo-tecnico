-- Schema SQLite per l'audit SEO tecnico.
-- Una run = un file DB. Il crawler (Fase 1) popola pages + tabelle figlie.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Una riga per URL crawlato (o tentato).
CREATE TABLE IF NOT EXISTS pages (
  id                INTEGER PRIMARY KEY,
  url               TEXT NOT NULL UNIQUE,
  -- fetch
  status_code       INTEGER,
  response_time_ms  INTEGER,
  content_type      TEXT,
  fetched_at        TEXT,                 -- ISO 8601
  error             TEXT,                 -- se la fetch e' fallita del tutto (no response)
  -- headers rilevanti
  x_robots_tag      TEXT,
  canonical_header  TEXT,                 -- canonical via Link header
  cache_control     TEXT,
  -- meta / on-page
  title             TEXT,
  meta_description  TEXT,
  meta_robots       TEXT,
  canonical         TEXT,                 -- da <link rel=canonical>
  word_count        INTEGER,
  content_text      TEXT,                 -- testo visibile troncato (~20k char)
  content_hash      TEXT,                 -- hash normalizzato (dup esatti)
  og_json           TEXT,                 -- OpenGraph come JSON
  twitter_json      TEXT,                 -- Twitter card come JSON
  -- attributi HTML di base (per i controlli html-basics)
  html_lang         TEXT,                 -- attributo lang di <html>
  charset           TEXT,                 -- charset dichiarato
  has_doctype       INTEGER,              -- 1 se la pagina ha <!doctype>
  viewport          TEXT,                 -- meta viewport
  html_size         INTEGER,              -- dimensione HTML grezzo in byte
  text_size         INTEGER,              -- lunghezza testo visibile (per text/HTML ratio)
  -- crawl graph
  depth             INTEGER,
  discovered_via    TEXT CHECK(discovered_via IN ('sitemap','link','both')),
  source_url        TEXT,                 -- prima pagina sorgente del link
  -- robots
  robots_blocked    INTEGER DEFAULT 0,    -- 1 se robots.txt lo bloccherebbe (NON saltato)
  -- verdetto calcolato a fine fetch
  indexable         INTEGER,              -- 1/0
  indexable_reason  TEXT
);

-- Redirect: una riga per hop. La pagina finale (200) sta in pages.
CREATE TABLE IF NOT EXISTS redirects (
  id          INTEGER PRIMARY KEY,
  page_id     INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  step        INTEGER,                    -- 0,1,2...
  from_url    TEXT,
  to_url      TEXT,
  status_code INTEGER
);

CREATE TABLE IF NOT EXISTS headings (
  id       INTEGER PRIMARY KEY,
  page_id  INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  level    INTEGER,                       -- 1..6
  text     TEXT,
  position INTEGER                        -- ordine nel documento (per gerarchia)
);

CREATE TABLE IF NOT EXISTS links (
  id            INTEGER PRIMARY KEY,
  page_id       INTEGER REFERENCES pages(id) ON DELETE CASCADE,  -- pagina sorgente
  href          TEXT,                     -- assoluto, normalizzato
  anchor_text   TEXT,
  rel           TEXT,                     -- nofollow/sponsored/ugc...
  is_internal   INTEGER,
  target_status INTEGER                   -- riempito dal check link rotti (Fase 2)
);

CREATE TABLE IF NOT EXISTS images (
  id       INTEGER PRIMARY KEY,
  page_id  INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  src      TEXT,
  alt      TEXT,                          -- NULL = attributo assente
  loading  TEXT,                          -- lazy/eager
  width    INTEGER,
  height   INTEGER
);

CREATE TABLE IF NOT EXISTS hreflang (
  id        INTEGER PRIMARY KEY,
  page_id   INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  hreflang  TEXT,                         -- es. it-IT, x-default
  href      TEXT
);

CREATE TABLE IF NOT EXISTS jsonld (
  id          INTEGER PRIMARY KEY,
  page_id     INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  raw         TEXT,                       -- blocco grezzo
  parse_ok    INTEGER,                    -- 0 se malformato
  schema_type TEXT                        -- @type se estraibile
);

-- Risorse referenziate (per mixed content): src di img/script/link/css/iframe.
CREATE TABLE IF NOT EXISTS resources (
  id       INTEGER PRIMARY KEY,
  page_id  INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  url      TEXT,
  kind     TEXT,                          -- script/style/img/iframe...
  scheme   TEXT                           -- http/https
);

-- Risultati audit (Fase 2): un record per occorrenza issue->url.
CREATE TABLE IF NOT EXISTS issues (
  id        INTEGER PRIMARY KEY,
  rule_id   TEXT,
  category  TEXT,
  severity  TEXT CHECK(severity IN ('error','warning','notice')),
  message   TEXT,
  url       TEXT,
  detail    TEXT                          -- JSON extra (es. URL target, valore)
);

-- Risultati Lighthouse (Fase 3).
CREATE TABLE IF NOT EXISTS perf (
  id            INTEGER PRIMARY KEY,
  url           TEXT,
  template      TEXT,
  lcp_ms        REAL,
  cls           REAL,
  inp_ms        REAL,
  tbt_ms        REAL,
  perf_score    REAL,
  crux_json     TEXT,
  measured_at   TEXT
);

-- Meta della run (host canonico, sitemap, parametri usati).
CREATE TABLE IF NOT EXISTS run_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_links_href     ON links(href);
CREATE INDEX IF NOT EXISTS idx_links_page     ON links(page_id);
CREATE INDEX IF NOT EXISTS idx_pages_status   ON pages(status_code);
CREATE INDEX IF NOT EXISTS idx_pages_disc     ON pages(discovered_via);
CREATE INDEX IF NOT EXISTS idx_issues_cat     ON issues(category);
CREATE INDEX IF NOT EXISTS idx_content_hash   ON pages(content_hash);
