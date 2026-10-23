import type { MetadataRoute } from 'next';

const ORIGIN = 'https://www.projento.co.uk';

// Private or per-user areas: nothing here is useful to a crawler.
const PRIVATE = ['/api/', '/admin', '/report/', '/reports', '/report-fixture', '/set-password'];

// Crawlers that only gather AI training data (they send no visitors back).
// Search and answer bots (PerplexityBot, Perplexity-User, OAI-SearchBot,
// ChatGPT-User, Claude-SearchBot, Claude-User, Googlebot, Bingbot) fall under '*'.
const TRAINING_ONLY = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'meta-externalagent',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE },
      { userAgent: TRAINING_ONLY, disallow: '/' },
    ],
    sitemap: `${ORIGIN}/sitemap.xml`,
    host: ORIGIN,
  };
}
