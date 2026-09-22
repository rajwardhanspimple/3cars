// Optional world builder. Track selection remains the caller's responsibility.
// Babylon.js 7.54.3 core only; no downloads, canvas, probes or car geometry edits.
import { HALF_WIDTH, BARRIER, clamp } from './sim.js';
import { mountainLayout, roadHeight, roadPose, surfaceRoughness } from './mountain-layout.js';
import { applyCelShading, registerCelPalette } from './cel-shading.js';

const B = globalThis.BABYLON;
const vec = (x = 0, y = 0, z = 0) => new B.Vector3(x, y, z);
const rgb = hex => B.Color3.FromHexString(hex);
export const CITY = Object.freeze({ id: 'anime-night-city-v1', name: 'Midnight City', preview: true });
// Match mountain-world's visible rail centre, including its 5 cm inset.
export const CITY_BARRIER_OFFSET = BARRIER - .05;
const NEON = ['#ff409e', '#35d9ff', '#a881ff'];
function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
const surfaceAt = distance => distance <= HALF_WIDTH ? 'asphalt' : distance <= HALF_WIDTH + .45 ? 'curb' : distance <= HALF_WIDTH + 4 ? 'grass' : 'dirt';
function roadY(x, z, surface) { return roadHeight(x, z) + surfaceRoughness(x, z, surface).height; }
function pose(node, x, z, yaw = 0, lift = 0, tilt = 0) {
 const p = roadPose(x, z, yaw);
 node.position.set(x, p.y + lift, z); node.rotation.set(p.pitch, yaw, p.roll + tilt);
}
function mark(mesh, role, details = {}) {
 mesh.isPickable = false; mesh.metadata = { ...mesh.metadata, cityWorld: true, role, ...details }; return mesh;
}
function solidMaterial(scene, name, hex) {
 const mat = new B.StandardMaterial(name, scene);
 mat.diffuseColor = rgb(hex); mat.specularColor = B.Color3.Black(); return mat;
}
function emission(scene, name, hex, texture = null, blend = false) {
 const mat = new B.StandardMaterial(name, scene);
 mat.disableLighting = true; mat.diffuseColor = B.Color3.Black(); mat.specularColor = B.Color3.Black();
 mat.emissiveColor = rgb(hex); mat.emissiveTexture = texture;
 if (blend) {
  mat.diffuseTexture = texture; mat.useAlphaFromDiffuseTexture = true;
  mat.transparencyMode = B.Material.MATERIAL_ALPHABLEND; mat.alphaMode = B.Engine.ALPHA_ADD;
  mat.disableDepthWrite = true;
 }
 return mat;
}
function rawTexture(scene, counts, name, width, height, pixel, alpha = false) {
 const data = new Uint8Array(width * height * 4);
 for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
 const texture = B.RawTexture.CreateRGBATexture(data, width, height, scene, false, false, B.Texture.BILINEAR_SAMPLINGMODE);
 texture.name = name; texture.hasAlpha = alpha; texture.wrapU = texture.wrapV = B.Texture.WRAP_ADDRESSMODE;
 counts.proceduralTextureBytes += data.byteLength; counts.proceduralTextures++;
 return texture;
}
// Each pool has one unit geometry/material. Instances, including moving props,
// keep that geometry and are never rebuilt during update().
function pools(scene, counts) {
 const sources = new Map();
 return {
  add(key, material, shape = 'box') {
   const source = shape === 'cylinder'
    ? B.MeshBuilder.CreateCylinder(`city-template-${key}`, { height: 1, diameter: 1, tessellation: 12 }, scene)
    : B.MeshBuilder.CreateBox(`city-template-${key}`, { size: 1 }, scene);
   source.material = material; source.isVisible = false; mark(source, 'template', { template: true });
   sources.set(key, source); counts.instanceSources++; return source;
  },
  instance(key, name, size, position, yaw = 0, details = {}, parent = null) {
   const mesh = sources.get(key).createInstance(name);
   mesh.isVisible = true; mesh.scaling.set(...size); mesh.position.set(...position); mesh.rotation.y = yaw;
   mesh.parent = parent; mark(mesh, 'solid', details); counts.instances++; return mesh;
  }
 };
}
function meshData(scene, name, positions, indices, uvs, material, role = 'surface') {
 const normals = []; B.VertexData.ComputeNormals(positions, indices, normals);
 // All these batches are ground-facing strips. Babylon uses clockwise faces.
 let sum = 0; for (let i = 1; i < normals.length; i += 3) sum += normals[i];
 if (sum < 0) {
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  B.VertexData.ComputeNormals(positions, indices, normals);
 }
 const mesh = new B.Mesh(name, scene), data = new B.VertexData();
 data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs;
 data.applyToMesh(mesh); mesh.material = material; mark(mesh, role); mesh.freezeWorldMatrix(); return mesh;
}
// Build a single batch from one or more road-following patches. All vertices use
// the existing centreline and shared physical roughness. No flat decals cut hills.
function patches(view, name, spans, material, lift = .012) {
 const positions = [], indices = [], uvs = [], track = view.race.track;
 for (const span of spans) {
  const { start, end, left, right, surface = 'asphalt', repeat = 1 } = span;
  const steps = Math.max(1, Math.ceil((end - start) / 2));
  const columns = Math.max(1, Math.ceil((right - left) / 3));
  const base = positions.length / 3;
  for (let row = 0; row <= steps; row++) {
   const s = start + (end - start) * row / steps;
   for (let col = 0; col <= columns; col++) {
    const offset = left + (right - left) * col / columns, p = track.at(s, offset);
    positions.push(p.x, roadY(p.x, p.z, surface) + lift, p.z);
    uvs.push(col / columns, (s - start) / repeat);
    if (row < steps && col < columns) {
     const a = base + row * (columns + 1) + col, b = a + 1, c = a + columns + 1;
     indices.push(a, c, b, b, c, c + 1);
    }
   }
  }
 }
 return meshData(view.scene, name, positions, indices, uvs, material);
}
function addGround(view, material, counts) {
 const { centerX, centerZ } = view.race.track.bounds;
 const cells = view.quality === 'high' ? 48 : 32, size = 1040, step = size / cells;
 const ox = centerX - size / 2, oz = centerZ - size / 2, positions = [], indices = [], uvs = [];
 for (let z = 0; z <= cells; z++) for (let x = 0; x <= cells; x++) {
  const wx = ox + x * step, wz = oz + z * step;
  positions.push(wx, roadHeight(wx, wz) - .16, wz); uvs.push(x, z);
 }
 for (let z = 0; z < cells; z++) for (let x = 0; x < cells; x++) {
  const a = z * (cells + 1) + x, b = a + 1, c = a + cells + 1;
  indices.push(a, c, b, b, c, c + 1);
 }
 meshData(view.scene, 'city-ground', positions, indices, uvs, material);
 const height = (x, z) => positions[(z * (cells + 1) + x) * 3 + 1];
 view.sceneryGroundHeight = (x, z) => {
  const fx = clamp((x - ox) / step, 0, cells - 1e-8), fz = clamp((z - oz) / step, 0, cells - 1e-8);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const a = height(ix, iz), b = height(ix + 1, iz), c = height(ix, iz + 1), d = height(ix + 1, iz + 1);
  return tx + tz <= 1 ? a * (1 - tx - tz) + b * tx + c * tz : b * (1 - tz) + c * (1 - tx) + d * (tx + tz - 1);
 };
 counts.terrainVertices = positions.length / 3; counts.groundHeightSampler = 'triangle-barycentric-city-grid';
}
function addRoad(view, counts) {
 const scene = view.scene, length = view.race.track.length;
 const asphalt = new B.PBRMaterial('city-asphalt', scene);
 asphalt.albedoColor = rgb('#25314b'); asphalt.roughness = .24; asphalt.metallic = .12;
 asphalt.metadata = { celPaletteKey: 'asphalt' }; view.roadMaterial = asphalt;
 const full = (left, right, surface = 'asphalt') => [{ start: 0, end: length, left, right, surface, repeat: 32 }];
 patches(view, 'city-asphalt', full(-HALF_WIDTH, HALF_WIDTH), asphalt, 0);
 const white = solidMaterial(scene, 'city-lane-paint', '#bbcde6');
 const yellow = solidMaterial(scene, 'city-centre-paint', '#ffcb78');
 for (const side of [-1, 1]) {
  const limits = [side * (HALF_WIDTH - .4), side * (HALF_WIDTH - .2)].sort((a, b) => a - b);
  patches(view, `city-edge-${side}`, full(...limits), white);
 }
 const dashes = [];
 for (let s = 0; s < length; s += 12) dashes.push({ start: s, end: Math.min(s + 5, length), left: -.12, right: .12, repeat: 5 });
 patches(view, 'city-centre-dashes', dashes, yellow);
 // Keep the simulation's curb/grass/dirt bands visibly distinct. The city has
 // narrow planted verges, not asphalt shoulders with unexplained low grip.
 const bands = [[HALF_WIDTH, HALF_WIDTH + .45, 'curb', '#697287'], [HALF_WIDTH + .45, HALF_WIDTH + 4, 'grass', '#263c3c'], [HALF_WIDTH + 4, BARRIER + 5, 'dirt', '#37313e']];
 for (const [inner, outer, surface, hex] of bands) {
  const mat = solidMaterial(scene, `city-${surface}`, hex);
  for (const side of [-1, 1]) patches(view, `city-${surface}-${side}`, full(...[side * inner, side * outer].sort((a, b) => a - b), surface), mat, 0);
 }
 const rng = random(802), columns = Array.from({ length: 128 }, () => .6 + rng() * .4);
 const reflection = rawTexture(scene, counts, 'city-neon-road-smears', 128, 256, (x, y) => {
  const u = x / 127, edge = Math.pow(Math.abs(u * 2 - 1), 1.1);
  const wave = .5 + .5 * Math.sin(y / 256 * Math.PI * 6 + Math.sin(x * .21));
  const c = rgb(NEON[Math.floor(y / 86) % 3]);
  const intensity = (.12 + edge * .65) * (.18 + wave * .82) * columns[x];
  return [c.r * 255, c.g * 255, c.b * 255, intensity * 85];
 }, true);
 patches(view, 'city-wet-reflection-film', full(-HALF_WIDTH + .45, HALF_WIDTH - .45), emission(scene, 'city-reflection-emission', '#ffffff', reflection, true), .006);
 counts.roadWidth = HALF_WIDTH * 2; counts.roadUsesRoadHeight = true; counts.roadUsesSurfaceRoughness = true;
 counts.laneDashes = dashes.length; counts.reflectionTechnique = 'scrolling-additive-road-conforming-texture';
 return reflection;
}
function addSharedSolids(view, layout, pool, counts) {
 const track = view.race.track;
 for (let s = 0; s < track.length; s += 7.5) for (const side of [-1, 1]) {
  const p = track.at(s, side * CITY_BARRIER_OFFSET);
  const details = { kind: 'guardrail', s, side, barrierOffset: CITY_BARRIER_OFFSET };
  const rail = pool.instance('rail', `city-rail-${side}-${s}`, [.22, .34, 7.7], [0, 0, 0], 0, details);
  pose(rail, p.x, p.z, p.heading, 1.15);
  const post = pool.instance('dark', `city-rail-post-${side}-${s}`, [.16, 1.3, .16], [0, 0, 0], 0, { kind: 'rail-post', s, side });
  pose(post, p.x, p.z, p.heading, .65);
  counts.visibleBarrierRails++; counts.visibleBarrierPosts++;
 }
 for (const wall of layout.walls) {
  const root = new B.TransformNode(`city-wall-root-${wall.id}`, view.scene);
  pose(root, wall.x, wall.z, wall.yaw, 0, wall.tilt || 0);
  pool.instance('concrete', `city-${wall.id}`, [wall.width, wall.height, wall.length], [0, wall.height / 2 - .04, 0], 0, { kind: 'wall', layoutId: wall.id }, root);
 }
 // The simulation still collides with layout.trees. Replace their appearance,
 // not their collision geometry: matching-radius cylindrical city bollards.
 for (const tree of layout.trees) {
  const root = new B.TransformNode(`city-bollard-root-${tree.id}`, view.scene);
  root.position.set(tree.x, roadHeight(tree.x, tree.z), tree.z);
  pool.instance('bollard', `city-collider-${tree.id}`, [tree.radius * 2, 1.6, tree.radius * 2], [0, .8, 0], 0, { kind: 'layout-bollard', layoutId: tree.id, colliderRadius: tree.radius }, root);
  pool.instance('warm', `city-bollard-band-${tree.id}`, [tree.radius * 2.01, .08, tree.radius * 2.01], [0, 1.25, 0], 0, { kind: 'bollard-band' }, root);
 }
 counts.retainingWalls = layout.walls.length; counts.sharedLayoutTreeColliders = layout.trees.length;
 counts.physicsBarrierOffset = CITY_BARRIER_OFFSET; counts.guardrailSegmentLength = 7.7;
 const propNodes = new Map();
 for (const prop of view.race.props || layout.props) {
  const root = new B.TransformNode(`city-prop-${prop.id}`, view.scene);
  root.metadata = { cityWorld: true, layoutId: prop.id };
  if (prop.type === 'sign') {
   pool.instance('dark', `city-sign-post-${prop.id}`, [.18, 2.2, .18], [0, 1.1, 0], 0, { kind: 'prop', layoutId: prop.id }, root);
   pool.instance('sign-1', `city-sign-panel-${prop.id}`, [2.5, 1.05, .12], [0, 2.35, 0], 0, { kind: 'prop', layoutId: prop.id }, root);
  } else {
   pool.instance('cone', `city-cone-${prop.id}`, [.62, 1.15, .62], [0, .58, 0], 0, { kind: 'prop', layoutId: prop.id }, root);
  }
  pose(root, prop.x, prop.z, prop.yaw || 0, 0, prop.tilt || 0); propNodes.set(prop.id, root);
 }
 counts.sharedLayoutProps = propNodes.size; return propNodes;
}
const GLYPHS = {
 T: ['11111','00100','00100','00100','00100','00100','00100'],
 O: ['01110','10001','10001','10001','10001','10001','01110'],
 K: ['10001','10010','10100','11000','10100','10010','10001'],
 Y: ['10001','10001','01010','00100','00100','00100','00100'],
 N: ['10001','11001','11001','10101','10011','10011','10001'],
 I: ['11111','00100','00100','00100','00100','00100','11111'],
 G: ['01111','10000','10000','10111','10001','10001','01111'],
 H: ['10001','10001','10001','11111','10001','10001','10001']
};
function signTexture(scene, counts, text) {
 return rawTexture(scene, counts, `city-sign-${text}`, 128, 64, (x, y) => {
  const col = Math.floor((x - 5) / 4), row = Math.floor((y - 18) / 4), letter = Math.floor(col / 6), bit = ((col % 6) + 6) % 6;
  const glyph = col >= 0 && row >= 0 && row < 7 && GLYPHS[text[letter]]?.[row]?.[bit] === '1';
  const border = x < 3 || x > 124 || y < 3 || y > 60;
  const n = glyph || border ? 255 : 12; return [n, n, n, 255];
 });
}
function addBuildings(view, pool, counts) {
 const scene = view.scene, track = view.race.track, rng = random(4137), litCounts = [];
 for (let variant = 0; variant < 4; variant++) {
  const windows = Array.from({ length: 8 * 16 }, () => rng() > .38);
  litCounts.push(windows.filter(Boolean).length * 6);
  const hue = rgb(['#ffce83', '#9edcff', '#a695ed', '#f0abbd'][variant]);
  const texture = rawTexture(scene, counts, `city-window-grid-${variant}`, 128, 128, (x, y) => {
   const lit = windows[Math.floor(y / 8) * 8 + Math.floor(x / 16)];
   const on = lit && x % 16 >= 4 && x % 16 < 12 && y % 8 >= 2 && y % 8 < 6;
   return on ? [hue.r * 255, hue.g * 255, hue.b * 255, 255] : [0, 0, 0, 255];
  });
  const material = solidMaterial(scene, `city-building-${variant}`, ['#273249', '#313044', '#223448', '#353040'][variant]);
  material.emissiveTexture = texture; material.emissiveColor = new B.Color3(.72, .72, .72);
  pool.add(`building-${variant}`, material);
 }
 for (let s = 6, index = 0; s < track.length; s += 22, index++) for (const side of [-1, 1]) {
  const width = 10 + rng() * 8, depth = 12 + rng() * 9, height = 18 + rng() * 57;
  const setback = 32 + rng() * 17, variant = Math.floor(rng() * 4), p = track.at(s, side * setback);
  // The distance to the entire polyline is 1-Lipschitz. A bounding circle
  // test rejects buildings near OTHER parts of the route, including hairpins.
  const radius = Math.hypot(width, depth) / 2;
  if (track.project(p.x, p.z).distance - radius < BARRIER + 2) continue;
  const root = new B.TransformNode(`city-building-root-${index}-${side}`, scene);
  root.position.set(p.x, roadHeight(p.x, p.z) - .2, p.z); root.rotation.y = p.heading;
  pool.instance(`building-${variant}`, `city-building-${index}-${side}`, [width, height, depth], [0, height / 2, 0], 0, { kind: 'building', footprintRadius: radius, variant }, root);
  counts.buildings++; counts.litWindows += litCounts[variant];
  const neon = index % NEON.length, large = index % 7 === 0;
  const x = -side * (width / 2 + .08);
  // Signs are thin along local X, facing the road; building roots only yaw.
  pool.instance(`sign-${neon}`, `city-neon-panel-${index}-${side}`, [.12, large ? 9 : 3, large ? 8 : 4], [x, large ? 13 : 6, 0], 0, { kind: 'neon-panel' }, root);
  pool.instance(`neon-${neon}`, `city-neon-strip-${index}-${side}`, [.1, .16, depth * .85], [x, height - 1, 0], 0, { kind: 'neon-strip' }, root);
  counts.neonPanels++; counts.neonStrips++; if (large) counts.largeSigns++;
 }
}
function addStreetlights(view, pool, counts) {
 const track = view.race.track, spans = [];
 for (let s = 12; s < track.length; s += 38) for (const side of [-1, 1]) {
  const p = track.at(s, side * (BARRIER + 3));
  if (track.project(p.x, p.z).distance < BARRIER + 2) continue;
  const root = new B.TransformNode(`city-lamp-root-${s}-${side}`, view.scene);
  root.position.set(p.x, roadHeight(p.x, p.z), p.z); root.rotation.y = p.heading;
  pool.instance('dark', `city-lamp-pole-${s}-${side}`, [.18, 7.5, .18], [0, 3.75, 0], 0, { kind: 'streetlight' }, root);
  pool.instance('dark', `city-lamp-arm-${s}-${side}`, [2.6, .12, .16], [-side * 1.2, 7.4, 0], 0, { kind: 'streetlight' }, root);
  pool.instance('warm', `city-lamp-emitter-${s}-${side}`, [1.1, .09, .42], [-side * 2.3, 7.32, 0], 0, { kind: 'streetlight' }, root);
  spans.push({ start: s - 7, end: s + 7, left: side < 0 ? -HALF_WIDTH + .2 : .3, right: side < 0 ? -.3 : HALF_WIDTH - .2, repeat: 14 });
  counts.streetlights++;
 }
 const texture = rawTexture(view.scene, counts, 'city-warm-light-pool', 64, 64, (x, y) => {
  const dx = (x - 31.5) / 31.5, dy = (y - 31.5) / 31.5;
  return [255, 186, 96, Math.max(0, 1 - dx * dx - dy * dy) ** 2 * 65];
 }, true);
 texture.wrapU = texture.wrapV = B.Texture.CLAMP_ADDRESSMODE;
 patches(view, 'city-warm-road-pools', spans, emission(view.scene, 'city-pool-emission', '#ffffff', texture, true), .009);
 counts.lightPools = spans.length;
}
function addSky(view, counts) {
 const width = 256, height = 128, rng = random(9081), stars = new Set();
 for (let i = 0; i < 150; i++) stars.add(`${Math.floor(rng() * width)},${8 + Math.floor(rng() * 63)}`);
 const texture = rawTexture(view.scene, counts, 'city-graphic-night-sky', width, height, (x, y) => {
  const t = y / (height - 1), moon = Math.hypot((x - 180) * .72, y - 38);
  if (moon < 12) return moon > 10.8 ? [173, 181, 228, 255] : [221, 226, 255, 255];
  if (stars.has(`${x},${y}`)) return [159, 179, 231, 255];
  return [7 + 34 * t, 12 + 9 * t, 35 + 33 * t, 255];
 });
 texture.wrapV = B.Texture.CLAMP_ADDRESSMODE;
 const material = emission(view.scene, 'city-night-sky', '#ffffff', texture); material.fogEnabled = false;
 const sky = B.MeshBuilder.CreateSphere('city-night-sky', { diameter: 1400, segments: 16, sideOrientation: B.Mesh.BACKSIDE }, view.scene);
 sky.material = material; sky.infiniteDistance = true; mark(sky, 'sky', { celShading: false });
 counts.stars = stars.size; counts.moons = 1;
}

