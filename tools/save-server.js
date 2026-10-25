// Nimmt Bilder aus dem Browser entgegen und legt sie in einen Ordner (für tools/icon.html).
// Start: node tools/save-server.js public/icons   →   POST http://localhost:4632/save/<name>.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || '.'), PORT = 4632;

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const m = req.url.match(/^\/save\/([a-z0-9-]+\.png)$/);
  if (req.method !== 'POST' || !m) { res.writeHead(404); return res.end(); }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    fs.writeFileSync(path.join(DIR, m[1]), Buffer.concat(chunks));
    console.log('gespeichert:', path.join(DIR, m[1]));
    res.end('ok');
  });
}).listen(PORT, '127.0.0.1', () => console.log(`speichere nach ${DIR} – Port ${PORT}`));
