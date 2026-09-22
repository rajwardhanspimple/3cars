// Night-only rendering policy. No mesh, topology, parenting or light changes.
const B=globalThis.BABYLON;
export const NIGHT_GROUND_LIGHTING=Object.freeze({sunStrength:0,specularStrength:0,
 ambientStrength:.32,poolRadius:9,poolStrength:.055,poolCount:8});
const installed=new WeakMap();
const groundNames=new Set(['city-asphalt','city-ground','city-lane-paint',
 'city-centre-paint','city-curb','city-grass','city-dirt']);
const declaration=Array.from({length:8},(_,i)=>`uniform vec4 nightLamp${i};`).join('\n')+`
float nightLampPool(vec4 lamp) {
 float radius=length(vPosition.xz-lamp.xz)/9.0;
 // Bounded pool under a real emitter. No full-road overlay or global gradient.
 float pool=1.0-smoothstep(.45,1.0,radius);
 float below=lamp.y-vPosition.y;
 return pool*lamp.w*step(.2,below)*(1.0-smoothstep(9.0,12.0,below));
}
`;
const pools=Array.from({length:8},(_,i)=>` nightPool=max(nightPool,nightLampPool(nightLamp${i}));`).join('\n');
function replace(source,oldText,newText) {
 if(!source.includes(oldText)) throw new Error('Night ground shader contract changed: '+oldText.slice(0,64));
 return source.replace(oldText,newText);
}
export function installNightGroundLighting(view) {
 const scene=view.scene;
 if(installed.has(scene)) return installed.get(scene);
 const patched=new Map(),lamps=Array.from({length:8},()=>new B.Vector4());
 let disposed=false;
 function patch(mat) {
  if(patched.has(mat)||!groundNames.has(mat.name)||!mat.metadata?.celShading||!(mat instanceof B.ShaderMaterial)) return;
  const path=mat.shaderPath;if(!path?.fragmentSource) return;
  let fragment=replace(path.fragmentSource,'void main(void) {',declaration+'\nvoid main(void) {');
  fragment=replace(fragment,
   'vec3 shaded = base*(ambient*mix(shadowColor*shadowStrength,vec3(1.0),lit)+sunColor*sunStrength*diffuse);',
   `// Night ground fill is independent of the directional terminator.
 vec3 shaded = base*ambient;
 float nightPool=0.0;
${pools}
 shaded += vec3(.055,.035,.015)*nightPool*max(0.0,N.y);`);
  fragment=replace(fragment,'shaded += rimColor*rim*min(1.0,length(skyColor)+length(sunColor));',
   '// No camera-facing rim on night ground. It made source-free pale wedges.');
  fragment=replace(fragment,'shaded += sunColor*highlight*specularStrength;',
   '// No directional highlight on night ground.');
  mat.shaderPath={...path,fragmentSource:fragment};
  const uniforms=mat.options.uniforms;
  for(let i=0;i<8;i++) if(!uniforms.includes('nightLamp'+i)) uniforms.push('nightLamp'+i);
  const observer=mat.onBindObservable.add(()=>{
   const effect=mat.getEffect();if(!effect) return;
   // After the converter: weather cannot restore the source-free sun terms.
   effect.setFloat('sunStrength',NIGHT_GROUND_LIGHTING.sunStrength);
   effect.setFloat('specularStrength',NIGHT_GROUND_LIGHTING.specularStrength);
   effect.setFloat('rimStrength',0);
   for(let i=0;i<8;i++) {const p=lamps[i];effect.setFloat4('nightLamp'+i,p.x,p.y,p.z,p.w);}
  });
  patched.set(mat,{path,observer});
 }
 function refresh() {
  if(disposed) return;
  const camera=scene.activeCamera||view.camera;
  const position=camera?.globalPosition||camera?.position||B.Vector3.Zero();
  const emitters=scene.meshes.filter(mesh=>/^city-lamp-emitter-/.test(mesh.name)&&mesh.isVisible&&mesh.visibility>0&&mesh.isEnabled());
  const points=emitters.map(mesh=>{
   mesh.computeWorldMatrix(true);
   return mesh.getAbsolutePosition();
  }).sort((a,b)=>B.Vector3.DistanceSquared(a,position)-B.Vector3.DistanceSquared(b,position));
  for(let i=0;i<8;i++) {const p=points[i];if(p) lamps[i].set(p.x,p.y,p.z,1);else lamps[i].set(0,0,0,0);}
  for(const mat of scene.materials) patch(mat);
 }
 const observer=scene.onBeforeRenderObservable.add(refresh);
 const api={refresh,dispose(){
  if(disposed) return;disposed=true;scene.onBeforeRenderObservable.remove(observer);
  for(const [mat,state] of patched) {mat.onBindObservable.remove(state.observer);mat.shaderPath=state.path;}
  patched.clear();installed.delete(scene);
 }};
 installed.set(scene,api);refresh();scene.onDisposeObservable.addOnce(()=>api.dispose());return api;
}
