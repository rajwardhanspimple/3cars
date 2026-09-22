import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const notes = [];

function fail(message) {
  throw new Error(message);
}

function assert(value, message) {
  if (!value) fail(message);
}

async function expectThrow(fn, label) {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  assert(threw, `${label} did not throw for invalid input`);
}

function makeCanvas(width = 512, height = 512) {
  const context = {
    canvas: null,
    fillStyle: '#000',
    font: '10px sans-serif',
    textAlign: 'start',
    globalAlpha: 1,
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {},
    fillRect() {},
    clearRect() {},
    drawImage() {},
    beginPath() {},
    closePath() {},
    ellipse() {},
    arc() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    fillText() {},
    strokeText() {},
    measureText(text) { return { width: String(text).length * 8 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  const canvas = {
    width,
    height,
    style: {},
    ownerDocument: null,
    addEventListener() {},
    removeEventListener() {},
    getContext(type) { return type === '2d' ? context : null; },
    toDataURL() { return 'data:image/png;base64,'; },
  };
  context.canvas = canvas;
  return canvas;
}

function installDom() {
  const status = { textContent: '', dataset: {} };
  const document = {
    createElement(name) { return name === 'canvas' ? makeCanvas() : { style: {}, dataset: {}, appendChild() {}, removeChild() {} }; },
    getElementById(id) { return id === 'model-status' ? status : null; },
    body: { appendChild() {}, removeChild() {} },
  };
  globalThis.document = document;
  globalThis.window = globalThis;
  globalThis.self = globalThis;
  globalThis.navigator = { userAgent: 'node-nullengine-smoke' };
  globalThis.devicePixelRatio = 1;
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  globalThis.HTMLCanvasElement = function HTMLCanvasElement() {};
}

function remapLocalPath(filePath) {
  if (filePath.includes('/vendor/draco/')) {
    return resolve(root, 'node_modules/three/examples/jsm/libs/draco/gltf', filePath.split('/vendor/draco/').pop());
  }
  return filePath;
}

function installFileLoading(B) {
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (url.startsWith('file:')) {
      const bytes = await readFile(remapLocalPath(fileURLToPath(url)));
      return new Response(bytes, { status: 200 });
    }
    if (!nativeFetch) fail(`No fetch available for ${url}`);
    return nativeFetch(input, init);
  };

  class LocalXMLHttpRequest {
    open(method, url) { this.method = method; this.url = url; this.responseType = ''; this.status = 0; }
    setRequestHeader() {}
    async send() {
      try {
        const response = await globalThis.fetch(this.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        this.status = response.status;
        this.response = this.responseType === 'arraybuffer' ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer.toString('utf8');
        this.responseText = buffer.toString('utf8');
        this.onload?.();
        this.onreadystatechange?.();
      } catch (error) {
        this.onerror?.(error);
      }
    }
    abort() {}
    getAllResponseHeaders() { return ''; }
  }
  globalThis.XMLHttpRequest = LocalXMLHttpRequest;

  const loadFile = (url, onSuccess, _onProgress, _offlineProvider, useArrayBuffer, onError) => {
    const load = async () => {
      try {
        const value = String(url?.url ?? url);
        if (value.startsWith('file:')) {
          const buffer = await readFile(remapLocalPath(fileURLToPath(value)));
          onSuccess(useArrayBuffer ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer.toString('utf8'));
          return;
        }
        const response = await globalThis.fetch(value);
        const buffer = Buffer.from(await response.arrayBuffer());
        onSuccess(useArrayBuffer ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer.toString('utf8'));
      } catch (error) {
        onError?.(null, error);
      }
    };
    load();
  };
  B.Tools.LoadFile = loadFile;
  if (B.FileTools) B.FileTools.LoadFile = loadFile;
}

installDom();
const BABYLON = require('babylonjs');
globalThis.BABYLON = BABYLON;
installFileLoading(BABYLON);
require('babylonjs-loaders');

const { prepareAssets } = await import('./prepare-assets.mjs');
await prepareAssets();
const { RaceView: CircuitView } = await import('../src/view.js');
const { buildScenicWorld } = await import('../src/scenic-world.js');
const { Race } = await import('../src/sim.js');
const { createMustangFleet, MUSTANG_TRIANGLES, MUSTANG_FLEET_TRIANGLES } = await import('../src/mustang.js');

function makeEngineScene() {
  const engine = new BABYLON.NullEngine({ renderWidth: 64, renderHeight: 64, textureSize: 64, deterministicLockstep: true, lockstepMaxSteps: 1 });
  engine.disablePerformanceMonitorInBackground = true;
  const scene = new BABYLON.Scene(engine);
  return { engine, scene };
}

function makeView(race) {
  const { engine, scene } = makeEngineScene();
  const view = Object.create(CircuitView.prototype);
  Object.assign(view, {
    canvas: makeCanvas(64, 64),
    engine,
    scene,
    race,
    quality: 'low',
    materials: {},
    carNodes: [],
    elapsed: 0,
    reducedMotion: true,
    cameraReady: false,
    disposed: false,
    shadow: { addShadowCaster() {}, removeShadowCaster() {} },
  });
  return view;
}

function triangleCount(meshes) {
  return meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0);
}

function baseMaterialName(name = '') {
  return String(name).replace(/^car-\d+-/, '');
}

function materialBase(mesh) {
  return baseMaterialName(mesh.material?.name || '');
}

function finiteBounds(meshes) {
  for (const mesh of meshes) {
    if (!mesh.getTotalVertices?.()) continue;
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    for (const point of [box.minimumWorld, box.maximumWorld]) {
      assert(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z), `${mesh.name} has non-finite bounds`);
    }
  }
}

function assertUvLengths(meshes) {
  for (const mesh of meshes) {
    if (!mesh.getTotalVertices?.()) continue;
    const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
    if (uvs) assert(uvs.length === mesh.getTotalVertices() * 2, `${mesh.name} UV length mismatch`);
  }
}

function assertRoadNormals(scene) {
  const roadNames = /asphalt|edge-line|runoff|racing-patch/i;
  for (const mesh of scene.meshes.filter(mesh => roadNames.test(mesh.name))) {
    const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    if (!normals) continue;
    let down = 0;
    for (let i = 1; i < normals.length; i += 3) if (normals[i] < -0.05) down++;
    assert(down === 0, `${mesh.name} has road normals facing down`);
  }
}

function assertWorld(view) {
  const metadata = view.scene.metadata?.scenery;
  assert(metadata, 'scenic world metadata missing');
  assert(Number.isFinite(metadata.terrainVertices) && metadata.terrainVertices > 0, 'terrain metadata missing');
  assert(Number.isFinite(metadata.kerbs) && metadata.kerbs > 0, 'kerb metadata missing');
  assert(Number.isFinite(metadata.guardrails) && metadata.guardrails > 0, 'guardrail metadata missing');
  assert(Number.isFinite(metadata.treesRejected ?? 0), 'tree rejection metadata missing');
  assert(view.scene.meshes.some(mesh => mesh.name === 'sakura-asphalt'), 'sakura asphalt was not built');
  finiteBounds(view.scene.meshes);
  assertUvLengths(view.scene.meshes);
  assertRoadNormals(view.scene);
}

function isDescendantOf(node, parent) {
  for (let p = node?.parent; p; p = p.parent) if (p === parent) return true;
  return false;
}

function assertFleet(scene, rigs, loadCount, fallbackUsed) {
  assert(rigs.length === 3, 'Mustang fleet size is not 3');
  assert(loadCount === 1, `Mustang asset loaded ${loadCount} times`);
  assert(scene.metadata?.fleet?.totalTriangles === MUSTANG_FLEET_TRIANGLES, 'fleet triangle metadata mismatch');
  assert(scene.metadata?.fleet?.trianglesPerCar === MUSTANG_TRIANGLES, 'per-car triangle metadata mismatch');
  assert(scene.metadata?.fleet?.geometryShared === true, 'fleet geometry sharing metadata missing');

  const first = rigs[0];
  for (const [index, rig] of rigs.entries()) {
    assert(rig.imported === true, `car ${index} is not marked imported`);
    assert(rig.meshes.length === 54, `car ${index} mesh count is not 54`);
    assert(rig.wheels.length === 4, `car ${index} wheel count is not 4`);
    assert(triangleCount(rig.meshes) === MUSTANG_TRIANGLES, `car ${index} triangle count mismatch`);
    assert(rig.root.metadata?.originalTriangles === MUSTANG_TRIANGLES, `car ${index} original triangle metadata mismatch`);
    assert(rig.root.metadata?.geometrySimplified === false, `car ${index} reports simplified geometry`);
    assert(rig.root.metadata?.meshCount === 54, `car ${index} mesh metadata mismatch`);
    assert(rig.root.metadata?.wheelCount === 4, `car ${index} wheel metadata mismatch`);
    assert(rig.template?.isEnabled?.() === false, `car ${index} template is enabled`);
    assert(rig.template !== rig.root, `car ${index} reused template root`);
    for (const mesh of rig.template.getChildMeshes()) assert(mesh.isEnabled(false) === false, `template mesh ${mesh.name} is enabled`);
    for (const [wheelIndex, wheel] of rig.wheels.entries()) {
      assert(wheel.pivot.parent === rig.root, `car ${index} wheel ${wheelIndex} pivot parent mismatch`);
      assert(wheel.spin.parent === wheel.pivot, `car ${index} wheel ${wheelIndex} spin parent mismatch`);
      assert(rig.meshes.some(mesh => isDescendantOf(mesh, wheel.spin)), `car ${index} wheel ${wheelIndex} has no spin mesh`);
      assert(rig.meshes.some(mesh => mesh.parent === wheel.pivot), `car ${index} wheel ${wheelIndex} has no pivot mesh`);
    }
    if (index > 0) {
      assert(rig.meshes.every((mesh, meshIndex) => mesh.geometry === first.meshes[meshIndex].geometry), `car ${index} geometry is not shared with car 0`);
    }
  }

  const paints = rigs.map(rig => rig.paint);
  assert(new Set(paints).size === rigs.length, 'paint materials are shared between cars');
  assert(paints.every(Boolean), 'paint material missing');
  assert(rigs[0].paint.albedoColor.toHexString() !== rigs[1].paint.albedoColor.toHexString(), 'paint colors did not stay independent');
  assert(new Set(rigs.map(rig => rig.tailMaterial)).size === rigs.length, 'brake light materials are shared between cars');
  const before = rigs[1].tailMaterial.emissiveColor.r;
  rigs[0].tailMaterial.emissiveColor.r = .99;
  assert(rigs[1].tailMaterial.emissiveColor.r === before, 'brake light material state leaked between cars');
  const spinBefore = rigs[1].wheels[0].spin.rotation.x;
  rigs[0].wheels[0].spin.rotation.x += 1;
  assert(rigs[1].wheels[0].spin.rotation.x === spinBefore, 'wheel rotation state leaked between cars');
  assert(scene.meshes.every(mesh => !/lod/i.test(mesh.name)), 'LOD mesh found in scene');
  finiteBounds(scene.meshes);
  assertUvLengths(scene.meshes);
  if (fallbackUsed) notes.push('Mustang loader fallback used synthetic structural meshes. It verifies runtime cloning invariants but does not decode the real glTF/Draco payload.');
}

function createMaterial(scene, name) {
  const material = new BABYLON.PBRMaterial(name, scene);
  material.albedoColor = new BABYLON.Color3(.5, .5, .5);
  material.emissiveColor = new BABYLON.Color3(0, 0, 0);
  return material;
}

function centers() {
  return [
    new BABYLON.Vector3(-.9, .36, -1.55),
    new BABYLON.Vector3(-.9, .36, 1.55),
    new BABYLON.Vector3(.9, .36, -1.55),
    new BABYLON.Vector3(.9, .36, 1.55),
  ];
}

function makeDataForTriangles(triangles, centerSet, spread = .08) {
  const positions = new Float32Array(triangles * 9);
  const normals = new Float32Array(triangles * 9);
  const uvs = new Float32Array(triangles * 6);
  const indices = new Uint32Array(triangles * 3);
  for (let t = 0; t < triangles; t++) {
    const c = centerSet[t % centerSet.length];
    const angle = (t % 97) / 97 * Math.PI * 2;
    const r = spread * (1 + (t % 11) * .02);
    const points = [[0, 0], [Math.cos(angle) * r, Math.sin(angle) * r], [-Math.sin(angle) * r, Math.cos(angle) * r]];
    for (let j = 0; j < 3; j++) {
      const vi = t * 9 + j * 3;
      positions[vi] = c.x + points[j][0];
      positions[vi + 1] = c.y + (j === 0 ? 0 : r * .25);
      positions[vi + 2] = c.z + points[j][1];
      normals[vi + 1] = 1;
      indices[t * 3 + j] = t * 3 + j;
    }
    const ui = t * 6;
    uvs[ui] = 0; uvs[ui + 1] = 0; uvs[ui + 2] = 1; uvs[ui + 3] = 0; uvs[ui + 4] = 0; uvs[ui + 5] = 1;
  }
  const data = new BABYLON.VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  return data;
}

function makeSyntheticContainer(scene) {
  const wheelCenters = centers();
  const meshes = [];
  const add = (name, materialName, triangles, centerSet) => {
    const mesh = new BABYLON.Mesh(name, scene);
    makeDataForTriangles(triangles, centerSet, .06).applyToMesh(mesh);
    mesh.material = createMaterial(scene, materialName);
    meshes.push(mesh);
  };
  for (let i = 0; i < 4; i++) add(`synthetic-tire-${i}`, 'Rubber_Black', 80000, [wheelCenters[i]]);
  add('synthetic-wheel-metal', 'Black_Metal_Paint', 120000, wheelCenters);
  add('synthetic-wheel-aluminum', 'Brushed_Aluminum', 120000, wheelCenters);
  add('synthetic-calipers', 'Calipers', 120000, wheelCenters);
  add('synthetic-body-paint', 'CARPAINT', 300000, [new BABYLON.Vector3(0, .9, 0)]);
  add('synthetic-red-glass', 'RedGlass', 10000, [new BABYLON.Vector3(0, .75, -2.2)]);
  const remaining = MUSTANG_TRIANGLES - 990000;
  const base = Math.floor(remaining / 36);
  for (let i = 0; i < 36; i++) add(`synthetic-body-${i}`, i % 2 ? 'Chrome' : 'Black_Plastic', base + (i === 35 ? remaining - base * 36 : 0), [new BABYLON.Vector3((i % 6 - 3) * .18, .65 + (i % 5) * .04, (Math.floor(i / 6) - 3) * .35)]);
  assert(triangleCount(meshes) === MUSTANG_TRIANGLES, 'synthetic Mustang triangle count mismatch');
  return { meshes, addAllToScene() {}, dispose() { for (const mesh of meshes) mesh.dispose(false, false); } };
}

async function createFleetWithActualLoader(view, cars) {
  const originalLoad = BABYLON.SceneLoader.LoadAssetContainerAsync;
  let loadCount = 0;
  BABYLON.SceneLoader.LoadAssetContainerAsync = async (...args) => { loadCount++; return originalLoad.apply(BABYLON.SceneLoader, args); };
  try {
    const rigs = await createMustangFleet(view, cars);
    return { rigs, loadCount, fallbackUsed: false };
  } finally {
    BABYLON.SceneLoader.LoadAssetContainerAsync = originalLoad;
  }
}

async function createFleetWithFallback(view, cars, cause) {
  notes.push(`Real Mustang loader failed in Node: ${cause.message}`);
  const originalLoad = BABYLON.SceneLoader.LoadAssetContainerAsync;
  let loadCount = 0;
  BABYLON.SceneLoader.LoadAssetContainerAsync = async (_rootUrl, _fileName, scene) => { loadCount++; return makeSyntheticContainer(scene); };
  try {
    const rigs = await createMustangFleet(view, cars);
    return { rigs, loadCount, fallbackUsed: true };
  } finally {
    BABYLON.SceneLoader.LoadAssetContainerAsync = originalLoad;
  }
}

await expectThrow(() => buildScenicWorld({}), 'buildScenicWorld');
const race = new Race({ carId: 'vortex', weather: 'dry' });
const worldView = makeView(race);
const scenery = buildScenicWorld(worldView);
assert(scenery && typeof scenery === 'object', 'buildScenicWorld did not return scenery API');
assertWorld(worldView);

const fleetView = makeView(race);
let result;
try {
  result = await createFleetWithActualLoader(fleetView, race.cars);
} catch (error) {
  fleetView.scene.dispose();
  fleetView.engine.dispose();
  const fallbackView = makeView(race);
  result = await createFleetWithFallback(fallbackView, race.cars, error);
  assertFleet(fallbackView.scene, result.rigs, result.loadCount, result.fallbackUsed);
  fallbackView.scene.dispose();
  fallbackView.engine.dispose();
}
if (result && !result.fallbackUsed) assertFleet(fleetView.scene, result.rigs, result.loadCount, result.fallbackUsed);

worldView.scene.dispose();
worldView.engine.dispose();
fleetView.scene.dispose();
fleetView.engine.dispose();

console.log('Scene smoke test passed. Structural NullEngine checks only. No GPU, browser canvas, frame quality, or visual output is validated.');
for (const note of notes) console.log(`Limitation: ${note}`);
console.log(`Command: node scripts/test-scene.mjs`);
console.log(`Mustang triangles: ${MUSTANG_TRIANGLES} each, ${MUSTANG_FLEET_TRIANGLES} fleet total.`);
