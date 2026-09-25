// Lets plain Node run app modules that import '@/lib/…' (the Next/Vitest alias).
//   node --import ./test-reports/_reference/alias.mjs <script>
import { register } from 'node:module'
register('data:text/javascript,' + encodeURIComponent(`
  const root = ${JSON.stringify(new URL('../../', import.meta.url).href)};
  export async function resolve(spec, ctx, next) {
    if (spec.startsWith('@/')) {
      const base = root + spec.slice(2);
      try { return await next(base, ctx) } catch { return next(base + '.js', ctx) }
    }
    return next(spec, ctx);
  }`))
