import test from 'node:test';
import assert from 'node:assert/strict';
// Preserve the babylonjs-not-installed guard used by simulation-only CI.
let B=null;
try {({default:B}=await import('babylonjs'));} catch {}
if(!B) {
 test('car cel suite skipped: babylonjs is not installed',{skip:'run npm install to exercise car materials'},()=>{});
} else {
 globalThis.BABYLON=B;
 const {applyCelShading}=await import('../src/cel-shading.js');
 const {installCelSurfaceDetails}=await import('../src/cel-surface-details.js');
 const {carMaterialFamily,carBaseColor,carSurfaceColor}=await import('../src/car-cel-materials.js');
 function fixture(quality) {
  const engine=new B.NullEngine(),scene=new B.Scene(engine);
  const camera=new B.FreeCamera('camera',new B.Vector3(0,2,-10),scene);
  const sun=new B.DirectionalLight('sun',new B.Vector3(-1,-1,0),scene);
  const hemi=new B.HemisphericLight('sky',B.Vector3.Up(),scene);
  return {engine,scene,camera,sun,hemi,quality};
 }
 function bind(mesh) {
  const mat=mesh.material,values={},old=mat.getEffect;
  mat.getEffect=()=>new Proxy({}, {get:()=> (name,...args)=>{values[name]=args.map(v=>v?.clone?.()||v);}});
  try {mat.onBindObservable.notifyObservers(mesh);} finally {mat.getEffect=old;}
  return values;
 }
 test('known Mustang families are distinct and world materials are excluded',()=>{
  for(const [name,family] of Object.entries({CARPAINT:'paint',Window_Glass:'glass',Front_Glass:'glass',GlassTransparent:'glass',Rubber_Black:'rubber',Black_Plastic:'trim',Black_Metal_Paint:'trim',Chrome:'metal',Brushed_Aluminum:'metal',Mirror:'metal',RedGlass:'tail',Light:'lamp'})) {
   assert.equal(carMaterialFamily(`car-2-${name}`),family);
  }
  assert.equal(carMaterialFamily('city-glass'),null);
  assert.equal(carMaterialFamily('mustang-template-Rubber_Black'),null);
  const rubber=new B.Color3(.016,.018,.02);
  assert.deepEqual(carBaseColor(rubber,'rubber').asArray(),rubber.asArray());
  assert.ok(Math.max(...carSurfaceColor(rubber,'rubber',1,1,1).asArray())<.025);
  assert.ok(Math.max(...carSurfaceColor(B.Color3.White(),'trim',1,1,1).asArray())<.04);
  assert.ok(Math.max(...carSurfaceColor(B.Color3.White(),'metal',1,1,1).asArray())<.38);
 });
 for(const quality of ['high','medium']) test(`live paint/glass/rubber bind distinct tones and keep alpha (${quality})`,()=>{
  const view=fixture(quality),{scene}=view;
  try {
   const root=new B.TransformNode('car-0',scene),sources={},meshes={};
   for(const [name,rgb] of Object.entries({CARPAINT:[.8,.05,.01],Window_Glass:[.035,.055,.07],Front_Glass:[.35,.42,.46],Rubber_Black:[.016,.018,.02],Black_Plastic:[.012,.014,.016],Chrome:[.7,.72,.74],RedGlass:[.5,.1,.1]})) {
    const mesh=B.MeshBuilder.CreateBox(`car-0-${name}`,{},scene);mesh.parent=root;mesh.metadata={mustang:true};
    const mat=new B.PBRMaterial(`car-0-${name}`,scene);mat.albedoColor=new B.Color3(...rgb);
    if(/Glass/.test(name)&&name!=='RedGlass') {mat.alpha=name==='Window_Glass'?.84:.3;mat.transparencyMode=B.Material.MATERIAL_ALPHABLEND;}
    if(name==='RedGlass') mat.emissiveColor=new B.Color3(.22,.003,.002);
    mesh.material=mat;meshes[name]=mesh;sources[name]=mat;
   }
   const second=meshes.RedGlass.clone('car-1-RedGlass',root,true);second.material=sources.RedGlass.clone('car-1-RedGlass');
   const secondSource=second.material;
   const original=Object.fromEntries(Object.entries(meshes).map(([k,m])=>[k,{geometry:m.geometry,parent:m.parent,indices:Array.from(m.getIndices())}]));
   const texture=B.RawTexture.CreateRGBATexture(new Uint8Array([4,8,12,255]),1,1,scene);sources.Black_Plastic.albedoTexture=texture;
   const api=applyCelShading(view);installCelSurfaceDetails(view);
   const paint=bind(meshes.CARPAINT).baseColor[0],glass=bind(meshes.Window_Glass).baseColor[0],rubber=bind(meshes.Rubber_Black).baseColor[0];
   assert.deepEqual(paint.asArray(),sources.CARPAINT.albedoColor.asArray());
   assert.ok(paint.r>.7);assert.ok(glass.b<=.0550001);assert.ok(glass.b>rubber.b);
   assert.deepEqual(rubber.asArray(),[.016,.018,.02]);
   for(const name of ['Window_Glass','Front_Glass']) {
    const mesh=meshes[name],values=bind(mesh);
    assert.equal(mesh.material.needAlphaBlending(),true);assert.equal(values.materialAlpha[0],sources[name].alpha);
    assert.equal(mesh.material.transparencyMode,B.Material.MATERIAL_ALPHABLEND);
   }
   assert.equal(bind(meshes.Black_Plastic).textureStrength[0],1);assert.equal(bind(meshes.Black_Plastic).textureLevels[0],0);
   assert.equal(meshes.Black_Plastic.material.albedoTexture,texture);
   assert.match(meshes.Black_Plastic.material.shaderPath.fragmentSource,/baseColor\*clamp\(texel.rgb/);
   assert.doesNotMatch(meshes.Rubber_Black.material.shaderPath.fragmentSource,/shaded \+= rimColor/);
   sources.CARPAINT.albedoColor=new B.Color3(.01,.08,.9);
   assert.deepEqual(bind(meshes.CARPAINT).baseColor[0].asArray(),[.01,.08,.9]);
   sources.RedGlass.emissiveColor.set(.77,.003,.002);
   assert.equal(bind(meshes.RedGlass).emissiveColor[0].r,.77);assert.equal(bind(second).emissiveColor[0].r,.22);
   assert.equal(secondSource.emissiveColor.r,.22);assert.notEqual(second.material,meshes.RedGlass.material);
   assert.equal(second.geometry,meshes.RedGlass.geometry);
   scene.onBeforeRenderObservable.notifyObservers(scene);
   assert.equal(meshes.Rubber_Black.renderOutline,true);assert.equal(meshes.Window_Glass.renderOutline,false);
   for(const [name,mesh] of Object.entries(meshes)) {
    assert.equal(mesh.geometry,original[name].geometry);assert.equal(mesh.parent,original[name].parent);
    assert.deepEqual(Array.from(mesh.getIndices()),original[name].indices);
    assert.equal(mesh.material.albedoColor,sources[name].albedoColor,'source handle remains live');
   }
   // A late clone is converted and refined before its first draw as well.
   const late=meshes.Rubber_Black.clone('car-2-rubber',root,true);late.material=sources.Rubber_Black.clone('car-2-Rubber_Black');api.refresh();
   scene.onBeforeRenderObservable.notifyObservers(scene);assert.equal(late.material.metadata.celCarFamily,'rubber');
  } finally {scene.dispose();view.engine.dispose();}
 });
}
