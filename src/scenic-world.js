import { HALF_WIDTH, BARRIER } from './sim.js';
import { CIRCUIT, trackBounds } from './circuit.js';

const B = globalThis.BABYLON;
const v = (x = 0, y = 0, z = 0) => new B.Vector3(x, y, z);
const color = hex => B.Color3.FromHexString(hex);

function seeded(seed) {
 return () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
 };
}

function makeTexture(scene, name, base, accent, scale = 18, normal = false) {
 const tex = new B.DynamicTexture(name, { width: 512, height: 512 }, scene, false);
 const ctx = tex.getContext();
 const img = ctx.createImageData(512, 512);
 let seed = 1207;
 for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const i = (y * 512 + x) * 4;
  const streak = Math.sin((x + y * .35) * .05) * 10;
  const grain = ((seed / 4294967296) - .5) * 44;
  const lane = normal ? 128 + streak * .65 + grain * .4 : 0;
  if (normal) {
   img.data[i] = 128 + streak * .35;
   img.data[i + 1] = 128 + grain * .18;
   img.data[i + 2] = 238;
  } else {
   img.data[i] = Math.max(0, Math.min(255, base[0] + accent[0] * Math.sin(x * .021) + grain + streak));
   img.data[i + 1] = Math.max(0, Math.min(255, base[1] + accent[1] * Math.sin(y * .018) + grain * .7));
   img.data[i + 2] = Math.max(0, Math.min(255, base[2] + accent[2] * Math.sin((x + y) * .012) + grain * .5));
  }
  img.data[i + 3] = 255;
  if (normal) img.data[i + 2] = Math.max(img.data[i + 2], lane);
 }
 ctx.putImageData(img, 0, 0);
 tex.update();
 tex.uScale = scale;
 tex.vScale = scale;
 return tex;
}

function setUvScale(mesh, scale = 1) {
 const uvs = mesh.getVerticesData(B.VertexBuffer.UVKind);
 if (!uvs) return;
 for (let i = 0; i < uvs.length; i++) uvs[i] *= scale;
 mesh.setVerticesData(B.VertexBuffer.UVKind, uvs);
}

function instance(base, name, position, scaling, rotationY = 0, rotationX = 0, rotationZ = 0) {
 const mesh = base.createInstance(name);
 mesh.position.copyFrom(position);
 mesh.scaling.copyFrom(scaling);
 mesh.rotation.set(rotationX, rotationY, rotationZ);
 return mesh;
}

function addBox(view, name, size, pos, material, rotY = 0, parent = null) {
 const mesh = view.box(name, size, pos, material, parent);
 mesh.rotation.y = rotY;
 return mesh;
}

function addRoadBands(view, materials) {
 view.band('outer-runoff-left', -BARRIER - 7, -HALF_WIDTH - .55, materials.runoff, .006);
 view.band('outer-runoff-right', HALF_WIDTH + .55, BARRIER + 7, materials.runoff, .006);
 view.band('sakura-asphalt', -HALF_WIDTH, HALF_WIDTH, materials.asphalt, .026);
 view.band('left-edge-line', -HALF_WIDTH + .14, -HALF_WIDTH + .32, materials.white, .041);
 view.band('right-edge-line', HALF_WIDTH - .32, HALF_WIDTH - .14, materials.white, .041);
 view.band('inner-wet-seal', -HALF_WIDTH + 1.5, HALF_WIDTH - 1.5, materials.seal, .044);
}

