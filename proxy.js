/**
 * Simple HTTP proxy that forwards requests to console.estream.dev
 * Used for testing when Seeker doesn't have direct internet access
 * 
 * Usage: node proxy.js
 * Then Seeker can reach http://localhost:8080/api/... 
 * which forwards to https://console.estream.dev/api/...
 */

const http = require('http');
const https = require('https');

const TARGET_HOST = 'console.estream.dev';
const LOCAL_PORT = 8080;

const server = http.createServer((req, res) => {
  console.log(`[Proxy] ${req.method} ${req.url}`);
  
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Collect request body
  let body = [];
  req.on('data', chunk => body.push(chunk));
  req.on('end', () => {
    body = Buffer.concat(body);
    
    // Forward to console.estream.dev
    const options = {
      hostname: TARGET_HOST,
      port: 443,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: TARGET_HOST,
      },
    };
    
    // Remove headers that cause issues
    delete options.headers['host'];
    delete options.headers['connection'];
    
    const proxyReq = https.request(options, (proxyRes) => {
      console.log(`[Proxy] <- ${proxyRes.statusCode}`);
      
      // Copy response headers
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (e) => {
      console.error(`[Proxy] Error: ${e.message}`);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Proxy error', details: e.message }));
    });
    
    if (body.length > 0) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });
});

server.listen(LOCAL_PORT, '0.0.0.0', () => {
  console.log(`[Proxy] Listening on port ${LOCAL_PORT}`);
  console.log(`[Proxy] Forwarding to https://${TARGET_HOST}`);
  console.log(`[Proxy] ADB reverse should map device:8080 -> laptop:8080`);
  console.log('');
  console.log('From Seeker, requests to http://localhost:8080/api/...');
  console.log('will be forwarded to https://console.estream.dev/api/...');
});
