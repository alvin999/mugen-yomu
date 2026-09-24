import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// Allow fetching academic literature PDFs through local/development proxy
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          let parsedTarget = null;
          try {
            parsedTarget = new URL(targetUrl);
          } catch {
            clearTimeout(timeoutId);
            res.statusCode = 400;
            res.end('Invalid target URL');
            return;
          }

          const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'application/pdf, application/octet-stream, */*',
              'Referer': parsedTarget.origin ? `${parsedTarget.origin}/` : 'https://arxiv.org/',
              'Accept-Language': 'en-US,en;q=0.9'
            }
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            res.statusCode = response.status;
            res.end(`Failed to fetch remote PDF (HTTP ${response.status}): ${response.statusText}`);
            return;
          }

          const contentType = response.headers.get('content-type') || 'application/pdf';
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', contentType);
          const arrayBuffer = await response.arrayBuffer();
          res.end(Buffer.from(arrayBuffer));
        } catch (err) {
          const isAbort = err?.name === 'AbortError';
          res.statusCode = isAbort ? 504 : 500;
          res.end(`Proxy error: ${isAbort ? '遠端 PDF 下載逾時 (15s)' : (err?.message || err)}`);
        }
      });

      server.middlewares.use('/api/html-proxy', async (req, res) => {
        try {
          const reqUrl = new URL(req.url, 'http://localhost');
          const targetUrl = reqUrl.searchParams.get('url');
          if (!targetUrl) {
            res.statusCode = 400;
            res.end('Missing url parameter');
            return;
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            res.statusCode = response.status;
            res.end(`Failed to fetch HTML (HTTP ${response.status})`);
            return;
          }

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          const htmlText = await response.text();
          res.end(htmlText);
        } catch (err) {
          res.statusCode = 500;
          res.end(`HTML Proxy error: ${err?.message || err}`);
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
