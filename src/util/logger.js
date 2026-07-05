// Logger minimale per progresso leggibile durante il crawl.

function ts() {
  return new Date().toISOString().slice(11, 19); // HH:MM:SS
}

export const logger = {
  info: (msg) => console.log(`[${ts()}] ${msg}`),
  warn: (msg) => console.warn(`[${ts()}] ⚠ ${msg}`),
  error: (msg) => console.error(`[${ts()}] ✖ ${msg}`),
  ok: (msg) => console.log(`[${ts()}] ✓ ${msg}`),
};
