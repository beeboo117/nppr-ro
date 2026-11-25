import { defineConfig } from 'astro/config';

// For GitHub Pages at https://beeboo117.github.io/nppr-ro/ set SITE and BASE (the deploy workflow does).
export default defineConfig({
  site: process.env.SITE || 'https://beeboo117.github.io',
  base: process.env.BASE || '/nppr-ro',
  trailingSlash: 'always',
  build: { format: 'directory' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
});
