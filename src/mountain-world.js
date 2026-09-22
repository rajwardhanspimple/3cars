import { HALF_WIDTH, BARRIER, clamp } from './sim.js';
import { MOUNTAIN, mountainLayout, roadHeight, roadPose } from './mountain-layout.js';

const B = globalThis.BABYLON;
const v = (x = 0, y = 0, z = 0) => new B.Vector3(x, y, z);
const color = hex => B.Color3.FromHexString(hex);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const asset = path => new URL(path, import.meta.url).href;

function pbr(view, name, hex, roughness = .8, metallic = 0) {
 const m = view.mat(name, hex, metallic, roughness);
 m.environmentIntensity = .82;
 return m;
}
function loadTexture(scene, url, name, uScale = 1, vScale = uScale) {
 return new Promise((resolve, reject) => {
  const tex = new B.Texture(url, scene, false, false, B.Texture.TRILINEAR_SAMPLINGMODE, () => resolve(tex), () => reject(new Error(`Texture failed to load: ${name}`)));
  tex.name = name; tex.uScale = uScale; tex.vScale = vScale;
 });
}
function setTex(mat, key, tex) { mat[key] = tex; return tex; }
function applyPose(mesh, x, z, yaw = 0, yOffset = 0) {
 const pose = roadPose(x, z, yaw);
 mesh.position.set(x, pose.y + yOffset, z);
 mesh.rotation.set(pose.pitch, yaw, pose.roll);
 return pose;
}
function flipIfDown(name, positions, indices) {
 const normals = [];
 B.VertexData.ComputeNormals(positions, indices, normals);
 let y = 0;
 for (let i = 1; i < normals.length; i += 3) y += normals[i];
 if (y < 0) {
  for (let i = 0; i < indices.length; i += 3) { const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t; }
  normals.length = 0; B.VertexData.ComputeNormals(positions, indices, normals);
  let check = 0; for (let i = 1; i < normals.length; i += 3) check += normals[i];
  if (check < 0) throw new Error(`${name} normals point downward after flip`);
 }
 return normals;
}
function stripMesh(scene, name, left, right, material, repeat = 8) {
 const positions = [], indices = [], uvs = [];
 for (let i = 0; i < left.length; i++) {
  const a = left[i], b = right[i], width = Math.hypot(a.x - b.x, a.z - b.z), s = a.s ?? i;
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  uvs.push(s / repeat, 0, s / repeat, width / repeat);
  if (i < left.length - 1) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
 }
 const mesh = new B.Mesh(name, scene), data = new B.VertexData();
 data.positions = positions; data.indices = indices; data.uvs = uvs; data.normals = flipIfDown(name, positions, indices); data.applyToMesh(mesh);
 if (mesh.getTotalVertices() * 2 !== uvs.length) throw new Error(`${name} UV length mismatch`);
 mesh.material = material; mesh.receiveShadows = true; return mesh;
}
function roadRibbon(view, name, inner, outer, material, y = .035, repeat = 8) {
 const t = view.race.track, left = [], right = [];
 for (let i = 0; i <= t.points.length; i++) {
  const s = i === t.points.length ? t.length : t.points[i].s, a = t.at(s, inner), b = t.at(s, outer);
  left.push({ x: a.x, y: roadHeight(a.x, a.z) + y, z: a.z, s });
  right.push({ x: b.x, y: roadHeight(b.x, b.z) + y, z: b.z, s });
 }
 return stripMesh(view.scene, name, left, right, material, repeat);
}
function addRoad(view, materials, counts) {
 roadRibbon(view, 'mountain-asphalt-18m-pbr', -HALF_WIDTH, HALF_WIDTH, materials.asphalt, .045, 6);
 roadRibbon(view, 'left-white-edge-paint', -HALF_WIDTH + .16, -HALF_WIDTH + .38, materials.white, .065, 1.5);
 roadRibbon(view, 'right-white-edge-paint', HALF_WIDTH - .38, HALF_WIDTH - .16, materials.white, .065, 1.5);
 roadRibbon(view, 'double-yellow-center-a', -.22, -.06, materials.yellow, .075, 1.4);
 roadRibbon(view, 'double-yellow-center-b', .06, .22, materials.yellow, .075, 1.4);
 roadRibbon(view, 'banked-left-curb', -HALF_WIDTH - .92, -HALF_WIDTH - .18, materials.curb, .08, 2.2);
 roadRibbon(view, 'banked-right-curb', HALF_WIDTH + .18, HALF_WIDTH + .92, materials.curb, .08, 2.2);
 counts.roadWidth = HALF_WIDTH * 2; counts.roadUsesRoadHeight = true;
}
function terrainHeight(track, x, z, bounds) {
 const p = track.project(x, z), centerY = roadHeight(p.x, p.z), roadY = roadHeight(x, z);
 const hills = 9 + .038 * (z - bounds.centerZ) + Math.sin(x * .013) * 8 + Math.cos(z * .011) * 11 + Math.sin((x - z) * .006) * 7;
 const slope = Math.max(0, p.distance - 55) * .09;
 const cut = smoothstep(HALF_WIDTH + 4, BARRIER + 38, p.distance);
 const shoulder = roadY - .16 - Math.max(0, p.distance - HALF_WIDTH) * .035;
 return shoulder * (1 - cut) + (hills + slope) * cut + centerY * .08 * (1 - cut);
}
function addTerrain(view, materials, bounds, counts) {
 const scene = view.scene, track = view.race.track, size = 1040, cells = view.quality === 'high' ? 74 : 52, half = size / 2, step = size / cells;
 const ox = bounds.centerX - half, oz = bounds.centerZ - half, positions = [], indices = [], uvs = [];
 for (let iz = 0; iz <= cells; iz++) for (let ix = 0; ix <= cells; ix++) {
  const x = ox + ix * step, z = oz + iz * step, y = terrainHeight(track, x, z, bounds);
  positions.push(x, y, z); uvs.push(x / 7, z / 7);
 }
 for (let iz = 0; iz < cells; iz++) for (let ix = 0; ix < cells; ix++) { const a = iz * (cells + 1) + ix, b = a + 1, c = a + cells + 1, d = c + 1; indices.push(a, c, b, b, c, d); }
 const mesh = new B.Mesh('smooth-mountain-roadcut-terrain', scene), data = new B.VertexData();
 data.positions = positions; data.indices = indices; data.uvs = uvs; data.normals = flipIfDown('smooth-mountain-roadcut-terrain', positions, indices); data.applyToMesh(mesh);
 mesh.material = materials.ground; mesh.receiveShadows = true; counts.terrainVertices = positions.length / 3; counts.terrainRoadCutUsesRoadHeight = true;
 view.sceneryGroundHeight = (x, z) => terrainHeight(track, x, z, bounds);
 return mesh;
}
function addWalls(view, layout, materials, counts) {
 const meshes = [];
 for (const wall of layout.walls) {
  const mesh = B.MeshBuilder.CreateBox('moss-stone-retaining-wall', { width: wall.width, height: wall.height, depth: wall.length }, view.scene);
  applyPose(mesh, wall.x, wall.z, wall.yaw, wall.height / 2 - .04);
  mesh.material = materials.rock; mesh.receiveShadows = true; meshes.push(mesh);
 }
 view.merge(meshes, 'batched-moss-stone-retaining-walls'); counts.retainingWalls = layout.walls.length;
}
function makeProp(view, prop, materials) {
 const root = new B.TransformNode(`prop-${prop.id}`, view.scene);
 applyPose(root, prop.x, prop.z, prop.yaw || 0, 0);
 if (prop.type === 'sign') {
  const post = view.box('mountain-sign-post', [.18, 2.2, .18], [0, 1.1, 0], materials.dark, root);
  const panel = view.box('mountain-sign-panel', [2.5, 1.05, .12], [0, 2.35, 0], materials.white, root);
  view.sign('HAIRPIN', [0, 2.35, -.08], 2.2, .82, root); post.receiveShadows = panel.receiveShadows = true;
 } else {
  const cone = B.MeshBuilder.CreateCylinder('shared-layout-cone', { height: 1.15, diameterTop: .08, diameterBottom: .62, tessellation: 18 }, view.scene);
  cone.position.y = .58; cone.parent = root; cone.material = materials.orange; cone.receiveShadows = true;
 }
 return root;
}
function addProps(view, layout, materials, counts) {
 const propNodes = new Map();
 for (const prop of layout.props) propNodes.set(prop.id, makeProp(view, prop, materials));
 counts.sharedLayoutProps = layout.props.length;
 return propNodes;
}
function addMountainsAndTemple(view, materials, bounds, counts) {
 const scene = view.scene, meshes = [];
 for (let i = 0; i < 18; i++) {
  const a = i / 18 * Math.PI * 2, m = B.MeshBuilder.CreateCylinder('dusk-layered-mountain-backdrop', { height: 120 + (i % 5) * 34, diameterTop: 10, diameterBottom: 230 + (i % 4) * 45, tessellation: 8 }, scene);
  m.position = v(bounds.centerX + Math.sin(a) * 740, roadHeight(bounds.centerX, bounds.centerZ) - 20, bounds.centerZ + Math.cos(a) * 740);
  m.rotation.y = a; m.material = i % 2 ? materials.mountainNear : materials.mountainFar; meshes.push(m);
 }
 view.merge(meshes, 'batched-dusk-mountain-backdrop');
 const temple = new B.TransformNode('distant-ridge-temple', scene), p = view.race.track.at(view.race.track.length * .42, -96);
 temple.position = v(p.x, roadHeight(p.x, p.z) + 34, p.z); temple.rotation.y = p.heading + Math.PI;
 view.box('temple-base', [22, 4, 16], [0, 2, 0], materials.templeWall, temple);
 view.box('temple-upper', [15, 5, 11], [0, 6.5, 0], materials.templeWall, temple);
 const roof1 = view.box('temple-low-roof', [25, 1.2, 19], [0, 9.1, 0], materials.templeRoof, temple); roof1.rotation.x = .06;
 const roof2 = view.box('temple-high-roof', [18, 1.0, 14], [0, 12.2, 0], materials.templeRoof, temple); roof2.rotation.x = -.05;
 counts.mountainBackdrop = 18; counts.templeBackdrop = 1;
}
function makeSky(view, materials) {
 const scene = view.scene, tex = new B.DynamicTexture('warm-dusk-gradient-clouds', { width: 1024, height: 512 }, scene, false), ctx = tex.getContext();
 for (let y = 0; y < 512; y++) { const t = y / 511, r = 42 * (1 - t) + 244 * t, g = 67 * (1 - t) + 154 * t, b = 100 * (1 - t) + 108 * t; ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; ctx.fillRect(0, y, 1024, 1); }
 ctx.globalAlpha = .28;
 for (let i = 0; i < 32; i++) { const x = (i * 173) % 1140 - 80, y = 55 + (i * 61) % 210, w = 95 + (i % 6) * 28, grad = ctx.createRadialGradient(x, y, 1, x, y, w); grad.addColorStop(0, 'rgba(255,219,174,.75)'); grad.addColorStop(1, 'rgba(255,219,174,0)'); ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(x, y, w, w * .23, 0, 0, Math.PI * 2); ctx.fill(); }
 ctx.globalAlpha = 1; tex.update();
 const mat = new B.StandardMaterial('unlit-warm-dusk-sky-material', scene); mat.diffuseTexture = tex; mat.emissiveColor = color('#ffffff'); mat.disableLighting = true; mat.backFaceCulling = false;
 const sky = B.MeshBuilder.CreateBox('warm-dusk-cloud-skybox', { size: 1500 }, scene); sky.material = mat; sky.infiniteDistance = true; sky.isPickable = false; materials.sky = mat;
}
async function loadTreeSource(view, type, path, targetHeight) {
 const scene = view.scene, url = asset(path);
 const container = await B.SceneLoader.LoadAssetContainerAsync('', url, scene).catch(error => { throw new Error(`${type} tree asset failed to load: ${error.message || error}`); });
 const meshes = container.meshes.filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
 if (!meshes.length) throw new Error(`${type} tree asset has no renderable meshes`);
 let min = v(Infinity, Infinity, Infinity), max = v(-Infinity, -Infinity, -Infinity);
 for (const mesh of meshes) {
  const info = mesh.getBoundingInfo().boundingBox;
  min = B.Vector3.Minimize(min, info.minimumWorld); max = B.Vector3.Maximize(max, info.maximumWorld);
  mesh.receiveShadows = true;
  if (mesh.material) { mesh.material.backFaceCulling = false; if (mesh.material.needAlphaBlending?.()) mesh.material.transparencyMode = mesh.material.transparencyMode ?? B.Material.MATERIAL_ALPHABLEND; }
 }
 const height = Math.max(.01, max.y - min.y), scale = targetHeight / height;
 return { type, container, scale, minY: min.y, sourceMeshes: meshes, sourceTriangleEstimate: meshes.reduce((n, m) => n + (m.getTotalIndices ? m.getTotalIndices() / 3 : 0), 0) };
}
function instantiateTree(view, source, tree, shadowMeshes) {
 const result = source.container.instantiateModelsToScene(name => `${tree.id}-${name}`, false, { doNotInstantiate: false });
 const root = new B.TransformNode(`tree-root-${tree.id}`, view.scene), s = source.scale * (tree.height / (source.type === 'green' ? 13.5 : 10.5));
 root.position.set(tree.x, tree.y - source.minY * s, tree.z); root.rotation.y = tree.yaw; root.scaling.setAll(s);
 for (const node of result.rootNodes) node.parent = root;
 for (const mesh of root.getChildMeshes(false)) { mesh.receiveShadows = true; mesh.isPickable = false; shadowMeshes.push(mesh); }
 return root;
}
async function addAssetTrees(view, layout, counts, shadowMeshes) {
 const [cherry, green] = await Promise.all([
  loadTreeSource(view, 'cherry', '../assets/environment/cherry.glb', 10.5),
  loadTreeSource(view, 'green', '../assets/environment/green-tree/scene.gltf', 13.5)
 ]);
 let cherryCount = 0, greenCount = 0;
 for (const tree of layout.trees) { instantiateTree(view, tree.type === 'green' ? green : cherry, tree, shadowMeshes); if (tree.type === 'green') greenCount++; else cherryCount++; }
 counts.trees = layout.trees.length; counts.cherryTrees = cherryCount; counts.greenTrees = greenCount;
 counts.treeSourceTriangles = { cherry: Math.round(cherry.sourceTriangleEstimate), green: Math.round(green.sourceTriangleEstimate) };
 counts.treeInstancing = 'AssetContainer.instantiateModelsToScene shared source hierarchy';
}
function addPetals(view, materials, counts) {
 const base = B.MeshBuilder.CreatePlane('petal-source-plane', { size: .34 }, view.scene); base.material = materials.petal; base.isVisible = false; base.isPickable = false;
 const petals = [], max = 160;
 for (let i = 0; i < max; i++) {
  const p = base.createInstance(`air-petal-${i}`); p.isVisible = true; p.isPickable = false;
  petals.push({ mesh: p, seed: i * 97.13, age: (i % 37) / 37 * 6 });
 }
 counts.petalPool = max; return petals;
}
function updatePetals(view, petals, dt, player, phase) {
 if (phase === 'paused' || dt <= 0 || !player) return;
 const speed = Math.max(6, player.speed || 0), forwardX = Math.sin(player.yaw || 0), forwardZ = Math.cos(player.yaw || 0);
 for (const p of petals) {
  p.age += dt * (.7 + speed * .012);
  const life = 6.5, u = (p.age % life) / life, side = Math.sin(p.seed) * 16, ahead = 20 - u * 42, x = player.x + forwardX * ahead + Math.cos(player.yaw) * side + Math.sin(p.seed + p.age) * 1.8, z = player.z + forwardZ * ahead - Math.sin(player.yaw) * side + Math.cos(p.seed * .7 + p.age) * 1.8;
  p.mesh.position.set(x, roadHeight(x, z) + 1.1 + Math.sin(u * Math.PI) * 2.8, z);
  p.mesh.rotation.set(p.age * 1.7 + p.seed, p.seed, p.age * 2.1);
 }
}
function syncRaceProps(view, propNodes, materials) {
 const props = view.race?.props;
 if (!Array.isArray(props)) return;
 for (const prop of props) {
  let node = propNodes.get(prop.id);
  if (!node) { node = makeProp(view, prop, materials); propNodes.set(prop.id, node); }
  node.setEnabled(prop.active !== false);
  applyPose(node, prop.x, prop.z, prop.yaw || 0, 0);
 }
}
function updateDynamicShadows(view, shadowMeshes, active, player) {
 if (!view.shadow || !player) return;
 const limit = 95 * 95;
 for (const mesh of shadowMeshes) {
  const dx = mesh.getAbsolutePosition().x - player.x, dz = mesh.getAbsolutePosition().z - player.z, near = dx * dx + dz * dz < limit;
  if (near && !active.has(mesh)) { view.shadow.addShadowCaster(mesh); active.add(mesh); }
  else if (!near && active.has(mesh)) { view.shadow.removeShadowCaster(mesh); active.delete(mesh); }
 }
}
export function buildMountainWorld(view) {
 const scene = view.scene, track = view.race.track, bounds = track.bounds, layout = mountainLayout(track), counts = {}, texturePromises = [], shadowMeshes = [];
 scene.clearColor = new B.Color4(.92, .55, .35, 1); scene.fogColor = color('#d69b75'); scene.fogDensity = view.quality === 'high' ? .00125 : .00165; scene.ambientColor = color('#a56f5c');
 if (view.hemi) { view.hemi.intensity = .72; view.hemi.groundColor = color('#3e4738'); }
 if (view.sun) { view.sun.direction = v(-.72, -.48, .42); view.sun.position = v(260, 210, -210); view.sun.intensity = 2.7; }
 const asphalt = pbr(view, 'local-pbr-detailed-asphalt', '#46494a', .83, 0), ground = pbr(view, 'lush-mountain-ground', '#567342', .96, 0), rock = pbr(view, 'repeated-moss-stone-rock', '#6f7668', .88, 0);
 texturePromises.push(loadTexture(scene, asset('../assets/environment/asphalt-diff.jpg'), 'asphalt-diff', .13).then(t => setTex(asphalt, 'albedoTexture', t)));
 texturePromises.push(loadTexture(scene, asset('../assets/environment/asphalt-normal.jpg'), 'asphalt-normal', .13).then(t => { setTex(asphalt, 'bumpTexture', t); asphalt.bumpTexture.level = .075; }));
 texturePromises.push(loadTexture(scene, asset('../assets/environment/asphalt-rough.jpg'), 'asphalt-rough', .13).then(t => setTex(asphalt, 'reflectivityTexture', t)));
 texturePromises.push(loadTexture(scene, asset('../assets/environment/rock-diff.jpg'), 'rock-diff', .19).then(t => setTex(rock, 'albedoTexture', t)));
 texturePromises.push(loadTexture(scene, asset('../assets/environment/rock-normal.jpg'), 'rock-normal', .19).then(t => { setTex(rock, 'bumpTexture', t); rock.bumpTexture.level = .12; }));
 texturePromises.push(loadTexture(scene, asset('../assets/environment/rock-rough.jpg'), 'rock-rough', .19).then(t => setTex(rock, 'reflectivityTexture', t)));
 view.roadMaterial = asphalt;
 const petalMat = new B.StandardMaterial('unlit-sakura-petal-material', scene); petalMat.diffuseColor = color('#f7b4c8'); petalMat.emissiveColor = color('#f1a7bd'); petalMat.specularColor = B.Color3.Black(); petalMat.backFaceCulling = false;
 const materials = { asphalt, ground, rock, white: pbr(view, 'slightly-worn-white-road-paint', '#f3f1df', .58, 0), yellow: pbr(view, 'warm-yellow-center-paint', '#e6c13d', .5, 0), curb: pbr(view, 'banked-concrete-curb', '#c8c5b6', .78, 0), dark: pbr(view, 'dark-weathered-metal', '#343a3b', .62, .25), orange: pbr(view, 'orange-safety-cone', '#d96c2d', .55, 0), mountainNear: pbr(view, 'warm-near-mountain', '#5d716b', .95, 0), mountainFar: pbr(view, 'hazy-far-mountain', '#82908a', .98, 0), templeWall: pbr(view, 'distant-temple-wall', '#d3c6a3', .82, 0), templeRoof: pbr(view, 'distant-temple-roof', '#7d2f32', .55, 0), petal: petalMat };
 view.sceneryMaterials = materials; makeSky(view, materials); addTerrain(view, materials, bounds, counts); addRoad(view, materials, counts); addWalls(view, layout, materials, counts); const propNodes = addProps(view, layout, materials, counts); addMountainsAndTemple(view, materials, bounds, counts); const petals = addPetals(view, materials, counts);
 const activeShadowCasters = new Set();
 view.scenery = { ready: null, name: MOUNTAIN.name, preview: true, propNodes, petals, setWeather(weather) { const wet = weather === 'wet'; scene.fogDensity = wet ? .0026 : (view.quality === 'high' ? .00125 : .00165); if (view.sun) view.sun.intensity = wet ? 1.05 : 2.7; if (view.hemi) view.hemi.intensity = wet ? .62 : .72; asphalt.roughness = wet ? .42 : .83; asphalt.environmentIntensity = wet ? 1.05 : .82; }, update(dt, player, phase) { syncRaceProps(view, propNodes, materials); updatePetals(view, petals, dt, player, phase); updateDynamicShadows(view, shadowMeshes, activeShadowCasters, player); if (phase === 'menu' && view.camera && player) { const targetS = track.length * .68, focus = track.at(targetS, 0), eye = track.at(targetS - 58, -82); const desired = v(eye.x, roadHeight(eye.x, eye.z) + 42, eye.z); B.Vector3.LerpToRef(view.camera.position, desired, 1 - Math.exp(-dt * 2.2), view.camera.position); view.camera.setTarget(v(focus.x, roadHeight(focus.x, focus.z) + 2.4, focus.z)); } } };
 view.scenery.ready = Promise.all(texturePromises).then(() => addAssetTrees(view, layout, counts, shadowMeshes)).then(() => scene.whenReadyAsync()).then(() => {
  if (view.createRain) view.createRain(); view.scenery.setWeather(view.race.weather); scene.metadata = scene.metadata || {}; scene.metadata.scenery = { name: MOUNTAIN.name, circuitId: MOUNTAIN.id, preview: true, counts: { ...counts, sharedLayoutTrees: layout.trees.length, sharedLayoutWalls: layout.walls.length, staticMeshes: scene.meshes.length, materials: Object.keys(view.materials).length, quality: view.quality }, textureMemoryBoundMB: 96, interfaces: ['buildMountainWorld(view)', 'view.scenery.ready', 'view.updateScenery(dt, player, phase)', 'scene.metadata.scenery'], caveats: ['Tree and PBR texture asset load failures reject view.scenery.ready.', 'Dynamic tree shadows are limited to meshes near the player to keep shadow detail usable.'] };
  return scene.metadata.scenery;
 }).catch(error => { view.scenery.error = error; throw error; });
}
