import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// Allow fetching academic literature PDFs through local/development proxy
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// PDF Proxy Vite Plugin to bypass browser CORS for academic literature PDFs
function pdfProxyPlugin() {
  return {
    name: 'pdf-cors-proxy',
    configureServer(server) {
      server.middlewares.use('/api/pdf-proxy', async (req, res) => {
        try {
          const reqUrl = new URL(req.url, 'http://localhost');
          const targetUrl = reqUrl.searchParams.get('url');
          if (!targetUrl) {
            res.statusCode = 400;
            res.end('Missing url parameter');
            return;
          }

          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          if (!response.ok) {
            res.statusCode = response.status;
            res.end(`Failed to fetch remote PDF: ${response.statusText}`);
            return;
          }

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', response.headers.get('content-type') || 'application/pdf');
          const arrayBuffer = await response.arrayBuffer();
          res.end(Buffer.from(arrayBuffer));
        } catch (err) {
          res.statusCode = 500;
          res.end(`Proxy error: ${err?.message || err}`);
        }
      });
    }
  };
}

// https://astro.build/config
export default defineConfig({
  integrations: [svelte()],
  vite: {
    plugins: [pdfProxyPlugin()]
  }
});
