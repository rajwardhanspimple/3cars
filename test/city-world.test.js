import test from 'node:test';
import assert from 'node:assert/strict';
import B from 'babylonjs';
globalThis.BABYLON = B;
const { Race, HALF_WIDTH, BARRIER } = await import('../src/sim.js');
const { roadHeight, roadPose, surfaceRoughness } = await import('../src/mountain-layout.js');
const { buildCityWorld, CITY_BARRIER_OFFSET } = await import('../src/city-world.js');
const { RaceView } = await import('../src/view.js');

function fixture(quality = 'high') {
 const engine = new B.NullEngine(), scene = new B.Scene(engine), race = new Race();
 const camera = new B.FreeCamera('camera', new B.Vector3(0, 2, -10), scene);
 const sun = new B.DirectionalLight('sun', new B.Vector3(-1, -1, 0), scene);
 const hemi = new B.HemisphericLight('sky', B.Vector3.Up(), scene);
 return { engine, scene, race, camera, sun, hemi, quality, reducedMotion: false, createRain: RaceView.prototype.createRain };
}
function cleanup(view) { view.scene.dispose(); view.engine.dispose(); }
const close = (a, b, eps = 1e-5) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const solids = view => view.scene.meshes.filter(mesh => mesh.metadata?.cityWorld && mesh.metadata.role === 'solid');

for (const quality of ['high', 'low']) test(`city contract, metadata and shared geometry (${quality})`, async () => {
 const view = fixture(quality), before = JSON.stringify(view.race);
 try {
  const scenery = buildCityWorld(view);
  assert.equal(scenery, view.scenery); assert.ok(scenery.ready instanceof Promise);
  assert.equal(await scenery.ready, scenery);
  const c = view.scene.metadata.scenery, instances = solids(view);
  assert.equal(c.id, 'anime-night-city-v1'); assert.equal(c.ready, true);
  assert.ok(c.buildings > 60); assert.ok(c.litWindows > c.buildings * 100);
  assert.equal(c.neonPanels, c.buildings); assert.equal(c.neonStrips, c.buildings); assert.ok(c.largeSigns > 5);
  assert.equal(c.sharedLayoutProps, view.race.props.length);
  assert.equal(c.retainingWalls, view.race.layout.walls.length);
  assert.equal(c.sharedLayoutTreeColliders, view.race.layout.trees.length);
  assert.equal(c.streetlights, c.lightPools); assert.ok(c.streetlights > 30);
  assert.equal(c.visibleBarrierRails, 2 * Math.ceil(view.race.track.length / 7.5));
  assert.equal(c.visibleBarrierPosts, c.visibleBarrierRails);
  assert.equal(c.instances, instances.length); assert.equal(c.instanceSources, 16);
  assert.equal(c.proceduralTextures, 9); assert.equal(c.proceduralTextureBytes, 606208);
  assert.equal(c.additionalRealLights, 0); assert.equal(c.reflectionProbes, 0);
  assert.equal(view.scene.lights.length, 2); assert.equal(c.moons, 1); assert.ok(c.stars > 100);
  assert.equal(c.roadWidth, HALF_WIDTH * 2); assert.equal(c.roadUsesSurfaceRoughness, true);
  assert.equal(view.scene.metadata.celShading.palette, 'city-night');
  assert.equal(view.celShading.options.bloom.enabled, quality === 'high');
  assert.equal(JSON.stringify(view.race), before, 'world construction must not mutate physics');
  for (const mesh of instances) {
   assert.ok(mesh instanceof B.InstancedMesh);
   assert.equal(mesh.getTotalVertices(), mesh.sourceMesh.getTotalVertices());
  }
  const asphalt = view.scene.getMeshByName('city-asphalt'), positions = asphalt.getVerticesData('position');
  for (let i = 0; i < positions.length; i += 3) {
   const [x, y, z] = positions.slice(i, i + 3);
   close(y, roadHeight(x, z) + surfaceRoughness(x, z, 'asphalt').height, 1e-4);
  }
  for (const [x, z] of [[0, 0], [-1000, 1000], [10000, -10000]]) assert.ok(Number.isFinite(view.sceneryGroundHeight(x, z)));
  for (let s = 0; s < view.race.track.length; s += 11) {
   const p = view.race.track.at(s); assert.ok(Number.isFinite(view.sceneryGroundHeight(p.x, p.z)));
   assert.ok(view.sceneryGroundHeight(p.x, p.z) < roadHeight(p.x, p.z));
  }
  const ground = view.scene.getMeshByName('city-ground'), gp = ground.getVerticesData('position');
  for (let i = 0; i < gp.length; i += 3) close(view.sceneryGroundHeight(gp[i], gp[i + 2]), gp[i + 1], 1e-4);
 } finally { cleanup(view); }
});

