// Aggrega tutte le regole in un unico array consumato dall'engine.
import { statusRules } from './status.js';
import { indexabilityRules } from './indexability.js';
import { sitemapCrawlRules } from './sitemap-crawl.js';
import { onpageRules } from './onpage.js';
import { contentRules } from './content.js';
import { structuredDataRules } from './structured-data.js';
import { hreflangRules } from './hreflang.js';
import { imagesLinksRules } from './images-links.js';
import { technicalRules } from './technical.js';
import { linkQualityRules } from './link-quality.js';
import { htmlBasicsRules } from './html-basics.js';
import { robotsSitemapRules } from './robots-sitemap.js';

export const ALL_RULES = [
  ...statusRules,
  ...indexabilityRules,
  ...sitemapCrawlRules,
  ...onpageRules,
  ...contentRules,
  ...structuredDataRules,
  ...hreflangRules,
  ...imagesLinksRules,
  ...technicalRules,
  ...linkQualityRules,
  ...htmlBasicsRules,
  ...robotsSitemapRules,
];

// Elenco delle categorie disponibili (per il flag --only).
export const CATEGORIES = [...new Set(ALL_RULES.map((r) => r.category))];
