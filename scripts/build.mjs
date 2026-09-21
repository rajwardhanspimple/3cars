import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/vendor', { recursive: true });
for (const file of ['index.html', 'styles.css', 'src']) await cp(file, `dist/${file}`, { recursive: true });
await cp('node_modules/babylonjs/babylon.js', 'dist/vendor/babylon.js');
console.log('Built dist/. Serve over HTTP. No runtime network dependencies.');
