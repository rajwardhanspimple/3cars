import { HALF_WIDTH, BARRIER } from './sim.js';
import { CIRCUIT, trackBounds } from './circuit.js';

const B = globalThis.BABYLON;
const v = (x = 0, y = 0, z = 0) => new B.Vector3(x, y, z);
const color = hex => B.Color3.FromHexString(hex);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function seeded(seed) {
 return () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
 };
}

function makeTexture(scene, name, base, accent, metres = 1, normal = false, petals = false) {
 const tex = new B.DynamicTexture(name, { width: 512, height: 512 }, scene, false);
 const ctx = tex.getContext();
 const img = ctx.createImageData(512, 512);
 let seed = 1207;
 for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const i = (y * 512 + x) * 4;
  const streak = Math.sin((x + y * .35) * .045) * 10;
  const grain = ((seed / 4294967296) - .5) * 38;
  if (normal) {
   img.data[i] = 128 + streak * .35;
   img.data[i + 1] = 128 + grain * .18;
   img.data[i + 2] = 238;
  } else if (petals && seed % 251 < 5) {
   img.data[i] = 224 + (seed % 28);
   img.data[i + 1] = 156 + (seed % 45);
   img.data[i + 2] = 184 + (seed % 35);
  } else {
   img.data[i] = clamp(base[0] + accent[0] * Math.sin(x * .021) + grain + streak, 0, 255);
   img.data[i + 1] = clamp(base[1] + accent[1] * Math.sin(y * .018) + grain * .7, 0, 255);
   img.data[i + 2] = clamp(base[2] + accent[2] * Math.sin((x + y) * .012) + grain * .5, 0, 255);
  }
  img.data[i + 3] = 255;
 }
 ctx.putImageData(img, 0, 0);
 tex.update();
 tex.uScale = 1 / metres;
 tex.vScale = 1 / metres;
 return tex;
}

