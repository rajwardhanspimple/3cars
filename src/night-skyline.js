// Night-only surface treatment. No new geometry, lights, textures or instances.
// Bounds below are linear pre-image-processing values, NOT a guarantee about
// final screenshot luminance after grading. Verify the latter in the browser.
const B=globalThis.BABYLON;
const installed=new WeakMap();
export const NIGHT_SKYLINE=Object.freeze({
 horizon:'#111b43',ink:'#040714',housing:'#10182d',
 skyPeak:.16,emissionPeak:.5,facadePeak:.45,
 signWidth:2.4,signHeight:3.2,stripHeight:.045,
 floorHeight:3.2,floorInk:.055,edgeInk:.07,
 bloomThreshold:1.2,bloomWeight:.035,bloomKernel:8
});
const VERTEX=`
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 viewProjection, view;
varying vec2 vUV;
varying vec3 vLocal, vNormal, vScale;
varying float vDistance;
#include<instancesDeclaration>
void main(void) {
 #include<instancesVertex>
 vec4 p=finalWorld*vec4(position,1.0);
 vLocal=position;vNormal=normal;vUV=uv;
 vScale=vec3(length(finalWorld[0].xyz),length(finalWorld[1].xyz),length(finalWorld[2].xyz));
 vDistance=length((view*p).xyz);
 gl_Position=viewProjection*p;
}`;
export const NIGHT_EMISSION_FRAGMENT=`
precision highp float;
varying vec2 vUV;
varying vec3 vLocal, vNormal, vScale;
varying float vDistance;
uniform sampler2D artSampler;
uniform float hasArt, sky, panel, emissionPeak, skyPeak, outputLinear, exposure, contrast;
uniform vec3 emissionColor, housingColor, horizonColor;
uniform vec2 signSize;
uniform float stripHeight;
uniform vec4 nightFog;
void main(void) {
 vec3 result=housingColor;
 if(sky>.5) {
  vec3 tex=texture2D(artSampler,vUV).rgb;
  // Keep the original moon/stars but cap their luminance, even though the old
  // StandardMaterial multiplied a near-white moon by white emission.
  vec3 linear=pow(max(tex,vec3(0.0)),vec3(2.2));
  float peak=max(linear.r,max(linear.g,linear.b));
  linear*=min(1.0,skyPeak/max(.0001,peak));
  // Prevent a low horizon texel or an exposed clear gap from reading grey.
  result=mix(horizonColor,linear,smoothstep(.03,.14,peak));
 } else {
  // Existing boxes are thin on X. Emit ONLY on the broad YZ faces, never the
  // top/side faces. The housing remains opaque and depth-tested, not additive.
  float face=step(.9,abs(vNormal.x));
  vec2 metre=vLocal.zy*vScale.zy;
  vec2 bound=vec2(min(signSize.x,vScale.z*.82),min(signSize.y,vScale.y*.82));
  if(panel<.5) bound=vec2(vScale.z*.88,min(stripHeight,vScale.y*.5));
  vec2 q=metre/max(bound,vec2(.001))+.5;
  float inside=step(0.0,q.x)*step(q.x,1.0)*step(0.0,q.y)*step(q.y,1.0)*face;
  vec3 art=vec3(1.0);
  if(hasArt>.5) art=texture2D(artSampler,clamp(q,0.0,1.0)).rgb;
  // Quantised glyphs on a dark panel, with a thin, bounded rectangular tube.
  float glyph=step(.5,max(art.r,max(art.g,art.b)));
  float border=1.0-step(.025,min(min(q.x,1.0-q.x),min(q.y,1.0-q.y)));
  float mask=panel>.5?max(glyph,border):1.0;
  vec3 neon=emissionColor*min(1.0,emissionPeak/max(.0001,max(emissionColor.r,max(emissionColor.g,emissionColor.b))));
  result=mix(housingColor,neon,inside*mask);
  float fog=1.0;
  if(nightFog.x==1.0) fog=exp(-vDistance*nightFog.w);
  else if(nightFog.x==2.0) fog=exp(-pow(vDistance*nightFog.w,2.0));
  else if(nightFog.x==3.0) fog=(nightFog.z-vDistance)/max(.001,nightFog.z-nightFog.y);
  result=mix(horizonColor,result,clamp(fog,0.0,1.0));
 }
 if(outputLinear<.5) {
  result=pow(max(result*exposure,vec3(0.0)),vec3(1.0/2.2));
  result=max(vec3(0.0),(result-.5)*contrast+.5);
 }
 gl_FragColor=vec4(result,1.0);
}`;
export const FACADE_INK=`
 // Same-pass painted ink is reliable for hardware-instanced boxes: no hull
 // duplication, no changed instance batching and no additional triangle budget.
 // Actual world scale sets floor spacing instead of stretching 16 UV rows over
 // every tower height. Existing window colours and geometry are preserved.
 #ifdef CEL_BOX_INK
 vec3 facadeSize=(inkBoxMax-inkBoxMin)*vAxisScale;
 vec3 faceMetric=facadeSize+abs(vLocalNormal)*10000.0;
 float shortFace=min(faceMetric.x,min(faceMetric.y,faceMetric.z));
 float outlineLimit=min(.07,shortFace*.08);
 float outlineWidth=min(outlineLimit,max(.025,inkPixelWorld*vFogDistance*1.4));
 vec3 cornerDistance=max(vec3(0.0),min(vLocalPosition-inkBoxMin,inkBoxMax-vLocalPosition))*vAxisScale;
 cornerDistance+=abs(vLocalNormal)*10000.0;
 float edgeDistanceNight=min(cornerDistance.x,min(cornerDistance.y,cornerDistance.z));
 float wall=1.0-step(.5,abs(vLocalNormal.y));
 float floorPhase=mod((vLocalPosition.y-inkBoxMin.y)*vAxisScale.y,3.2);
 float floorDistance=min(floorPhase,3.2-floorPhase);
 float floorWidth=min(.055,max(.018,inkPixelWorld*vFogDistance*.7));
 float floorLine=(1.0-smoothstep(floorWidth*.5,floorWidth,floorDistance))*wall;
 float edgeLine=1.0-smoothstep(outlineWidth*.6,outlineWidth,edgeDistanceNight);
 float line=max(edgeLine,floorLine)*inkEnabled;
 result=mix(result,inkColor,line);
 #endif
 // Protect night facades, including emissive window pixels, from white clipping.
 // Scale all channels together so the existing four facade hues stay distinct.
 float facadePeak=max(result.r,max(result.g,result.b));
 result*=min(1.0,.45/max(.0001,facadePeak));
`;
export function installNightSkyline(view) {
 const scene=view.scene;
 if(installed.has(scene)) {installed.get(scene).refresh();return installed.get(scene);}
 const assigned=new Map(),created=new Set(),facades=new Map();
 let disposed=false;
 const horizon=B.Color3.FromHexString(NIGHT_SKYLINE.horizon);
 const housing=B.Color3.FromHexString(NIGHT_SKYLINE.housing).toLinearSpace();
 const metadata={...NIGHT_SKYLINE,facadeTechnique:'same-pass-world-spaced-ink',
  emissionTechnique:'opaque-masked-YZ-faces',emissionMaterials:0,facadeMaterials:0,
  luminanceDomain:'linear-before-image-processing'};
 scene.metadata={...scene.metadata,nightSkyline:metadata};
 function createMaterial(source,kind) {
  const mat=new B.ShaderMaterial(source.name+'-bounded-night',scene,
   {vertexSource:VERTEX,fragmentSource:NIGHT_EMISSION_FRAGMENT},{
    attributes:['position','normal','uv'],uniforms:['world','view','viewProjection','hasArt','sky','panel',
     'emissionPeak','skyPeak','outputLinear','exposure','contrast','emissionColor','housingColor','horizonColor','signSize','stripHeight','nightFog'],
    samplers:['artSampler']});
  mat.backFaceCulling=source.backFaceCulling;mat.sideOrientation=source.sideOrientation;
  mat.disableDepthWrite=kind==='sky';mat.fogEnabled=kind!=='sky';
  mat.metadata={celShading:false,nightBoundedEmission:true,kind,maxEmission:NIGHT_SKYLINE.emissionPeak,
   maxEmittingWidth:kind==='panel'?NIGHT_SKYLINE.signWidth:null,maxEmittingHeight:kind==='panel'?NIGHT_SKYLINE.signHeight:NIGHT_SKYLINE.stripHeight};
  const texture=source.emissiveTexture||source.diffuseTexture;
  if(texture) mat.setTexture('artSampler',texture);
  mat.setFloat('hasArt',+!!texture);mat.setFloat('sky',+(kind==='sky'));mat.setFloat('panel',+(kind==='panel'));
  mat.setFloat('emissionPeak',NIGHT_SKYLINE.emissionPeak);mat.setFloat('skyPeak',NIGHT_SKYLINE.skyPeak);
  mat.setColor3('housingColor',housing);mat.setColor3('horizonColor',horizon.toLinearSpace());
  mat.setVector2('signSize',new B.Vector2(NIGHT_SKYLINE.signWidth,NIGHT_SKYLINE.signHeight));mat.setFloat('stripHeight',NIGHT_SKYLINE.stripHeight);
  mat.onBindObservable.add(()=>{
   const effect=mat.getEffect();if(!effect) return;
   const ipc=scene.imageProcessingConfiguration;
   effect.setColor3('emissionColor',source.emissiveColor||B.Color3.Black());
   effect.setFloat('outputLinear',+ipc.applyByPostProcess);effect.setFloat('exposure',ipc.exposure);effect.setFloat('contrast',ipc.contrast);
   effect.setFloat4('nightFog',scene.fogEnabled?scene.fogMode:0,scene.fogStart,scene.fogEnd,scene.fogDensity);
  });
  created.add(mat);metadata.emissionMaterials=created.size;return mat;
 }
 function refresh() {
  if(disposed) return;
  // Keep clear gaps dark after weather resets, without changing fog density.
  scene.clearColor.set(horizon.r,horizon.g,horizon.b,1);
  const bySource=new Map();
  for(const mesh of scene.meshes) {
   const kind=mesh.metadata?.kind;
   const role=mesh.name==='city-night-sky'?'sky':kind==='neon-panel'?'panel':kind==='neon-strip'?'strip':null;
   if(!role) continue;
   const target=mesh.sourceMesh||mesh;
   if(assigned.has(target)||target.material?.metadata?.nightBoundedEmission) continue;
   const source=target.material;if(!source) continue;
   let mat=bySource.get(source);
   if(!mat) {mat=createMaterial(source,role);bySource.set(source,mat);}
   assigned.set(target,source);target.material=mat;
  }
  // Runs after surface-detail patches, which preserve the existing car fix.
  for(const mat of scene.materials) {
   if(facades.has(mat)||!/^city-building-[0-3]$/.test(mat.name)||!mat.metadata?.celBoxInk) continue;
   const path=mat.shaderPath;
   if(!path?.fragmentSource?.includes(' float fog = 1.0;')) throw new Error('Night facade shader contract changed');
   facades.set(mat,path);
   mat.shaderPath={...path,fragmentSource:path.fragmentSource.replace(' float fog = 1.0;',FACADE_INK+'\n float fog = 1.0;')};
   mat.metadata.nightFacadeInk=true;
  }
  metadata.facadeMaterials=facades.size;
 }
 const observer=scene.onBeforeRenderObservable.add(refresh);
 const api={refresh,dispose(){
  if(disposed) return;disposed=true;scene.onBeforeRenderObservable.remove(observer);
  for(const [mesh,source] of assigned) if(!mesh.isDisposed()) mesh.material=source;
  for(const [mat,path] of facades) mat.shaderPath=path;
  for(const mat of created) mat.dispose(false,false);
  assigned.clear();created.clear();facades.clear();installed.delete(scene);
 }};
 installed.set(scene,api);refresh();scene.onDisposeObservable.addOnce(()=>api.dispose());return api;
}
