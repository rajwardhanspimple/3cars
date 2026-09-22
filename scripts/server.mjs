import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : undefined) || Number(process.env.PORT) || 5173;
const host = process.env.HOST || '127.0.0.1';
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.gltf': 'model/gltf+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm'
};
const binaryTypes = new Set(['.png', '.wasm']);
const vendorRoutes = new Map([
  ['/vendor/babylon.js', 'node_modules/babylonjs/babylon.js'],
  ['/vendor/babylonjs.loaders.min.js', 'node_modules/babylonjs-loaders/babylonjs.loaders.min.js'],
  ['/vendor/draco/draco_wasm_wrapper.js', 'node_modules/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js'],
  ['/vendor/draco/draco_decoder.wasm', 'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm'],
  ['/vendor/draco/draco_decoder.js', 'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js']
]);

function contentType(file) {
  const extension = extname(file);
  const type = mime[extension] || 'application/octet-stream';
  return binaryTypes.has(extension) ? type : `${type}; charset=utf-8`;
}

const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = vendorRoutes.get(pathname) ?? (pathname === '/' ? 'index.html' : pathname.slice(1));
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep) || relative.startsWith('.') || relative.includes('/.')) { res.writeHead(403); res.end(); return; }
    if (!(await stat(file)).isFile()) throw new Error('Not found');
    res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); }
});
server.listen(port, host, () => console.log(`3cars: http://${host}:${port}`));
