import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Preload the two fonts the hero needs so text is not delayed behind CSS discovery. */
function preloadCriticalFonts(): Plugin {
  return {
    name: 'preload-critical-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        const wanted = [/clarity-city-latin-800-normal.*\.woff2$/, /inter-latin-wght-normal.*\.woff2$/];
        const tags = Object.keys(ctx.bundle)
          .filter((f) => wanted.some((re) => re.test(f)))
          .map((f) => `<link rel="preload" href="/${f}" as="font" type="font/woff2" crossorigin>`);
        const nl = String.fromCharCode(10);
        return html.replace('</head>', tags.join(nl + '    ') + nl + '  </head>');
      }
    }
  };
}

const blipmadeTarget = process.env.VITE_SNAPTYPE_DEPLOY_TARGET === 'blipmade';
const apiBase = process.env.VITE_API_BASE?.trim();
if (blipmadeTarget && !apiBase) {
  throw new Error(
    'Blipmade web builds require VITE_API_BASE (e.g. https://api.snaptype.org/api/v1) in the release environment before npm run build:web.'
  );
}

export default defineConfig({
  plugins: [react(), preloadCriticalFonts()],
  define: {
    __SNAPTYPE_API_BASE__: JSON.stringify(apiBase || '/api/v1'),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});