test('every rail is at the shared barrier offset with analytic road pose', async () => {
 const view = fixture();
 try {
  await buildCityWorld(view).ready;
  close(CITY_BARRIER_OFFSET, BARRIER - .05);
  for (const mesh of solids(view).filter(m => m.metadata.kind === 'guardrail')) {
   const { s, side } = mesh.metadata, p = view.race.track.at(s, side * CITY_BARRIER_OFFSET), r = roadPose(p.x, p.z, p.heading);
   close(mesh.position.x, p.x); close(mesh.position.z, p.z); close(mesh.position.y, r.y + 1.15);
   close(mesh.rotation.x, r.pitch); close(mesh.rotation.y, p.heading); close(mesh.rotation.z, r.roll);
   close(mesh.scaling.z, 7.7); close(mesh.scaling.x, .22);
  }
  const walls = solids(view).filter(m => m.metadata.kind === 'wall');
  for (const wall of view.race.layout.walls) {
   const mesh = walls.find(m => m.metadata.layoutId === wall.id);
   close(mesh.parent.position.x, wall.x); close(mesh.parent.position.z, wall.z);
   close(mesh.scaling.x, wall.width); close(mesh.scaling.z, wall.length); close(mesh.scaling.y, wall.height);
  }
  for (const tree of view.race.layout.trees) {
   const mesh = solids(view).find(m => m.metadata.kind === 'layout-bollard' && m.metadata.layoutId === tree.id);
   close(mesh.parent.position.x, tree.x); close(mesh.parent.position.z, tree.z);
   close(mesh.scaling.x / 2, tree.radius); close(mesh.scaling.z / 2, tree.radius);
  }
 } finally { cleanup(view); }
});

// A circle enclosing the full transformed XZ bounding box proves clearance
// from every track segment, including other legs of a hairpin. This is stronger
// than checking only mesh vertices. Road paint/ground/sky intentionally excluded.
for (const quality of ['high', 'low']) test(`no scenery solid intersects the driveable corridor (${quality})`, async () => {
 const view = fixture(quality);
 try {
  await buildCityWorld(view).ready;
  const meshes = view.scene.meshes.filter(m => m.isVisible && m.getTotalVertices() && m.name !== 'rain');
  for (const mesh of meshes) {
   assert.ok(['solid', 'surface', 'sky'].includes(mesh.metadata?.role), `unclassified scenery ${mesh.name}`);
   if (mesh.metadata.role !== 'solid') continue;
   mesh.computeWorldMatrix(true);
   const box = mesh.getBoundingInfo().boundingBox, centre = box.centerWorld;
   let radius = 0;
   for (const p of box.vectorsWorld) radius = Math.max(radius, Math.hypot(p.x - centre.x, p.z - centre.z));
   const clearance = view.race.track.project(centre.x, centre.z).distance - radius;
   assert.ok(clearance > HALF_WIDTH, `${mesh.name}: conservative clearance ${clearance}`);
  }
 } finally { cleanup(view); }
});

test('props follow race state and reset without allocations; paused/reduced motion is stable', async () => {
 const view = fixture();
 try {
  await buildCityWorld(view).ready;
  const count = view.scene.meshes.length, prop = view.race.props[0], root = view.scene.getTransformNodeByName(`city-prop-${prop.id}`);
  const texture = view.scene.textures.find(t => t.name === 'city-neon-road-smears');
  prop.x += 3; prop.z += 1; prop.tilt = 1.4; prop.yaw += .2;
  const state = JSON.stringify(view.race), offset = texture.vOffset;
  view.updateScenery(1 / 30, view.race.player, 'racing');
  close(root.position.x, prop.x); close(root.position.z, prop.z);
  close(root.rotation.z, roadPose(prop.x, prop.z, prop.yaw).roll + prop.tilt);
  assert.equal(JSON.stringify(view.race), state); assert.notEqual(texture.vOffset, offset);
  const movingOffset = texture.vOffset;
  view.updateScenery(1, view.race.player, 'paused'); close(texture.vOffset, movingOffset);
  view.updateScenery(1, view.race.player, 'finished'); close(texture.vOffset, movingOffset);
  view.reducedMotion = true; view.updateScenery(1, view.race.player, 'racing'); close(texture.vOffset, movingOffset);
  prop.active = false; view.updateScenery(0, view.race.player, 'racing'); assert.equal(root.isEnabled(), false);
  view.race = new Race(); view.updateScenery(0, view.race.player, 'menu');
  assert.equal(root.isEnabled(), true); close(root.position.x, view.race.props[0].x);
  view.scenery.setWeather('wet'); assert.equal(view.rain.isEnabled(), true); close(texture.level, 1);
  view.scenery.setWeather('dry'); assert.equal(view.rain.isEnabled(), false); close(texture.level, .72);
  assert.equal(view.scene.meshes.length, count);
 } finally { cleanup(view); }
});

test('procedural layouts and texture bytes are deterministic across builds', async () => {
 const a = fixture(), b = fixture();
 try {
  await Promise.all([buildCityWorld(a).ready, buildCityWorld(b).ready]);
  assert.deepEqual(a.scene.metadata.scenery, b.scene.metadata.scenery);
  const snapshot = view => solids(view).map(m => [m.name, m.position.asArray(), m.scaling.asArray(), m.rotation.asArray(), m.parent?.position.asArray()]);
  assert.deepEqual(snapshot(a), snapshot(b));
 } finally { cleanup(a); cleanup(b); }
});

test('ready rejects construction/texture failures and disposed scenes', async () => {
 const view = fixture(), original = B.RawTexture.CreateRGBATexture;
 try {
  B.RawTexture.CreateRGBATexture = () => { throw new Error('injected procedural texture failure'); };
  const world = buildCityWorld(view);
  await assert.rejects(world.ready, /injected procedural texture failure/);
  assert.equal(view.scene.metadata.scenery.ready, false);
 } finally { B.RawTexture.CreateRGBATexture = original; cleanup(view); }
 const dead = fixture();
 try { const world = buildCityWorld(dead); dead.scene.dispose(); await assert.rejects(world.ready, /disposed/); }
 finally { cleanup(dead); }
});
