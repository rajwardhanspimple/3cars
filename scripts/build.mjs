import { cp, mkdir, rm } from 'node:fs/promises';
import { prepareAssets } from './prepare-assets.mjs';

await prepareAssets();

await rm('dist', { recursive: true, force: true });
await mkdir('dist/vendor/draco', { recursive: true });
for (const file of ['index.html', 'styles.css', 'src', 'assets']) await cp(file, `dist/${file}`, { recursive: true });
await cp('node_modules/babylonjs/babylon.js', 'dist/vendor/babylon.js');
await cp('node_modules/babylonjs-loaders/babylonjs.loaders.min.js', 'dist/vendor/babylonjs.loaders.min.js');
for (const file of ['draco_wasm_wrapper.js', 'draco_decoder.wasm', 'draco_decoder.js']) {
  await cp(`node_modules/three/examples/jsm/libs/draco/gltf/${file}`, `dist/vendor/draco/${file}`);
}
try {
  await cp('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
console.log('Built dist/. Serve over HTTP. No runtime network dependencies.');