function makeSkyTexture(scene) {
 const tex = new B.DynamicTexture('spring-sky-gradient-clouds', { width: 1024, height: 512 }, scene, false);
 const ctx = tex.getContext();
 for (let y = 0; y < 512; y++) {
  const t = y / 511;
  ctx.fillStyle = `rgb(${(122 * (1 - t) + 210 * t) | 0},${(173 * (1 - t) + 228 * t) | 0},${(202 * (1 - t) + 232 * t) | 0})`;
  ctx.fillRect(0, y, 1024, 1);
 }
 ctx.globalAlpha = .34;
 for (let i = 0; i < 26; i++) {
  const x = (i * 211) % 1100 - 80, y = 75 + (i * 47) % 180, w = 90 + (i % 5) * 26;
  const grad = ctx.createRadialGradient(x, y, 4, x, y, w);
  grad.addColorStop(0, 'rgba(255,255,255,.72)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.ellipse(x, y, w, w * .28, 0, 0, Math.PI * 2); ctx.fill();
 }
 ctx.globalAlpha = 1;
 tex.update();
 return tex;
}

function deformMesh(mesh, rnd, amount = .18) {
 const positions = mesh.getVerticesData(B.VertexBuffer.PositionKind);
 for (let i = 0; i < positions.length; i += 3) {
  const f = 1 + (rnd() - .5) * amount;
  positions[i] *= f;
  positions[i + 1] *= 1 + (rnd() - .5) * amount * .6;
  positions[i + 2] *= f;
 }
 mesh.setVerticesData(B.VertexBuffer.PositionKind, positions);
 const normals = [];
 B.VertexData.ComputeNormals(positions, mesh.getIndices(), normals);
 mesh.setVerticesData(B.VertexBuffer.NormalKind, normals);
}

function stripMesh(scene, name, left, right, material, metresPerRepeat = 8) {
 const positions = [], indices = [], uvs = [];
 const n = Math.min(left.length, right.length);
 for (let i = 0; i < n; i++) {
  positions.push(left[i].x, left[i].y, left[i].z, right[i].x, right[i].y, right[i].z);
  const dx = right[i].x - left[i].x, dz = right[i].z - left[i].z;
  const width = Math.hypot(dx, dz);
  const u = i / Math.max(1, n - 1);
  uvs.push(u, 0, u, width / metresPerRepeat);
  if (i < n - 1) {
   const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
   indices.push(a, c, b, b, c, d);
  }
 }
 const mesh = new B.Mesh(name, scene);
 const data = new B.VertexData();
 data.positions = positions;
 data.indices = indices;
 data.uvs = uvs;
 const normals = [];
 B.VertexData.ComputeNormals(positions, indices, normals);
 data.normals = normals;
 data.applyToMesh(mesh);
 if (mesh.getTotalVertices() * 2 !== uvs.length) throw new Error(`${name} UV length mismatch`);
 mesh.material = material;
 mesh.receiveShadows = true;
 return mesh;
}

function metricBand(view, name, inner, outer, material, y = .025, metresPerRepeat = 8) {
 const track = view.race.track, left = [], right = [];
 for (let i = 0; i <= track.points.length; i++) {
  const s = i === track.points.length ? track.length : track.points[i].s;
  const a = track.at(s, inner), b = track.at(s, outer);
  left.push(v(a.x, y, a.z));
  right.push(v(b.x, y, b.z));
 }
 const mesh = stripMesh(view.scene, name, left, right, material, metresPerRepeat);
 const uvs = mesh.getVerticesData(B.VertexBuffer.UVKind);
 for (let i = 0; i <= track.points.length; i++) {
  const s = i === track.points.length ? track.length : track.points[i].s;
  uvs[i * 4] = s / metresPerRepeat;
  uvs[i * 4 + 2] = s / metresPerRepeat;
 }
 mesh.setVerticesData(B.VertexBuffer.UVKind, uvs);
 return mesh;
}

function clearFootprint(track, x, z, radius = 1, margin = 6) {
 const limit = BARRIER + margin;
 if (track.project(x, z).distance <= limit + radius) return false;
 const samples = Math.max(6, Math.ceil(radius / 2));
 for (let i = 0; i < samples; i++) {
  const a = i / samples * Math.PI * 2;
  if (track.project(x + Math.sin(a) * radius, z + Math.cos(a) * radius).distance <= limit) return false;
 }
 return true;
}

function addBox(view, name, size, pos, material, rotY = 0, parent = null) {
 const mesh = view.box(name, size, pos, material, parent);
 mesh.rotation.y = rotY;
 return mesh;
}

function makeInstance(base, name, position, scaling, rotationY = 0, rotationX = 0, rotationZ = 0) {
 const mesh = base.createInstance(name);
 mesh.position.copyFrom(position);
 mesh.scaling.copyFrom(scaling);
 mesh.rotation.set(rotationX, rotationY, rotationZ);
 mesh.isVisible = true;
 mesh.receiveShadows = true;
 return mesh;
}

function addRoadBands(view, materials) {
 metricBand(view, 'outer-runoff-left', -BARRIER - 7, -HALF_WIDTH - .55, materials.runoff, .006, 6);
 metricBand(view, 'outer-runoff-right', HALF_WIDTH + .55, BARRIER + 7, materials.runoff, .006, 6);
 metricBand(view, 'sakura-asphalt', -HALF_WIDTH, HALF_WIDTH, materials.asphalt, .026, 7);
 metricBand(view, 'left-edge-line', -HALF_WIDTH + .14, -HALF_WIDTH + .32, materials.white, .041, 2);
 metricBand(view, 'right-edge-line', HALF_WIDTH - .32, HALF_WIDTH - .14, materials.white, .041, 2);
 const track = view.race.track;
 let patches = 0;
 for (let s = 40; s < track.length; s += 92) {
  const left = [], right = [];
  for (let i = 0; i <= 8; i++) {
   const d = s + i / 8 * 22, center = Math.sin(d * .012) * 1.2;
   const a = track.at(d, center - 1.05), b = track.at(d, center + 1.05);
   left.push(v(a.x, .047, a.z)); right.push(v(b.x, .047, b.z));
  }
  const patch = stripMesh(view.scene, 'subtle-racing-patch', left, right, materials.seal, 5);
  patch.receiveShadows = false;
  patches++;
 }
 return patches;
}

function addTerrain(view, track, materials, bounds, counts) {
 const size = 1120, half = size / 2, cells = view.quality === 'high' ? 60 : 44;
 const cellDiag = Math.SQRT2 * size / cells;
 const positions = [], indices = [], uvs = [];
 const originX = bounds.centerX - half, originZ = bounds.centerZ - half, step = size / cells;
 const heightAt = (x, z) => {
  const p = track.project(x, z);
  if (p.distance <= BARRIER + cellDiag + 8) return -0.16;
  const roadBlend = smoothstep(BARRIER + cellDiag + 8, BARRIER + cellDiag + 64, p.distance);
  const dxRiver = Math.abs(x - CIRCUIT.riverX);
  const riverCut = smoothstep(48, 20, dxRiver) * smoothstep(bounds.minZ - 210, bounds.minZ - 120, z) * (1 - smoothstep(bounds.maxZ + 120, bounds.maxZ + 210, z));
  const broad = Math.sin(x * .011) * 8 + Math.cos(z * .014) * 7 + Math.sin((x + z) * .007) * 6;
  const ridge = Math.max(0, p.distance - 120) * .075;
  return -0.16 + roadBlend * (broad + ridge) - riverCut * 9;
 };
 for (let iz = 0; iz <= cells; iz++) for (let ix = 0; ix <= cells; ix++) {
  const x = originX + ix * step;
  const z = originZ + iz * step;
  const h = heightAt(x, z);
  if (track.project(x, z).distance <= BARRIER + cellDiag + 8 && h > 0) throw new Error('terrain corridor above road');
  positions.push(x, h, z);
  uvs.push(x / 6, z / 6);
 }
 const vertexHeight = (ix, iz) => positions[((iz * (cells + 1) + ix) * 3) + 1];
 view.sceneryGroundHeight = (x, z) => {
  const fx = clamp((x - originX) / step, 0, cells), fz = clamp((z - originZ) / step, 0, cells);
  const ix = Math.min(cells - 1, Math.max(0, Math.floor(fx))), iz = Math.min(cells - 1, Math.max(0, Math.floor(fz)));
  const tx = fx - ix, tz = fz - iz;
  const h00 = vertexHeight(ix, iz), h10 = vertexHeight(ix + 1, iz), h01 = vertexHeight(ix, iz + 1), h11 = vertexHeight(ix + 1, iz + 1);
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
 };
 for (let iz = 0; iz < cells; iz++) for (let ix = 0; ix < cells; ix++) {
  const a = iz * (cells + 1) + ix, b = a + 1, c = a + cells + 1, d = c + 1;
  indices.push(a, c, b, b, c, d);
 }
 const mesh = new B.Mesh('sculpted-sakura-valley-terrain', view.scene);
 const data = new B.VertexData();
 data.positions = positions; data.indices = indices; data.uvs = uvs;
 const normals = []; B.VertexData.ComputeNormals(positions, indices, normals); data.normals = normals;
 data.applyToMesh(mesh);
 mesh.material = materials.grass;
 mesh.receiveShadows = true;
 counts.terrainVertices = positions.length / 3;
 counts.terrainFlatMargin = BARRIER + cellDiag + 8;
 counts.groundHeightSampler = 'bilinear-terrain-grid';
 return mesh;
}

function addKerbsAndGuards(view, track, materials, counts) {
 const kerbs = [], rails = [], posts = [], planks = [];
 for (let s = 0, n = 0; s < track.length; s += 4.1, n++) for (const side of [-1, 1]) {
  const k = track.at(s, side * (HALF_WIDTH + .56));
  kerbs.push(addBox(view, 'sakura-kerb', [1.08, .13, 4.2], [k.x, .055, k.z], n % 2 ? materials.white : materials.kerb, k.heading));
  if (n % 2 === 0) {
   const g = track.at(s, side * (BARRIER + 1.25));
   rails.push(addBox(view, 'steel-guardrail', [.22, .32, 7.6], [g.x, .92, g.z], materials.steel, g.heading));
   rails.push(addBox(view, 'steel-guardrail', [.18, .24, 7.6], [g.x, 1.36, g.z], materials.steel, g.heading));
   posts.push(addBox(view, 'guard-post', [.18, 1.45, .18], [g.x, .72, g.z], materials.darkSteel, g.heading));
  }
  if (n % 7 === 0) {
   const w = track.at(s, side * (BARRIER + 4.2));
   planks.push(addBox(view, 'wood-fence', [.18, .26, 6.8], [w.x, 1.1, w.z], materials.wood, w.heading));
   posts.push(addBox(view, 'wood-post', [.28, 1.8, .28], [w.x, .9, w.z], materials.wood, w.heading));
  }
 }
 view.merge(kerbs, 'batched-striped-kerbs');
 view.merge(rails, 'batched-steel-guardrails');
 view.merge(posts, 'batched-guard-posts');
 view.merge(planks, 'batched-wood-rails');
 counts.kerbs = kerbs.length;
 counts.guardrails = rails.length + posts.length + planks.length;
}

function addPaddock(view, track, materials, counts) {
 const start = track.at(0);
 const gantry = new B.TransformNode('sakura-start-gantry', view.scene);
 gantry.position = v(start.x, 0, start.z);
 gantry.rotation.y = start.heading;
 for (const side of [-1, 1]) {
  addBox(view, 'gantry-bamboo-clad-pole', [.72, 7.8, .72], [side * 10.8, 3.9, 0], materials.darkSteel, 0, gantry);
  addBox(view, 'gantry-foot', [1.7, .25, 1.7], [side * 10.8, .12, 0], materials.concrete, 0, gantry);
 }
 addBox(view, 'gantry-top', [23, .76, 1.1], [0, 7.4, 0], materials.redLacquer, 0, gantry);
 view.sign('Sakura Valley Circuit', [0, 6.45, -.1], 17.8, 1.75, gantry);
 const paddockRoot = new B.TransformNode('paddock-clear-root', view.scene);
 const base = track.at(0, -46);
 paddockRoot.position = v(base.x, 0, base.z);
 paddockRoot.rotation.y = start.heading;
 const paddock = [];
 for (let i = 0; i < 8; i++) {
  const x = -55 + i * 15.7;
  paddock.push(addBox(view, 'pit-garage', [13.5, 5.5, 13.8], [x, 2.75, 0], materials.paddock, 0, paddockRoot));
  paddock.push(addBox(view, 'garage-door', [11.7, 3.6, .13], [x, 1.86, 6.92], materials.door, 0, paddockRoot));
  paddock.push(addBox(view, 'glass-timing-suite', [12.7, 2.85, 10.5], [x, 6.92, -.2], materials.glass, 0, paddockRoot));
  paddock.push(addBox(view, 'pit-roof', [14.2, .22, 14.4], [x, 8.48, -.2], materials.white, 0, paddockRoot));
 }
 const deckRoot = new B.TransformNode('paddock-spectator-deck', view.scene);
 const deckBase = track.at(18, -62);
 deckRoot.position = v(deckBase.x, 0, deckBase.z);
 deckRoot.rotation.y = start.heading;
 const deckParts = [];
 deckParts.push(addBox(view, 'deck-floor', [78, .42, 15], [0, 4.3, 0], materials.wood, 0, deckRoot));
 deckParts.push(addBox(view, 'deck-roof', [82, .32, 17], [0, 8.1, 0], materials.white, 0, deckRoot));
 for (let x = -36; x <= 36; x += 16) deckParts.push(addBox(view, 'deck-post', [.35, 7.8, .35], [x, 4, -6.4], materials.darkSteel, 0, deckRoot));
 for (let row = 0; row < 4; row++) deckParts.push(addBox(view, 'deck-bench', [72, .32, 1.2], [0, 4.85 + row * .42, -3.8 + row * 2.2], materials.redLacquer, 0, deckRoot));
 for (let i = 0; i < 72; i++) {
  const p = B.MeshBuilder.CreateSphere('deck-spectator', { diameter: .46, segments: 5 }, view.scene);
  p.position = v(-34 + (i % 24) * 2.9, 5.35 + Math.floor(i / 24) * .45, -4 + Math.floor(i / 24) * 2.2);
  p.parent = deckRoot;
  p.material = [materials.kerb, materials.door, materials.white, materials.wood][i % 4];
  deckParts.push(p);
 }
 view.merge(paddock, 'batched-paddock-buildings');
 counts.paddockMeshes = paddock.length + deckParts.length + 4;
 counts.paddockOffset = -46;
}

function turnSites(track) {
 const sites = [];
 for (let s = 20; s < track.length; s += 8) {
  const c0 = Math.abs(track.curvature(s)), c1 = Math.abs(track.curvature(s - 8)), c2 = Math.abs(track.curvature(s + 8));
  if (c0 > .014 && c0 >= c1 && c0 >= c2 && sites.every(p => Math.abs(p.s - s) > 80)) sites.push({ s, curve: track.curvature(s) });
 }
 return sites.slice(0, 12);
}

function addMarkers(view, track, materials, counts) {
 const sites = turnSites(track);
 let signs = 0;
 for (const site of sites) {
  const side = site.curve > 0 ? 1 : -1;
  for (const distance of [150, 100]) {
   const p = track.at(site.s - distance, side * (BARRIER + 7.5));
   const node = new B.TransformNode('curvature-braking-board', view.scene);
   node.position = v(p.x, 0, p.z);
   node.rotation.y = p.heading;
   addBox(view, 'braking-post', [.15, 1.9, .15], [0, .95, 0], materials.darkSteel, 0, node);
   addBox(view, 'braking-board-back', [2.0, 1.2, .12], [0, 1.85, 0], materials.white, 0, node);
   view.sign(String(distance), [0, 1.85, -.08], 1.75, .82, node);
   signs++;
  }
  const p = track.at(site.s, side * (BARRIER + 2.4));
  const node = new B.TransformNode('curvature-chevron-node', view.scene);
  node.position = v(p.x, 0, p.z);
  node.rotation.y = p.heading + (side > 0 ? Math.PI * .5 : -Math.PI * .5);
  for (let i = 0; i < 3; i++) {
   addBox(view, 'chevron-panel', [2.1, 1.1, .1], [i * 2.3, 1.25, 0], materials.white, 0, node);
   const stripe = addBox(view, 'chevron-stripe', [.42, 1.24, .12], [i * 2.3 - .34, 1.25, -.07], materials.kerb, 0, node);
   stripe.rotation.z = side > 0 ? -.7 : .7;
  }
  signs++;
 }
 counts.turnMarkers = sites.length;
 counts.signs = signs;
}

function addRiver(view, materials, bounds, counts) {
 const x0 = CIRCUIT.riverX;
 const west = [], east = [], bankA = [], bankB = [];
 const minZ = bounds.minZ - 210, maxZ = bounds.maxZ + 210;
 for (let i = 0; i <= 110; i++) {
  const u = i / 110;
  const z = minZ + (maxZ - minZ) * u;
  const wave = Math.sin(u * Math.PI * 5.2) * 10 + Math.sin(u * Math.PI * 13) * 3.5;
  const cx = x0 + wave;
  const width = 25 + Math.sin(u * Math.PI * 4) * 4;
  west.push(v(cx - width, .018, z));
  east.push(v(cx + width, .018, z));
  bankA.push(v(cx - width - 8, .07, z));
  bankB.push(v(cx + width + 8, .07, z));
 }
 const river = stripMesh(view.scene, 'azuma-river-visible-water', west, east, materials.water, 8);
 river.receiveShadows = false;
 const leftBank = stripMesh(view.scene, 'rocky-west-bank', bankA, west, materials.rock, 5);
 const rightBank = stripMesh(view.scene, 'rocky-east-bank', east, bankB, materials.rock, 5);
 leftBank.receiveShadows = rightBank.receiveShadows = true;
 const rocks = [];
 for (let i = 0; i < 64; i++) {
  const u = i / 64, z = minZ + (maxZ - minZ) * u, side = i % 2 ? -1 : 1;
  const cx = x0 + Math.sin(u * Math.PI * 5.2) * 10 + Math.sin(u * Math.PI * 13) * 3.5;
  const rock = B.MeshBuilder.CreatePolyhedron('river-rock', { type: 2, size: 1 + (i % 5) * .22 }, view.scene);
  rock.position = v(cx + side * (30 + (i % 7)), .28, z + Math.sin(i) * 5);
  rock.scaling.set(1.5 + (i % 3) * .5, .55, 1 + (i % 4) * .4);
  rock.rotation.y = i * .71;
  rock.material = materials.rock;
  rocks.push(rock);
 }
 view.merge(rocks, 'batched-river-rocks');
 counts.riverSegments = 110;
 counts.riverRocks = rocks.length;
}

function addMountains(view, materials, bounds, counts) {
 const mountains = [];
 for (let i = 0; i < 22; i++) {
  const a = i / 22 * Math.PI * 2;
  const m = B.MeshBuilder.CreateCylinder('layered-distant-mountain', { height: 90 + (i % 5) * 32, diameterTop: 6, diameterBottom: 190 + (i % 4) * 35, tessellation: 7 }, view.scene);
  m.position = v(bounds.centerX + Math.sin(a) * 700, -2, bounds.centerZ + Math.cos(a) * 700);
  m.rotation.y = a * 1.7;
  m.material = i % 2 ? materials.mountain : materials.mountainFar;
  m.receiveShadows = false;
  mountains.push(m);
 }
 view.merge(mountains, 'batched-distant-mountains');
 counts.mountains = mountains.length;
}

function addTrees(view, track, materials, bounds, counts) {
 const rnd = seeded(CIRCUIT.scenerySeed);
 const groundAt = view.sceneryGroundHeight || (() => -0.16);
 const trunkBase = B.MeshBuilder.CreateCylinder('sakura-trunk-source', { height: 1, diameter: 1, tessellation: 7 }, view.scene);
 trunkBase.material = materials.bark; trunkBase.isVisible = false;
 const branchBase = B.MeshBuilder.CreateCylinder('sakura-branch-source', { height: 1, diameter: 1, tessellation: 6 }, view.scene);
 branchBase.material = materials.bark; branchBase.isVisible = false;
 const blossomBase = B.MeshBuilder.CreateSphere('blossom-cluster-source', { segments: 8, diameter: 1 }, view.scene);
 blossomBase.material = materials.blossom; deformMesh(blossomBase, rnd, .34); blossomBase.isVisible = false;
 const blossomWhite = B.MeshBuilder.CreateSphere('white-blossom-cluster-source', { segments: 8, diameter: 1 }, view.scene);
 blossomWhite.material = materials.blossomWhite; deformMesh(blossomWhite, rnd, .28); blossomWhite.isVisible = false;
 const coniferBase = B.MeshBuilder.CreateCylinder('conifer-source', { height: 1, diameterTop: .12, diameterBottom: 1, tessellation: 7 }, view.scene);
 coniferBase.material = materials.conifer; coniferBase.isVisible = false;
 const mixedBase = B.MeshBuilder.CreateSphere('mixed-leaf-source', { segments: 7, diameter: 1 }, view.scene);
 mixedBase.material = materials.leaf; deformMesh(mixedBase, rnd, .24); mixedBase.isVisible = false;
 let sakura = 0, woodland = 0, shadowed = 0, rejected = 0;
 const addCaster = mesh => { if (shadowed < 180 && view.shadow) { view.shadow.addShadowCaster(mesh); shadowed++; } };
 const addSakura = (x, z, scale, heading = 0) => {
  const gy = groundAt(x, z);
  const trunk = makeInstance(trunkBase, 'sakura-trunk', v(x, gy + 2.15 * scale, z), v(.55 * scale, 4.3 * scale, .55 * scale), heading, .03 * (rnd() - .5), .08 * (rnd() - .5));
  addCaster(trunk);
  for (let b = 0; b < 4; b++) {
   const a = heading + b * Math.PI * .5 + (rnd() - .5) * .55;
   const br = makeInstance(branchBase, 'sakura-connected-branch', v(x + Math.sin(a) * 1.0 * scale, gy + (3.8 + rnd() * .7) * scale, z + Math.cos(a) * 1.0 * scale), v(.18 * scale, (2.4 + rnd() * .6) * scale, .18 * scale), a, .65 + rnd() * .22, Math.sin(a) * .65);
   if (b < 2) addCaster(br);
  }
  for (let c = 0; c < 8; c++) {
   const a = heading + c * .78 + (rnd() - .5) * .3;
   const r = (1.3 + rnd() * 2.2) * scale, y = gy + (4.4 + rnd() * 2.2) * scale;
   const mesh = makeInstance(c % 3 === 0 ? blossomWhite : blossomBase, 'irregular-sakura-blossom', v(x + Math.sin(a) * r, y, z + Math.cos(a) * r), v((1.6 + rnd() * 1.2) * scale, (.9 + rnd() * .65) * scale, (1.3 + rnd() * 1.1) * scale), rnd() * Math.PI, (rnd() - .5) * .45);
   if (c < 3) addCaster(mesh);
  }
 };
 for (let s = 18; s < track.length; s += 32) for (const side of [-1, 1]) {
  if ((s / 32 | 0) % 3 === 1 && side < 0) continue;
  let placed = false;
  for (const extra of [0, 7, 14]) {
   const p = track.at(s, side * (BARRIER + 18 + extra + rnd() * 7));
   const scale = .82 + rnd() * .28;
   if (clearFootprint(track, p.x, p.z, 9 * scale, 7)) { addSakura(p.x, p.z, scale, p.heading); sakura++; placed = true; break; }
  }
  if (!placed) rejected++;
 }
 let tries = 0;
 while (woodland < 78 && tries++ < 420) {
  const x = bounds.centerX - 455 + rnd() * 910, z = bounds.centerZ - 455 + rnd() * 910;
  if (Math.abs(x - CIRCUIT.riverX) < 56 && z > bounds.minZ - 230 && z < bounds.maxZ + 230) { rejected++; continue; }
  if (!clearFootprint(track, x, z, 12, 12)) { rejected++; continue; }
  const gy = groundAt(x, z);
  makeInstance(trunkBase, 'woodland-trunk', v(x, gy + 2.1, z), v(.46, 4.2, .46), rnd() * Math.PI);
  if (woodland % 2) makeInstance(coniferBase, 'layered-conifer', v(x, gy + 6.7, z), v(5 + rnd() * 2, 9 + rnd() * 4, 5 + rnd() * 2), rnd() * Math.PI);
  else makeInstance(mixedBase, 'mixed-woodland-crown', v(x, gy + 6.0 + rnd() * 2, z), v(4 + rnd() * 2, 3 + rnd() * 1.4, 4 + rnd() * 2), rnd() * Math.PI);
  woodland++;
 }
 counts.sakuraTrees = sakura;
 counts.woodlandTrees = woodland;
 counts.rejectedPlacements = rejected;
 counts.shadowCasters = shadowed;
}

function addSkyAndLighting(view, materials) {
 const sky = B.MeshBuilder.CreateBox('painted-spring-sky', { size: 1400 }, view.scene);
 const skyMat = new B.StandardMaterial('spring-sky-gradient-material', view.scene);
 skyMat.backFaceCulling = false;
 skyMat.disableLighting = true;
 skyMat.diffuseTexture = makeSkyTexture(view.scene);
 skyMat.emissiveColor = color('#ffffff');
 sky.material = skyMat;
 sky.infiniteDistance = true;
 sky.isPickable = false;
 materials.sky = skyMat;
}

export function buildScenicWorld(view) {
 const scene = view.scene, track = view.race.track, bounds = trackBounds(track.points), high = view.quality === 'high';
 const counts = {};
 const asphalt = view.mat('wet-sakura-asphalt', '#5e6569', 0, .86);
 asphalt.albedoTexture = makeTexture(scene, 'asphalt-grain-metre', [72, 76, 79], [9, 7, 6], 1.0);
 asphalt.bumpTexture = makeTexture(scene, 'asphalt-normal-metre', [128, 128, 238], [0, 0, 0], 1.0, true);
 asphalt.bumpTexture.level = .045;
 asphalt.environmentIntensity = .82;
 view.roadMaterial = asphalt;
 const grass = view.mat('spring-grass-petals', '#7f9466', 0, .98);
 grass.albedoTexture = makeTexture(scene, 'grass-petal-noise-metre', [118, 146, 88], [20, 18, 10], 1.3, false, true);
 grass.bumpTexture = makeTexture(scene, 'grass-normal-metre', [128, 128, 238], [0, 0, 0], 1.6, true);
 grass.bumpTexture.level = .035;
 const bark = view.mat('ridged-bark', '#6f5544', 0, .92);
 bark.albedoTexture = makeTexture(scene, 'bark-ridges-metre', [92, 69, 52], [22, 14, 7], .9);
 bark.bumpTexture = makeTexture(scene, 'bark-normal-metre', [128, 128, 238], [0, 0, 0], .9, true);
 bark.bumpTexture.level = .085;
 const seal = view.mat('subtle-wet-racing-patch', '#30383a', 0, .44);
 seal.alpha = .24; seal.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHABLEND;
 const water = view.mat('river-water-visible', '#527e8f', .1, .18);
 water.alpha = .82; water.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHABLEND;
 const materials = {
  asphalt, grass, bark, seal, water,
  runoff: view.mat('compacted-runoff', '#bbb6a3', 0, .88),
  white: view.mat('soft-white-paint', '#ecf0ec', 0, .62),
  kerb: view.mat('sakura-red-kerb', '#b6423c', 0, .58),
  steel: view.mat('galvanized-steel', '#a8b2b2', .55, .34),
  darkSteel: view.mat('dark-steel', '#4d595d', .35, .42),
  wood: view.mat('weathered-cedar', '#806a4a', 0, .8),
  concrete: view.mat('warm-concrete', '#c6c0ad', 0, .88),
  redLacquer: view.mat('deep-red-lacquer', '#87322f', .05, .32),
  paddock: view.mat('paddock-walls', '#d9ded9', 0, .76),
  door: view.mat('garage-door-blue', '#24485b', .25, .46),
  glass: view.mat('soft-reflective-glass', '#3a6578', .35, .18),
  rock: view.mat('river-rock', '#7d7f78', 0, .78),
  mountain: view.mat('near-mountain-blue', '#6d858b', 0, .94),
  mountainFar: view.mat('far-mountain-blue', '#8fa4a8', 0, .96),
  blossom: view.mat('dense-pink-blossom', '#f2a8bf', 0, .82),
  blossomWhite: view.mat('white-pink-blossom', '#f6dde5', 0, .86),
  conifer: view.mat('hinoki-conifer', '#2f4c3e', 0, .96),
  leaf: view.mat('mixed-woodland-leaf', '#456443', 0, .95)
 };
 view.sceneryMaterials = materials;
 addSkyAndLighting(view, materials);
 addTerrain(view, track, materials, bounds, counts);
 counts.racingPatches = addRoadBands(view, materials);
 addKerbsAndGuards(view, track, materials, counts);
 addRiver(view, materials, bounds, counts);
 addMountains(view, materials, bounds, counts);
 addTrees(view, track, materials, bounds, counts);
 addPaddock(view, track, materials, counts);
 addMarkers(view, track, materials, counts);
 for (let row = 0; row < 2; row++) for (let col = 0; col < 12; col++) {
  const p = track.at(row * .85, (col - 5.5) * 1.5);
  addBox(view, 'finish-check', [1.5, .025, .85], [p.x, .049, p.z], (row + col) % 2 ? materials.asphalt : materials.white, p.heading);
 }
 for (let s = -11; s > -45; s -= 8) for (const side of [-1, 1]) {
  const p = track.at(s, side * 2.5);
  addBox(view, 'grid-mark', [2.6, .024, .16], [p.x, .052, p.z], materials.white, p.heading);
 }
 view.scenery = {
  riverPhase: 0,
  water: scene.getMeshByName('azuma-river-visible-water'),
  dry: { clear: new B.Color4(.72, .82, .88, 1), fog: color('#bed0d7'), sun: 2.25, hemi: .92 },
  wet: { clear: new B.Color4(.38, .47, .52, 1), fog: color('#7f929b'), sun: .72, hemi: .8 },
  setWeather(weather) {
   const wet = weather === 'wet', p = wet ? this.wet : this.dry;
   scene.clearColor = p.clear; scene.fogColor = p.fog; scene.fogDensity = wet ? .0035 : (high ? .00145 : .0019);
   if (view.sun) view.sun.intensity = p.sun;
   if (view.hemi) view.hemi.intensity = p.hemi;
   asphalt.roughness = wet ? .19 : .86; asphalt.metallic = wet ? .24 : 0; asphalt.environmentIntensity = wet ? 1.05 : .82;
   seal.alpha = wet ? .32 : .18; water.environmentIntensity = wet ? .95 : .76;
  },
  update(dt) {
   this.riverPhase += dt;
   if (this.water) this.water.material.environmentIntensity = .75 + Math.sin(this.riverPhase * .8) * .05;
  }
 };
 view.createRain();
 view.scenery.setWeather(view.race.weather);
 if (view.freezeStaticWorld) view.freezeStaticWorld();
 scene.metadata = scene.metadata || {};
 scene.metadata.scenery = {
  name: 'Sakura Valley', circuitId: CIRCUIT.id, riverX: CIRCUIT.riverX, bounds,
  counts: { ...counts, staticMeshes: scene.meshes.length, materials: Object.keys(view.materials).length, quality: view.quality },
  interfaces: ['buildScenicWorld(view)', 'view.updateScenery(dt, player, phase)', 'scene.metadata.scenery']
 };
}
