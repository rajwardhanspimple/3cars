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
  tex.name = name; tex.uScale = uScale; tex.vScale = vScale; resolve;
 });
}
function assignMetallicRoughness(mat, tex) {
 mat.metallicTexture = tex;
 mat.useRoughnessFromMetallicTextureAlpha = false;
 mat.useRoughnessFromMetallicTextureGreen = true;
 mat.useMetallnessFromMetallicTextureBlue = false;
 mat.useMetalnessFromMetallicTextureBlue = false;
 mat.metallic = 0;
}
function slopePose(node, x, z, yaw = 0, yOffset = 0, tilt = 0) {
 const pose = roadPose(x, z, yaw);
 node.position.set(x, pose.y + yOffset, z);
 node.rotation.set(pose.pitch, yaw, pose.roll + tilt);
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
function terrainHeight(track, x, z, bounds, cellDiag = 20) {
 const p = track.project(x, z), roadY = roadHeight(x, z);
 const corridor = HALF_WIDTH + cellDiag + 3;
 if (p.distance <= corridor) return roadY - .16;
 const hills = 9 + .038 * (z - bounds.centerZ) + Math.sin(x * .013) * 8 + Math.cos(z * .011) * 11 + Math.sin((x - z) * .006) * 7;
 const slope = Math.max(0, p.distance - 55) * .09;
 const cut = smoothstep(corridor, BARRIER + 46, p.distance);
 const shoulder = roadY - .16 - Math.max(0, p.distance - HALF_WIDTH) * .035;
 return shoulder * (1 - cut) + (hills + slope) * cut;
}
function barycentricHeight(p, a, b, c) {
 const v0x = b.x - a.x, v0z = b.z - a.z, v1x = c.x - a.x, v1z = c.z - a.z, v2x = p.x - a.x, v2z = p.z - a.z;
 const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
 const denom = d00 * d11 - d01 * d01 || 1, w1 = (d11 * d20 - d01 * d21) / denom, w2 = (d00 * d21 - d01 * d20) / denom, w0 = 1 - w1 - w2;
 return a.y * w0 + b.y * w1 + c.y * w2;
}
function addTerrain(view, materials, bounds, counts) {
 const scene = view.scene, track = view.race.track, size = 1040, cells = view.quality === 'high' ? 74 : 52, half = size / 2, step = size / cells, cellDiag = Math.SQRT2 * step;
 const ox = bounds.centerX - half, oz = bounds.centerZ - half, positions = [], indices = [], uvs = [];
 for (let iz = 0; iz <= cells; iz++) for (let ix = 0; ix <= cells; ix++) {
  const x = ox + ix * step, z = oz + iz * step, y = terrainHeight(track, x, z, bounds, cellDiag);
  positions.push(x, y, z); uvs.push(x / 7, z / 7);
 }
 for (let iz = 0; iz < cells; iz++) for (let ix = 0; ix < cells; ix++) { const a = iz * (cells + 1) + ix, b = a + 1, c = a + cells + 1, d = c + 1; indices.push(a, c, b, b, c, d); }
 const mesh = new B.Mesh('smooth-mountain-roadcut-terrain', scene), data = new B.VertexData();
 data.positions = positions; data.indices = indices; data.uvs = uvs; data.normals = flipIfDown('smooth-mountain-roadcut-terrain', positions, indices); data.applyToMesh(mesh);
 mesh.material = materials.ground; mesh.receiveShadows = true;
 const vertex = (ix, iz) => { const i = (iz * (cells + 1) + ix) * 3; return { x: positions[i], y: positions[i + 1], z: positions[i + 2] }; };
 view.sceneryGroundHeight = (x, z) => {
  const fx = clamp((x - ox) / step, 0, cells - .0001), fz = clamp((z - oz) / step, 0, cells - .0001), ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const a = vertex(ix, iz), b = vertex(ix + 1, iz), c = vertex(ix, iz + 1), d = vertex(ix + 1, iz + 1), p = { x, z };
  return tx + tz <= 1 ? barycentricHeight(p, a, c, b) : barycentricHeight(p, b, c, d);
 };
 counts.terrainVertices = positions.length / 3; counts.terrainRoadCutUsesRoadHeight = true; counts.terrainFlatMargin = Number((HALF_WIDTH + cellDiag + 3).toFixed(2)); counts.groundHeightSampler = 'triangle-barycentric-terrain-grid';
 return mesh;
}
function localPoint(root, lx, ly, lz) {
 const m = root.getWorldMatrix(), out = B.Vector3.TransformCoordinates(v(lx, ly, lz), m);
 return out;
}
function makeWall(view, wall, material) {
 const root = new B.TransformNode(`wall-root-${wall.id}`, view.scene); slopePose(root, wall.x, wall.z, wall.yaw, 0, wall.tilt || 0);
 const w = wall.width, h = wall.height, l = wall.length, y0 = -.04, y1 = h - .04;
 const corners = [[-w/2,y0,-l/2],[w/2,y0,-l/2],[w/2,y1,-l/2],[-w/2,y1,-l/2],[-w/2,y0,l/2],[w/2,y0,l/2],[w/2,y1,l/2],[-w/2,y1,l/2]];
 root.computeWorldMatrix(true);
 const P = corners.map(c => localPoint(root, ...c)), positions = [], indices = [], uvs = [], faces = [[0,1,2,3,l,h],[5,4,7,6,l,h],[4,0,3,7,w,h],[1,5,6,2,w,h],[3,2,6,7,l,w]];
 for (const [a,b,c,d,uw,vh] of faces) { const n = positions.length / 3; for (const p of [P[a],P[b],P[c],P[d]]) positions.push(p.x,p.y,p.z); uvs.push(0,0,uw/2,0,uw/2,vh/2,0,vh/2); indices.push(n,n+1,n+2,n,n+2,n+3); }
 root.dispose();
 const mesh = new B.Mesh('moss-stone-retaining-wall', view.scene), data = new B.VertexData(); data.positions = positions; data.indices = indices; data.uvs = uvs; data.normals = flipIfDown('moss-stone-retaining-wall', positions, indices); data.applyToMesh(mesh); mesh.material = material; mesh.receiveShadows = true; return mesh;
}
function addWalls(view, layout, materials, counts) {
 const meshes = layout.walls.map(wall => makeWall(view, wall, materials.rock));
 view.merge(meshes, 'batched-moss-stone-retaining-walls'); counts.retainingWalls = layout.walls.length;
}
function addGuardrails(view, materials, counts) {
 const track = view.race.track, rails = [], posts = [];
 for (let s = 0, n = 0; s < track.length; s += 7.5, n++) for (const side of [-1, 1]) {
  const p = track.at(s, side * 16.95), yaw = p.heading;
  const post = B.MeshBuilder.CreateBox('barrier-visible-post', { width: .16, height: 1.3, depth: .16 }, view.scene); slopePose(post, p.x, p.z, yaw, .65); post.material = materials.railDark; post.receiveShadows = true; posts.push(post);
  if (n % 2 === 0) { const rail = B.MeshBuilder.CreateBox('barrier-visible-guardrail', { width: .22, height: .34, depth: 7.8 }, view.scene); slopePose(rail, p.x, p.z, yaw, 1.15); rail.material = materials.rail; rail.receiveShadows = true; rails.push(rail); }
 }
 view.merge(posts, 'batched-visible-barrier-posts'); view.merge(rails, 'batched-visible-physics-guardrails'); counts.visibleBarrierRails = rails.length; counts.visibleBarrierPosts = posts.length; counts.physicsBarrierOffset = 16.95;
}
function makeProp(view, prop, materials) {
 const root = new B.TransformNode(`prop-${prop.id}`, view.scene); slopePose(root, prop.x, prop.z, prop.yaw || 0, 0, prop.tilt || 0);
 if (prop.type === 'sign') {
  view.box('mountain-sign-post', [.18, 2.2, .18], [0, 1.1, 0], materials.dark, root);
  view.box('mountain-sign-panel', [2.5, 1.05, .12], [0, 2.35, 0], materials.white, root);
  view.sign('HAIRPIN', [0, 2.35, -.08], 2.2, .82, root);
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
function makeRoof(scene, name, width, depth, rise, y, mat, parent) {
 const hw = width/2, hd = depth/2, positions = [-hw,y,-hd, hw,y,-hd, hw,y,hd, -hw,y,hd, 0,y+rise,-hd*.86, 0,y+rise,hd*.86], indices = [0,1,4,3,5,2,0,4,5,0,5,3,1,2,5,1,5,4], uvs = [0,0,1,0,1,1,0,1,.5,0,.5,1];
 const mesh = new B.Mesh(name, scene), data = new B.VertexData(); data.positions = positions; data.indices = indices; data.uvs = uvs; data.normals = flipIfDown(name, positions, indices); data.applyToMesh(mesh); mesh.material = mat; mesh.parent = parent; mesh.receiveShadows = true; return mesh;
}
function addMountainsAndTemple(view, materials, bounds, counts) {
 const scene = view.scene, meshes = [];
 for (let i = 0; i < 18; i++) {
  const a = i / 18 * Math.PI * 2, m = B.MeshBuilder.CreateCylinder('dusk-layered-mountain-backdrop', { height: 120 + (i % 5) * 34, diameterTop: 10, diameterBottom: 230 + (i % 4) * 45, tessellation: 8 }, scene);
  m.position = v(bounds.centerX + Math.sin(a) * 740, roadHeight(bounds.centerX, bounds.centerZ) - 20, bounds.centerZ + Math.cos(a) * 740);
  m.rotation.y = a; m.material = i % 2 ? materials.mountainNear : materials.mountainFar; meshes.push(m);
 }
 view.merge(meshes, 'batched-dusk-mountain-backdrop');
 const p = view.race.track.at(view.race.track.length * .68, -118), baseY = (view.sceneryGroundHeight ? view.sceneryGroundHeight(p.x, p.z) : roadHeight(p.x, p.z) - .16);
 const temple = new B.TransformNode('distant-ridge-tiered-temple', scene); temple.position = v(p.x, baseY, p.z); temple.rotation.y = p.heading + Math.PI;
 view.box('temple-stone-foundation', [24, 2.2, 17], [0, 1.1, 0], materials.rock, temple);
 view.box('temple-lower-hall', [17, 5.2, 11], [0, 4.8, 0], materials.templeWall, temple);
 makeRoof(scene, 'temple-lower-sloped-roof', 25, 18, 2.2, 7.7, materials.templeRoof, temple);
 view.box('temple-upper-hall', [11, 4.1, 7.5], [0, 10.4, 0], materials.templeWall, temple);
 makeRoof(scene, 'temple-upper-sloped-roof', 18, 13, 1.8, 12.6, materials.templeRoof, temple);
 view.box('temple-lantern-tower', [3.2, 5.4, 3.2], [0, 16.0, 0], materials.templeWall, temple);
 makeRoof(scene, 'temple-cap-sloped-roof', 7, 6, 1.3, 18.7, materials.templeRoof, temple);
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
function assetParts(path) { const url = asset(path), i = url.lastIndexOf('/') + 1; return { rootUrl: url.slice(0, i), file: url.slice(i) }; }
async function loadTreeSource(view, type, path, targetHeight) {
 const scene = view.scene, parts = assetParts(path);
 const container = await B.SceneLoader.LoadAssetContainerAsync(parts.rootUrl, parts.file, scene).catch(error => { throw new Error(`${type} tree asset failed to load: ${error.message || error}`); });
 const meshes = container.meshes.filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
 if (!meshes.length) throw new Error(`${type} tree asset has no renderable meshes`);
 for (const node of container.transformNodes) node.computeWorldMatrix(true);
 for (const mesh of meshes) { mesh.computeWorldMatrix(true); if (mesh.material) { mesh.material.backFaceCulling = false; if (mesh.material.needAlphaBlending?.()) mesh.material.transparencyMode = mesh.material.transparencyMode ?? B.Material.MATERIAL_ALPHABLEND; } }
 let min = v(Infinity, Infinity, Infinity), max = v(-Infinity, -Infinity, -Infinity);
 for (const mesh of meshes) { const info = mesh.getBoundingInfo().boundingBox; min = B.Vector3.Minimize(min, info.minimumWorld); max = B.Vector3.Maximize(max, info.maximumWorld); }
 const height = Math.max(.01, max.y - min.y), scale = targetHeight / height, centerX = (min.x + max.x) / 2, centerZ = (min.z + max.z) / 2;
 return { type, container, scale, minY: min.y, centerX, centerZ, sourceMeshes: meshes, sourceTriangleEstimate: meshes.reduce((n, m) => n + (m.getTotalIndices ? m.getTotalIndices() / 3 : 0), 0) };
}
function instantiateTree(view, source, tree, shadowRoots) {
 const result = source.container.instantiateModelsToScene(name => `${tree.id}-${name}`, false, { doNotInstantiate: false });
 const root = new B.TransformNode(`tree-root-${tree.id}`, view.scene), s = source.scale * (tree.height / (source.type === 'green' ? 13.5 : 10.5)), ground = view.sceneryGroundHeight ? view.sceneryGroundHeight(tree.x, tree.z) : tree.y - .16;
 root.position.set(tree.x - source.centerX * s, ground - source.minY * s, tree.z - source.centerZ * s); root.rotation.y = tree.yaw; root.scaling.setAll(s);
 for (const node of result.rootNodes) node.parent = root;
 for (const mesh of root.getChildMeshes(false)) mesh.isPickable = false;
 shadowRoots.push(root); return root;
}
async function addAssetTrees(view, layout, counts, shadowRoots) {
 const [cherry, green] = await Promise.all([
  loadTreeSource(view, 'cherry', '../assets/environment/cherry.glb', 10.5),
  loadTreeSource(view, 'green', '../assets/environment/green-tree/scene.gltf', 13.5)
 ]);
 let cherryCount = 0, greenCount = 0;
 for (const tree of layout.trees) { instantiateTree(view, tree.type === 'green' ? green : cherry, tree, shadowRoots); if (tree.type === 'green') greenCount++; else cherryCount++; }
 counts.trees = layout.trees.length; counts.cherryTrees = cherryCount; counts.greenTrees = greenCount;
 counts.treeSourceTriangles = { cherry: Math.round(cherry.sourceTriangleEstimate), green: Math.round(green.sourceTriangleEstimate) };
 counts.treeInstancing = 'AssetContainer.instantiateModelsToScene shared source hierarchy';
}
function addPetals(view, materials, counts) {
 const base = B.MeshBuilder.CreatePlane('petal-source-plane', { size: .34 }, view.scene); base.material = materials.petal; base.isVisible = false; base.isPickable = false;
 const petals = [], max = 160;
 for (let i = 0; i < max; i++) { const p = base.createInstance(`air-petal-${i}`); p.isVisible = true; p.isPickable = false; petals.push({ mesh: p, seed: i * 97.13, age: (i % 37) / 37 * 6 }); }
 counts.petalPool = max; return petals;
}
function updatePetals(view, petals, dt, player, phase) {
 if (phase === 'paused' || dt <= 0 || !player) return;
 const speed = Math.max(6, player.speed || 0), forwardX = Math.sin(player.yaw || 0), forwardZ = Math.cos(player.yaw || 0);
 for (const p of petals) {
  p.age += dt * (.7 + speed * .012);
  const life = 6.5, u = (p.age % life) / life, side = Math.sin(p.seed) * 16, ahead = 20 - u * 42, x = player.x + forwardX * ahead + Math.cos(player.yaw) * side + Math.sin(p.seed + p.age) * 1.8, z = player.z + forwardZ * ahead - Math.sin(player.yaw) * side + Math.cos(p.seed * .7 + p.age) * 1.8;
  p.mesh.position.set(x, roadHeight(x, z) + 1.1 + Math.sin(u * Math.PI) * 2.8, z); p.mesh.rotation.set(p.age * 1.7 + p.seed, p.seed, p.age * 2.1);
 }
}
function syncRaceProps(view, propNodes, materials) {
 const props = view.race?.props;
 if (!Array.isArray(props)) return;
 for (const prop of props) {
  let node = propNodes.get(prop.id);
  if (!node) { node = makeProp(view, prop, materials); propNodes.set(prop.id, node); }
  node.setEnabled(prop.active !== false); slopePose(node, prop.x, prop.z, prop.yaw || 0, 0, prop.tilt || 0);
 }
}
function updateDynamicShadows(view, shadowRoots, state, player, dt) {
 if (!view.shadow || !player) return;
 state.timer = (state.timer || 0) + dt;
 if (state.timer < .2) return;
 state.timer = 0;
 for (const mesh of state.meshes) view.shadow.removeShadowCaster(mesh);
 state.meshes.clear();
 const nearest = shadowRoots.map(root => { const dx = root.position.x - player.x, dz = root.position.z - player.z; return { root, d: dx * dx + dz * dz }; }).filter(item => item.d < 130 * 130).sort((a,b) => a.d - b.d).slice(0, 40);
 for (const item of nearest) for (const mesh of item.root.getChildMeshes(false)) { view.shadow.addShadowCaster(mesh); state.meshes.add(mesh); }
}
export function buildMountainWorld(view) {
 const scene = view.scene, track = view.race.track, bounds = track.bounds, layout = mountainLayout(track), counts = {}, texturePromises = [], shadowRoots = [];
 scene.clearColor = new B.Color4(.92, .55, .35, 1); scene.fogColor = color('#d69b75'); scene.fogDensity = view.quality === 'high' ? .00125 : .00165; scene.ambientColor = color('#a56f5c');
 if (view.hemi) { view.hemi.intensity = .72; view.hemi.groundColor = color('#3e4738'); }
 if (view.sun) { view.sun.direction = v(-.72, -.48, .42); view.sun.position = v(260, 210, -210); view.sun.intensity = 2.7; }
 const asphalt = pbr(view, 'local-pbr-detailed-asphalt', '#46494a', .83, 0), ground = pbr(view, 'lush-mountain-ground', '#567342', .96, 0), rock = pbr(view, 'repeated-moss-stone-rock', '#6f7668', .88, 0);
 texturePromises.push(loadTexture(scene, asset('../assets/environment/asphalt-diff.jpg'), 'asphalt-diff', 1).then(t => asphalt.albedoTexture = t));
 texturePromises.push(loadTexture(scene, asset('../assets/environment/asphalt-normal.jpg'), 'asphalt-normal', 1).then(t => { asphalt.bumpTexture = t; asphalt.bumpTexture.level = .075; }));
 texturePromises.push(loadTexture(scene, asset('../assets/environment/asphalt-rough.jpg'), 'asphalt-rough', 1).then(t => assignMetallicRoughness(asphalt, t)));
 texturePromises.push(loadTexture(scene, asset('../assets/environment/rock-diff.jpg'), 'rock-diff', 1).then(t => rock.albedoTexture = t));
 texturePromises.push(loadTexture(scene, asset('../assets/environment/rock-normal.jpg'), 'rock-normal', 1).then(t => { rock.bumpTexture = t; rock.bumpTexture.level = .12; }));
 texturePromises.push(loadTexture(scene, asset('../assets/environment/rock-rough.jpg'), 'rock-rough', 1).then(t => assignMetallicRoughness(rock, t)));
 view.roadMaterial = asphalt;
 const petalMat = new B.StandardMaterial('unlit-sakura-petal-material', scene); petalMat.diffuseColor = color('#f7b4c8'); petalMat.emissiveColor = color('#f1a7bd'); petalMat.specularColor = B.Color3.Black(); petalMat.backFaceCulling = false;
 const materials = { asphalt, ground, rock, white: pbr(view, 'slightly-worn-white-road-paint', '#f3f1df', .58, 0), yellow: pbr(view, 'warm-yellow-center-paint', '#e6c13d', .5, 0), curb: pbr(view, 'banked-concrete-curb', '#c8c5b6', .78, 0), dark: pbr(view, 'dark-weathered-metal', '#343a3b', .62, .25), rail: pbr(view, 'visible-galvanized-guardrail', '#aeb7b4', .38, .65), railDark: pbr(view, 'dark-guardrail-post', '#4a5352', .48, .45), orange: pbr(view, 'orange-safety-cone', '#d96c2d', .55, 0), mountainNear: pbr(view, 'warm-near-mountain', '#5d716b', .95, 0), mountainFar: pbr(view, 'hazy-far-mountain', '#82908a', .98, 0), templeWall: pbr(view, 'distant-temple-wall', '#d3c6a3', .82, 0), templeRoof: pbr(view, 'distant-temple-roof', '#7d2f32', .55, 0), petal: petalMat };
 view.sceneryMaterials = materials; makeSky(view, materials); addTerrain(view, materials, bounds, counts); addRoad(view, materials, counts); addWalls(view, layout, materials, counts); addGuardrails(view, materials, counts); const propNodes = addProps(view, layout, materials, counts); addMountainsAndTemple(view, materials, bounds, counts); const petals = addPetals(view, materials, counts);
 const shadowState = { timer: .2, meshes: new Set() };
 view.scenery = { ready: null, name: MOUNTAIN.name, preview: true, propNodes, petals, setWeather(weather) { const wet = weather === 'wet'; scene.fogDensity = wet ? .0026 : (view.quality === 'high' ? .00125 : .00165); if (view.sun) view.sun.intensity = wet ? 1.05 : 2.7; if (view.hemi) view.hemi.intensity = wet ? .62 : .72; asphalt.roughness = wet ? .42 : .83; asphalt.metallic = 0; asphalt.environmentIntensity = wet ? 1.05 : .82; }, update(dt, player, phase) { syncRaceProps(view, propNodes, materials); updatePetals(view, petals, dt, player, phase); updateDynamicShadows(view, shadowRoots, shadowState, player, dt); if (phase === 'menu' && view.camera && player) { const targetS = track.length * .68, focus = track.at(targetS, 0), eye = track.at(targetS - 58, -82); const desired = v(eye.x, roadHeight(eye.x, eye.z) + 42, eye.z); B.Vector3.LerpToRef(view.camera.position, desired, 1 - Math.exp(-dt * 2.2), view.camera.position); view.camera.setTarget(v(focus.x, roadHeight(focus.x, focus.z) + 2.4, focus.z)); } } };
 view.scenery.ready = Promise.all(texturePromises).then(() => addAssetTrees(view, layout, counts, shadowRoots)).then(() => scene.whenReadyAsync()).then(() => {
  if (view.createRain) view.createRain(); view.scenery.setWeather(view.race.weather); scene.metadata = scene.metadata || {}; scene.metadata.scenery = { name: MOUNTAIN.name, circuitId: MOUNTAIN.id, preview: true, counts: { ...counts, sharedLayoutTrees: layout.trees.length, sharedLayoutWalls: layout.walls.length, staticMeshes: scene.meshes.length, materials: Object.keys(view.materials).length, quality: view.quality }, textureMemoryBoundMB: 96, interfaces: ['buildMountainWorld(view)', 'view.scenery.ready', 'view.updateScenery(dt, player, phase)', 'scene.metadata.scenery'], caveats: ['Tree and PBR texture asset load failures reject view.scenery.ready.', 'Dynamic tree shadows are refreshed at 200 ms intervals and capped to 40 nearest trees; car shadow casters remain fixed.', 'Visible guardrails are placed at the physics barrier offset.'] };
  return scene.metadata.scenery;
 }).catch(error => { view.scenery.error = error; throw error; });
}
