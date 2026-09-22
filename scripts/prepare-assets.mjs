import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const assetPath = resolve(root, 'assets/mustang-2015.gltf');
const assetUrl = 'https://raw.githubusercontent.com/ViktorVelizarov/Custom-Cars-3D/f3196e7c2f59e093ffdf891dd72a8428ce4d0fe4/public/mustang.gltf';
const expectedSha256 = '7bc4cd2e0e71730235b31cd5aa521e5511be81f61fa5b2da2bb62a9d478b7396';
const expectedBytes = 4562323;
const expectedTriangles = 1493119;
const expectedExtras = {
  title: 'Ford Mustang 2015 EDITION',
  authorPrefix: 'WARENTERTAINMENT',
  authorProfileUrl: 'https://sketchfab.com/WarEntertainment',
  license: 'CC-BY-4.0'
};

const retryCount = 2;
const timeoutMs = 30000;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function includesValue(source, expected) {
  return normalizeWhitespace(source).includes(expected);
}

function validateAuthor(author) {
  const normalizedAuthor = normalizeWhitespace(author);
  if (!normalizedAuthor.startsWith(expectedExtras.authorPrefix)) {
    throw new Error(`Asset author mismatch. Expected author to start with ${expectedExtras.authorPrefix}.`);
  }
  if (!normalizedAuthor.includes(expectedExtras.authorProfileUrl)) {
    throw new Error(`Asset author mismatch. Expected author profile URL ${expectedExtras.authorProfileUrl}.`);
  }
}

function validateMetadata(gltf) {
  const extras = gltf?.asset?.extras ?? {};
  const extrasText = JSON.stringify(extras);
  const title = extras.title ?? extras.name ?? extras.model ?? extrasText;
  const author = extras.author ?? extras.creator ?? extrasText;
  const license = extras.license ?? extras.licenseType ?? extrasText;

  if (!includesValue(title, expectedExtras.title)) throw new Error(`Asset title mismatch. Expected ${expectedExtras.title}.`);
  validateAuthor(author);
  if (!includesValue(license, expectedExtras.license)) throw new Error(`Asset license mismatch. Expected ${expectedExtras.license}.`);
}

function validateEmbeddedUris(gltf) {
  const badBuffers = (gltf.buffers ?? [])
    .map((buffer, index) => ({ index, uri: buffer.uri }))
    .filter(({ uri }) => typeof uri === 'string' && !uri.startsWith('data:'));
  const badImages = (gltf.images ?? [])
    .map((image, index) => ({ index, uri: image.uri }))
    .filter(({ uri }) => typeof uri === 'string' && !uri.startsWith('data:'));

  if (badBuffers.length || badImages.length) {
    const bad = [
      ...badBuffers.map(({ index, uri }) => `buffers[${index}].uri=${uri}`),
      ...badImages.map(({ index, uri }) => `images[${index}].uri=${uri}`)
    ].join(', ');
    throw new Error(`Unapproved external asset URI(s): ${bad}`);
  }
}

function validateTriangleCount(gltf) {
  let triangles = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const mode = primitive.mode ?? 4;
      if (mode !== 4) continue;
      if (!Number.isInteger(primitive.indices)) throw new Error('Triangle primitive has no indices accessor.');
      const accessor = gltf.accessors?.[primitive.indices];
      if (!accessor || !Number.isFinite(accessor.count)) throw new Error(`Missing indices accessor ${primitive.indices}.`);
      if (accessor.count % 3 !== 0) throw new Error(`Indices accessor ${primitive.indices} count is not divisible by 3.`);
      triangles += accessor.count / 3;
    }
  }

  if (triangles !== expectedTriangles) {
    throw new Error(`Triangle count mismatch. Expected ${expectedTriangles}, got ${triangles}.`);
  }
}

function validateAsset(bytes) {
  if (bytes.byteLength !== expectedBytes) throw new Error(`Asset byte size mismatch. Expected ${expectedBytes}, got ${bytes.byteLength}.`);
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== expectedSha256) throw new Error(`Asset SHA256 mismatch. Expected ${expectedSha256}, got ${actualSha256}.`);

  const gltf = JSON.parse(Buffer.from(bytes).toString('utf8'));
  validateMetadata(gltf);
  validateEmbeddedUris(gltf);
  validateTriangleCount(gltf);
  return { path: assetPath, sha256: actualSha256, bytes: bytes.byteLength, triangles: expectedTriangles };
}

async function readCachedAsset() {
  try {
    return validateAsset(await readFile(assetPath));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cached asset at ${assetPath} is invalid. Delete it and rerun npm run assets to download the pinned source again. ${message}`, { cause: error });
  }
}

async function fetchAssetOnce() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(assetUrl, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`Asset download failed with HTTP ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAssetWithRetries() {
  let lastError;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await fetchAssetOnce();
    } catch (error) {
      lastError = error;
      if (attempt < retryCount) await new Promise((resolveRetry) => setTimeout(resolveRetry, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function prepareAssets() {
  await mkdir(dirname(assetPath), { recursive: true });
  const cached = await readCachedAsset();
  if (cached) return cached;

  const tempPath = `${assetPath}.tmp-${process.pid}`;
  try {
    const bytes = await fetchAssetWithRetries();
    const result = validateAsset(bytes);
    await writeFile(tempPath, bytes, { flag: 'wx' });
    await rename(tempPath, assetPath);
    return result;
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;

if (isDirectRun) {
  prepareAssets()
    .then((result) => {
      console.log(`Prepared ${result.path}`);
      console.log(`SHA256 ${result.sha256}`);
      console.log(`Triangles ${result.triangles}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
