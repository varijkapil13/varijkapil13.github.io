import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://varij.dev',
  integrations: [
    tailwind(),
    sitemap({
      serialize(item) {
        // Set default values for sitemap entries
        item.changefreq = 'weekly';
        item.priority = item.url.includes('/blog/') ? 0.8 : 0.7;
        return item;
      }
    })
  ],
  output: 'static',
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true
    }
  }
});
