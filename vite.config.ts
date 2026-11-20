import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const IMG = /\.(png|jpe?g|webp|avif|gif|svg)$/i;

/** public/wallpapers/*.jpg|png|webp… → wallpapers/manifest.json (галерея обоев видит их автоматически). */
function wallpapersManifest(): Plugin {
  let dir = '';
  const list = () => (existsSync(dir) ? readdirSync(dir).filter((f) => IMG.test(f)).sort() : []);
  return {
    name: 'cw-wallpapers-manifest',
    configResolved(c) {
      dir = join(c.publicDir, 'wallpapers');
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.split('?')[0].endsWith('/wallpapers/manifest.json')) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(list()));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'wallpapers/manifest.json', source: JSON.stringify(list()) });
    },
  };
}

/** precache.json — список всех файлов сборки для service worker (офлайн с первого запуска, включая ленивые страницы). */
function precacheList(): Plugin {
  return {
    name: 'cw-precache-list',
    apply: 'build',
    generateBundle(_o, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const extra = ['fonts/JujutsuKaisen.woff', 'fonts/JujutsuKaisen.ttf', 'samples/aitu.ics', 'wallpapers/manifest.json', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify([...new Set([...files, ...extra])]) });
    },
  };
}

// base './' — сайт работает из любой папки хостинга (GitHub Pages, Netlify, просто файлы).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), wallpapersManifest(), precacheList()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
});