function addKerbsAndGuards(view, track, materials, counts) {
 const kerbs = [], rails = [], posts = [], planks = [];
 for (let s = 0, n = 0; s < track.length; s += 4.1, n++) {
  for (const side of [-1, 1]) {
   const k = track.at(s, side * (HALF_WIDTH + .56));
   const kerb = addBox(view, 'sakura-kerb', [1.08, .13, 4.2], [k.x, .055, k.z], n % 2 ? materials.white : materials.kerb, k.heading);
   kerbs.push(kerb);
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
 const paddock = [];
 for (let i = 0; i < 8; i++) {
  const x = -68 + i * 15.7;
  paddock.push(addBox(view, 'pit-garage', [13.5, 5.5, 13.8], [x, 2.75, -170], materials.paddock));
  paddock.push(addBox(view, 'garage-door', [11.7, 3.6, .13], [x, 1.86, -162.98], materials.door));
  paddock.push(addBox(view, 'glass-timing-suite', [12.7, 2.85, 10.5], [x, 6.92, -170.2], materials.glass));
  paddock.push(addBox(view, 'pit-roof', [14.2, .22, 14.4], [x, 8.48, -170.2], materials.white));
  paddock.push(addBox(view, 'bamboo-slat', [.16, 2.6, 13.9], [x - 6.9, 6.2, -170], materials.wood));
 }
 view.merge(paddock, 'batched-paddock-buildings');
 view.sign('SAKURA PADDOCK', [-10, 10.3, -162.8], 44, 3.1);
 counts.paddockMeshes = paddock.length + 4;
}

function addMarkers(view, track, materials, counts) {
 let signs = 0;
 for (let s = 72; s < track.length; s += 118) {
  for (const side of [-1, 1]) {
   const p = track.at(s, side * (BARRIER + 7.5));
   const node = new B.TransformNode('braking-board-node', view.scene);
   node.position = v(p.x, 0, p.z);
   node.rotation.y = p.heading;
   addBox(view, 'braking-post', [.15, 1.9, .15], [0, .95, 0], materials.darkSteel, 0, node);
   addBox(view, 'braking-board-back', [2.0, 1.2, .12], [0, 1.85, 0], materials.white, 0, node);
   view.sign(s % 236 < 118 ? '150' : '100', [0, 1.85, -.08], 1.75, .82, node);
   signs++;
  }
 }
 for (let s = 35; s < track.length; s += 95) {
  const p = track.at(s, BARRIER + 2.2);
  const node = new B.TransformNode('chevron-node', view.scene);
  node.position = v(p.x, 0, p.z);
  node.rotation.y = p.heading + Math.PI * .5;
  for (let i = 0; i < 3; i++) {
   addBox(view, 'chevron-panel', [2.1, 1.1, .1], [i * 2.3, 1.25, 0], materials.white, 0, node);
   const stripe = addBox(view, 'chevron-stripe', [.42, 1.24, .12], [i * 2.3 - .34, 1.25, -.07], materials.kerb, Math.PI * .17, node);
   stripe.rotation.z = -.7;
  }
  signs++;
 }
 counts.signs = signs;
}

function addRiver(view, materials, bounds, counts) {
 const x0 = CIRCUIT.riverX;
 const west = [], east = [], bankA = [], bankB = [];
 const minZ = bounds.minZ - 190, maxZ = bounds.maxZ + 190;
 for (let i = 0; i <= 96; i++) {
  const u = i / 96;
  const z = minZ + (maxZ - minZ) * u;
  const wave = Math.sin(u * Math.PI * 5.2) * 10 + Math.sin(u * Math.PI * 13) * 3.5;
  const cx = x0 + wave;
  const width = 26 + Math.sin(u * Math.PI * 4) * 4;
  west.push(v(cx - width, -.18, z));
  east.push(v(cx + width, -.2, z));
  bankA.push(v(cx - width - 7, .05, z));
  bankB.push(v(cx + width + 7, .05, z));
 }
 const river = B.MeshBuilder.CreateRibbon('azuma-river', { pathArray: [west, east], sideOrientation: B.Mesh.DOUBLESIDE }, view.scene);
 river.material = materials.water;
 river.receiveShadows = true;
 const leftBank = B.MeshBuilder.CreateRibbon('rocky-west-bank', { pathArray: [bankA, west], sideOrientation: B.Mesh.DOUBLESIDE }, view.scene);
 leftBank.material = materials.rock;
 leftBank.receiveShadows = true;
 const rightBank = B.MeshBuilder.CreateRibbon('rocky-east-bank', { pathArray: [east, bankB], sideOrientation: B.Mesh.DOUBLESIDE }, view.scene);
 rightBank.material = materials.rock;
 rightBank.receiveShadows = true;
 const rocks = [];
 for (let i = 0; i < 72; i++) {
  const u = i / 72;
  const z = minZ + (maxZ - minZ) * u;
  const side = i % 2 ? -1 : 1;
  const cx = x0 + Math.sin(u * Math.PI * 5.2) * 10 + Math.sin(u * Math.PI * 13) * 3.5;
  const rock = B.MeshBuilder.CreatePolyhedron('river-rock', { type: 2, size: 1 + (i % 5) * .22 }, view.scene);
  rock.position = v(cx + side * (29 + (i % 7)), .22, z + Math.sin(i) * 5);
  rock.scaling.set(1.5 + (i % 3) * .5, .55, 1 + (i % 4) * .4);
  rock.rotation.y = i * .71;
  rock.material = materials.rock;
  rocks.push(rock);
 }
 view.merge(rocks, 'batched-river-rocks');
 counts.riverSegments = 96;
 counts.riverRocks = rocks.length;
}

function addHillsAndMountains(view, materials, bounds, counts) {
 const hillMeshes = [];
 for (let i = 0; i < 34; i++) {
  const a = i / 34 * Math.PI * 2;
  const r = 320 + (i % 5) * 28;
  const hill = B.MeshBuilder.CreateCylinder('scenic-hill', { height: 18 + (i % 6) * 5, diameterTop: 35, diameterBottom: 130 + (i % 4) * 18, tessellation: 9 }, view.scene);
  hill.position = v(bounds.centerX + Math.sin(a) * r, 2, bounds.centerZ + Math.cos(a) * r);
  hill.rotation.y = a;
  hill.material = i % 3 ? materials.hill : materials.grassDark;
  hill.receiveShadows = true;
  hillMeshes.push(hill);
 }
 view.merge(hillMeshes, 'batched-near-hills');
 const mountains = [];
 for (let i = 0; i < 22; i++) {
  const a = i / 22 * Math.PI * 2;
  const m = B.MeshBuilder.CreateCylinder('layered-mountain', { height: 90 + (i % 5) * 32, diameterTop: 6, diameterBottom: 190 + (i % 4) * 35, tessellation: 7 }, view.scene);
  m.position = v(bounds.centerX + Math.sin(a) * 690, -2, bounds.centerZ + Math.cos(a) * 690);
  m.rotation.y = a * 1.7;
  m.material = i % 2 ? materials.mountain : materials.mountainFar;
  m.receiveShadows = false;
  mountains.push(m);
 }
 view.merge(mountains, 'batched-distant-mountains');
 counts.hills = hillMeshes.length;
 counts.mountains = mountains.length;
}

function addTrees(view, track, materials, bounds, counts) {
 const rnd = seeded(CIRCUIT.scenerySeed);
 const trunkBase = B.MeshBuilder.CreateCylinder('sakura-trunk-source', { height: 1, diameter: 1, tessellation: 7 }, view.scene);
 trunkBase.material = materials.bark;
 trunkBase.isVisible = false;
 const branchBase = B.MeshBuilder.CreateCylinder('sakura-branch-source', { height: 1, diameter: 1, tessellation: 6 }, view.scene);
 branchBase.material = materials.bark;
 branchBase.isVisible = false;
 const blossomBase = B.MeshBuilder.CreateSphere('blossom-lobe-source', { segments: 8, diameter: 1 }, view.scene);
 blossomBase.material = materials.blossom;
 blossomBase.isVisible = false;
 const blossomWhite = B.MeshBuilder.CreateSphere('white-blossom-lobe-source', { segments: 8, diameter: 1 }, view.scene);
 blossomWhite.material = materials.blossomWhite;
 blossomWhite.isVisible = false;
 const coniferBase = B.MeshBuilder.CreateCylinder('conifer-source', { height: 1, diameterTop: .12, diameterBottom: 1, tessellation: 7 }, view.scene);
 coniferBase.material = materials.conifer;
 coniferBase.isVisible = false;
 const mixedBase = B.MeshBuilder.CreateSphere('mixed-leaf-source', { segments: 7, diameter: 1 }, view.scene);
 mixedBase.material = materials.leaf;
 mixedBase.isVisible = false;
 const addSakura = (x, z, scale, heading = 0) => {
  instance(trunkBase, 'sakura-trunk', v(x, 2.15 * scale, z), v(.55 * scale, 4.3 * scale, .55 * scale), heading, .03 * (rnd() - .5), .08 * (rnd() - .5));
  for (let b = 0; b < 4; b++) {
   const a = heading + b * Math.PI * .5 + (rnd() - .5) * .55;
   const br = instance(branchBase, 'sakura-branch', v(x + Math.sin(a) * 1.0 * scale, (3.8 + rnd() * .7) * scale, z + Math.cos(a) * 1.0 * scale), v(.18 * scale, (2.4 + rnd() * .6) * scale, .18 * scale), a, .65 + rnd() * .22, 0);
   br.rotation.z = Math.sin(a) * .65;
  }
  for (let c = 0; c < 8; c++) {
   const a = heading + c * .78 + (rnd() - .5) * .3;
   const r = (1.3 + rnd() * 2.2) * scale;
   const y = (4.4 + rnd() * 2.2) * scale;
   const lobes = c % 3 === 0 ? blossomWhite : blossomBase;
   const mesh = instance(lobes, 'irregular-sakura-blossom', v(x + Math.sin(a) * r, y, z + Math.cos(a) * r), v((1.6 + rnd() * 1.2) * scale, (.9 + rnd() * .65) * scale, (1.3 + rnd() * 1.1) * scale), rnd() * Math.PI);
   mesh.rotation.x = (rnd() - .5) * .45;
  }
 };
 let sakura = 0, conifers = 0, mixed = 0;
 for (let s = 18; s < track.length; s += 22) {
  for (const side of [-1, 1]) {
   if ((s / 22 | 0) % 3 === 1 && side < 0) continue;
   const p = track.at(s, side * (BARRIER + 9 + rnd() * 8));
   addSakura(p.x, p.z, .82 + rnd() * .32, p.heading);
   sakura++;
  }
 }
 for (let i = 0; i < 150; i++) {
  const a = rnd() * Math.PI * 2;
  const r = 185 + rnd() * 180;
  const x = bounds.centerX + Math.sin(a) * r;
  const z = bounds.centerZ + Math.cos(a) * r;
  if (x > CIRCUIT.riverX - 45 && Math.abs(z - bounds.centerZ) < bounds.depth * .8) continue;
  const trunk = instance(trunkBase, 'woodland-trunk', v(x, 2.1, z), v(.46, 4.2, .46), rnd() * Math.PI);
  trunk.material = materials.bark;
  if (i % 2) {
   instance(coniferBase, 'layered-conifer', v(x, 6.7, z), v(5 + rnd() * 2, 9 + rnd() * 4, 5 + rnd() * 2), rnd() * Math.PI);
   conifers++;
  } else {
   instance(mixedBase, 'mixed-woodland-crown', v(x, 6.0 + rnd() * 2, z), v(4 + rnd() * 2, 3 + rnd() * 1.4, 4 + rnd() * 2), rnd() * Math.PI);
   mixed++;
  }
 }
 counts.sakuraTrees = sakura;
 counts.woodlandTrees = conifers + mixed;
}

function addSkyAndLighting(view, materials) {
 view.scene.clearColor = new B.Color4(.72, .82, .88, 1);
 view.scene.fogMode = B.Scene.FOGMODE_EXP2;
 view.scene.fogDensity = view.quality === 'high' ? .00145 : .0019;
 view.scene.fogColor = color('#bed0d7');
 if (view.hemi) { view.hemi.intensity = .92; view.hemi.groundColor = color('#5c6d58'); }
 if (view.sun) { view.sun.position = v(170, 245, -150); view.sun.direction = v(-.48, -.84, .36); view.sun.intensity = 2.25; }
 const sky = B.MeshBuilder.CreateBox('painted-spring-sky', { size: 1400 }, view.scene);
 const skyMat = new B.StandardMaterial('spring-sky-gradient', view.scene);
 skyMat.backFaceCulling = false;
 skyMat.disableLighting = true;
 skyMat.diffuseColor = color('#b9d5e4');
 skyMat.emissiveColor = color('#9fc4d8');
 sky.material = skyMat;
 sky.infiniteDistance = true;
 sky.isPickable = false;
 materials.sky = skyMat;
}

export function buildScenicWorld(view) {
 const scene = view.scene;
 const track = view.race.track;
 const bounds = trackBounds(track.points);
 const high = view.quality === 'high';
 const counts = {};

 const asphalt = view.mat('wet-sakura-asphalt', '#5e6569', 0, .86);
 asphalt.albedoTexture = makeTexture(scene, 'asphalt-grain-metre', [72, 76, 79], [9, 7, 6], 22);
 asphalt.bumpTexture = makeTexture(scene, 'asphalt-normal-metre', [128, 128, 238], [0, 0, 0], 22, true);
 asphalt.bumpTexture.level = .045;
 asphalt.environmentIntensity = .82;
 view.roadMaterial = asphalt;
 const grass = view.mat('spring-grass', '#7f9466', 0, .98);
 grass.albedoTexture = makeTexture(scene, 'grass-noise-metre', [118, 146, 88], [20, 18, 10], 38);
 grass.bumpTexture = makeTexture(scene, 'grass-normal-metre', [128, 128, 238], [0, 0, 0], 38, true);
 grass.bumpTexture.level = .035;
 const bark = view.mat('ridged-bark', '#6f5544', 0, .92);
 bark.albedoTexture = makeTexture(scene, 'bark-ridges-metre', [92, 69, 52], [22, 14, 7], 10);
 bark.bumpTexture = makeTexture(scene, 'bark-normal-metre', [128, 128, 238], [0, 0, 0], 10, true);
 bark.bumpTexture.level = .085;
 const materials = {
  asphalt, grass, bark,
  seal: view.mat('dark-wet-racing-line', '#363f42', 0, .38),
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
  water: view.mat('river-water', '#527e8f', .1, .18),
  rock: view.mat('river-rock', '#7d7f78', 0, .78),
  hill: view.mat('hill-grass', '#6f835d', 0, .95),
  grassDark: view.mat('dark-hill-grass', '#526f52', 0, .98),
  mountain: view.mat('near-mountain-blue', '#6d858b', 0, .94),
  mountainFar: view.mat('far-mountain-blue', '#8fa4a8', 0, .96),
  blossom: view.mat('dense-pink-blossom', '#f2a8bf', 0, .82),
  blossomWhite: view.mat('white-pink-blossom', '#f6dde5', 0, .86),
  conifer: view.mat('hinoki-conifer', '#2f4c3e', 0, .96),
  leaf: view.mat('mixed-woodland-leaf', '#456443', 0, .95)
 };
 materials.water.alpha = .82;
 materials.water.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHABLEND;
 view.sceneryMaterials = materials;

 addSkyAndLighting(view, materials);
 const ground = B.MeshBuilder.CreateGround('sakura-valley-ground', { width: 2200, height: 2200, subdivisions: high ? 16 : 8 }, scene);
 ground.position.y = -.09;
 ground.material = grass;
 ground.receiveShadows = true;
 setUvScale(ground, .02);
 addRoadBands(view, materials);
 addKerbsAndGuards(view, track, materials, counts);
 addRiver(view, materials, bounds, counts);
 addHillsAndMountains(view, materials, bounds, counts);
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
  water: scene.getMeshByName('azuma-river'),
  update(dt) {
   this.riverPhase += dt;
   if (this.water) this.water.material.environmentIntensity = .75 + Math.sin(this.riverPhase * .8) * .05;
  }
 };
 view.createRain();
 if (view.freezeStaticWorld) view.freezeStaticWorld();
 scene.metadata = scene.metadata || {};
 scene.metadata.scenery = {
  name: 'Sakura Valley',
  circuitId: CIRCUIT.id,
  riverX: CIRCUIT.riverX,
  bounds,
  counts: {
   ...counts,
   staticMeshes: scene.meshes.length,
   materials: Object.keys(view.materials).length,
   quality: view.quality
  },
  interfaces: ['buildScenicWorld(view)', 'view.updateScenery(dt, player, phase)', 'scene.metadata.scenery']
 };
}