export function buildCityWorld(view) {
 const scene = view.scene;
 const counts = {
  ...CITY, buildings: 0, litWindows: 0, neonPanels: 0, neonStrips: 0, largeSigns: 0,
  streetlights: 0, lightPools: 0, additionalRealLights: 0, reflectionProbes: 0,
  visibleBarrierRails: 0, visibleBarrierPosts: 0, instanceSources: 0, instances: 0,
  proceduralTextures: 0, proceduralTextureBytes: 0, ready: false
 };
 scene.metadata = { ...scene.metadata, scenery: counts };
 let reflection = null, propNodes = new Map(), disposed = false;
 // Synchronous fallback, replaced by a sampler of the actual grid at readiness.
 view.sceneryGroundHeight = (x, z) => roadHeight(x, z) - .16;
 const scenery = {
  counts,
  setWeather(weather) {
   const wet = weather === 'wet';
   scene.clearColor = new B.Color4(.025, .035, .085, 1);
   scene.ambientColor = rgb('#202943'); scene.fogMode = B.Scene.FOGMODE_EXP2;
   scene.fogColor = rgb('#17172f'); scene.fogDensity = wet ? .0025 : .0015;
   if (view.sun) { view.sun.diffuse = rgb('#9daff2'); view.sun.intensity = .72; }
   if (view.hemi) { view.hemi.diffuse = rgb('#809bda'); view.hemi.groundColor = rgb('#4d365d'); view.hemi.intensity = .75; }
   if (view.roadMaterial) { view.roadMaterial.roughness = wet ? .18 : .28; view.roadMaterial.metallic = .12; }
   if (reflection) reflection.level = wet ? 1 : .72;
   view.rain?.setEnabled(wet);
  },
  update(dt, player, phase) {
   if (disposed || !counts.ready) return;
   // Props follow race.props, never a fresh layout or a renderer-owned physics step.
   for (const prop of view.race.props || []) {
    const root = propNodes.get(prop.id); if (!root) continue;
    root.setEnabled(prop.active !== false); pose(root, prop.x, prop.z, prop.yaw || 0, 0, prop.tilt || 0);
   }
   if (!view.reducedMotion && phase !== 'paused' && phase !== 'finished' && Number.isFinite(dt) && dt > 0) {
    reflection.vOffset = (reflection.vOffset + Math.min(dt, .1) * .035) % 1;
   }
  },
  dispose() { disposed = true; }
 };
 view.scenery = scenery;
 view.updateScenery = (dt, player, phase) => scenery.update(dt, player, phase);
 // All construction runs inside this promise. Procedural texture failures and
 // scene disposal reject, just like failed assets in the mountain builder.
 scenery.ready = Promise.resolve().then(() => {
  if (scene.isDisposed || disposed) throw new Error('City world creation stopped: scene disposed');
  const layout = view.race.layout || mountainLayout(view.race.track), pool = pools(scene, counts);
  pool.add('dark', solidMaterial(scene, 'city-dark-metal', '#293347'));
  pool.add('rail', solidMaterial(scene, 'city-guardrail', '#7b8ca7'));
  pool.add('concrete', solidMaterial(scene, 'city-concrete', '#50576b'));
  pool.add('bollard', solidMaterial(scene, 'city-bollard', '#596378'), 'cylinder');
  pool.add('warm', emission(scene, 'city-warm-emission', '#ffd295'));
  const cone = B.MeshBuilder.CreateCylinder('city-cone-template-geometry', { height: 1, diameterTop: .13, diameterBottom: 1, tessellation: 12 }, scene);
  const coneSource = pool.add('cone', solidMaterial(scene, 'city-orange-cone', '#e88854'));
  // Share one cone geometry across every cone, rather than allocate per prop.
  cone.geometry.applyToMesh(coneSource); cone.dispose();
  const signMaps = [signTexture(scene, counts, 'TOKYO'), signTexture(scene, counts, 'NIGHT')];
  NEON.forEach((hex, i) => {
   pool.add(`neon-${i}`, emission(scene, `city-neon-${i}`, hex));
   pool.add(`sign-${i}`, emission(scene, `city-sign-${i}`, hex, signMaps[i % signMaps.length]));
  });
  addGround(view, solidMaterial(scene, 'city-ground-material', '#242837'), counts);
  reflection = addRoad(view, counts);
  propNodes = addSharedSolids(view, layout, pool, counts);
  addBuildings(view, pool, counts); addStreetlights(view, pool, counts); addSky(view, counts);
  if (!view.rain && typeof view.createRain === 'function') view.createRain();
  scenery.setWeather(view.race.weather);
  registerCelPalette('city-night', {
   shadowColor: '#72789e', rimColor: '#a5c8ff',
   materialColors: { asphalt: '#25314b', 'city-concrete': '#50576b' }
  });
  view.celShading = applyCelShading(view, {
   palette: 'city-night', ambientStrength: .58, sunStrength: .38, rimStrength: .18,
   grade: { exposure: .95, contrast: 1.08, saturation: 12 },
   bloom: { enabled: view.quality === 'high', threshold: .78, weight: .12, kernel: 24 }
  });
  counts.ready = true;
  scenery.update(0, view.race.player, view.race.phase);
  return scenery;
 });
 scene.onDisposeObservable.addOnce(() => scenery.dispose());
 return scenery;
}
