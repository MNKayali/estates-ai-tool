import type { MetadataRoute } from 'next';

const ORIGIN = 'https://www.projento.co.uk';

// The public pages only; everything behind sign-in is left out.
const PAGES: Array<[string, number]> = [
  ['/', 1],
  ['/sample', 0.8],
  ['/questionnaire', 0.8],
  ['/data-and-use', 0.4],
  ['/privacy', 0.3],
  ['/terms', 0.3],
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(([path, priority]) => ({
    url: `${ORIGIN}${path}`,
    changeFrequency: 'monthly',
    priority,
  }));
}
