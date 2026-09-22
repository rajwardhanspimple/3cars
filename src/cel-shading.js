// Babylon.js 7.54.3 core only. Rendering state only: never edit mesh geometry,
// vertex data, parenting, instancing, LOD or the simulation.
// applyCelShading(view, options) after readiness; refresh() after new meshes.
// registerCelPalette(name, {shadowColor, rimColor, fogColor, materialColors,
//   materialTextureStrengths}) lets a scene force a flat colour with strength 0.
// Mesh/material metadata.celShading=false preserves a special effect.
const B = globalThis.BABYLON;
const controllers = new WeakMap(), palettes = new Map();
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const CEL_DEFAULTS = Object.freeze({
 bandCount:3, terminator:.28, ambientStrength:.22, sunStrength:.8,
 shadowStrength:.55, rimStrength:.22, rimPower:4, specularStrength:.12, specularThreshold:.99,
 textureStrength:.12, textureLevels:4, palette:null,
 grade:Object.freeze({toneMappingEnabled:false, exposure:1, contrast:1.18, saturation:38}),
 bloom:Object.freeze({enabled:true, threshold:1.05, weight:.08, kernel:24}),
 outlines:Object.freeze({enabled:true, color:'#050611', pixels:3, cutoff:110, maxWidth:.12,
  nearBoost:.5, nearDistance:24, carBoost:1.3, fogMix:.55, triangleBudget:1600000})
});
export const CEL_BALANCED_OUTLINES = Object.freeze({cutoff:80, pixels:2.5, triangleBudget:800000});
const asColor = (value, fallback='#ffffff') => typeof value === 'string'
 ? B.Color3.FromHexString(value) : value?.clone?.() || B.Color3.FromHexString(fallback);
export function registerCelPalette(name, palette) {
 if (!name || !palette || typeof palette !== 'object') throw new TypeError('A named cel palette is required');
 palettes.set(name,{...palette,materialColors:{...palette.materialColors},materialTextureStrengths:{...palette.materialTextureStrengths}});
}
export const CEL_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
#ifdef CEL_UV1
attribute vec2 uv;
#endif
#ifdef CEL_UV2
attribute vec2 uv2;
#endif
#ifdef CEL_COLOR
attribute vec4 color;
varying vec4 vColor;
#endif
#ifdef CEL_BOX_INK
varying vec3 vLocalPosition;
varying vec3 vLocalNormal;
varying vec3 vAxisScale;
#endif
uniform mat4 viewProjection;
uniform mat4 view;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUV1;
varying vec2 vUV2;
varying float vFogDistance;
#include<instancesDeclaration>
#include<bonesDeclaration>
void main(void) {
 #include<instancesVertex>
 #include<bonesVertex>
 vec4 p = finalWorld * vec4(position,1.0);
 vPosition = p.xyz;
 vec3 a = finalWorld[0].xyz, b = finalWorld[1].xyz, c = finalWorld[2].xyz;
 mat3 cofactor = mat3(cross(b,c),cross(c,a),cross(a,b));
 float orientation = dot(a,cross(b,c)) < 0.0 ? -1.0 : 1.0;
 vNormal = normalize(cofactor*normal*orientation);
 #ifdef CEL_BOX_INK
 vLocalPosition = position; vLocalNormal = normal;
 vAxisScale = vec3(length(a),length(b),length(c));
 #endif
 vUV1 = vec2(0.0); vUV2 = vec2(0.0);
 #ifdef CEL_UV1
 vUV1 = uv;
 #endif
 #ifdef CEL_UV2
 vUV2 = uv2;
 #endif
 #ifdef CEL_COLOR
 vColor = color;
 #endif
 vFogDistance = length((view*p).xyz);
 gl_Position = viewProjection*p;
}`;
export const CEL_FRAGMENT_SHADER = `
precision highp float;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUV1;
varying vec2 vUV2;
varying float vFogDistance;
#ifdef CEL_COLOR
varying vec4 vColor;
#endif
#ifdef CEL_BOX_INK
varying vec3 vLocalPosition;
varying vec3 vLocalNormal;
varying vec3 vAxisScale;
uniform vec3 inkBoxMin, inkBoxMax, inkColor;
uniform float inkEnabled, inkPixels, inkPixelWorld, inkCutoff, inkMaxWidth, inkNearBoost, inkNearDistance;
#endif
uniform vec3 baseColor, emissiveColor, cameraPosition;
uniform vec3 sunDirection, sunColor, skyDirection, skyColor, groundColor;
uniform vec3 shadowColor, rimColor, inkFogColor;
uniform float bandCount, terminator, ambientStrength, sunStrength, shadowStrength;
uniform float rimStrength, rimPower, specularStrength, specularThreshold;
uniform float materialAlpha, meshVisibility, alphaCutoff, useAlbedoAlpha;
uniform float vertexAlpha, textureStrength, textureLevels, doubleSided, unlit;
uniform float outputLinear, fallbackExposure, fallbackContrast;
uniform vec4 inkFog;
#ifdef CEL_ALBEDO
uniform sampler2D albedoSampler;
uniform mat4 albedoMatrix;
uniform float albedoUV, albedoGamma, albedoLevel;
#endif
#ifdef CEL_OPACITY
uniform sampler2D opacitySampler;
uniform mat4 opacityMatrix;
uniform float opacityUV, opacityRGB, opacityLevel;
#endif
#ifdef CEL_EMISSIVE
uniform sampler2D emissiveSampler;
uniform mat4 emissiveMatrix;
uniform float emissiveUV, emissiveGamma, emissiveLevel;
#endif
vec2 mappedUV(mat4 transform, float channel) {
 return (transform*vec4(mix(vUV1,vUV2,step(.5,channel)),1.0,0.0)).xy;
}
vec3 linearTex(vec3 c, float gamma) {
 return mix(c,pow(max(c,vec3(0.0)),vec3(2.2)),gamma);
}
void main(void) {
 vec4 texel = vec4(1.0);
 #ifdef CEL_ALBEDO
 texel = texture2D(albedoSampler,mappedUV(albedoMatrix,albedoUV));
 texel.rgb = linearTex(texel.rgb,albedoGamma)*albedoLevel;
 #endif
 // Never posterise alpha or emission. Cutout silhouettes and neon stay intact.
 float alpha = materialAlpha*mix(1.0,texel.a,useAlbedoAlpha);
 #ifdef CEL_OPACITY
 vec4 opacity = texture2D(opacitySampler,mappedUV(opacityMatrix,opacityUV));
 alpha *= mix(opacity.a,dot(opacity.rgb,vec3(.3,.59,.11)),opacityRGB)*opacityLevel;
 #endif
 // Quantise in perceptual space before a small tint contribution. Scanned
 // grain can change base colour by at most textureStrength, not dominate it.
 vec3 tint = texel.rgb;
 if (textureLevels >= 2.0) {
  float levels = textureLevels-1.0;
  vec3 perceptual = pow(clamp(tint,0.0,1.0),vec3(1.0/2.2));
  tint = pow(floor(perceptual*levels+.5)/levels,vec3(2.2));
 }
 vec3 base = baseColor*mix(vec3(1.0),tint,textureStrength);
 #ifdef CEL_COLOR
 base *= vColor.rgb;
 alpha *= mix(1.0,vColor.a,vertexAlpha);
 #endif
 #ifdef CEL_ALPHATEST
 if (alpha < alphaCutoff) discard;
 #endif
 vec3 N = normalize(vNormal);
 if (doubleSided > .5 && !gl_FrontFacing) N = -N;
 vec3 V = normalize(cameraPosition-vPosition), L = normalize(sunDirection);
 float ndl = dot(N,L), lit = step(terminator,ndl);
 float t = clamp((ndl-terminator)/max(.001,1.0-terminator),0.0,1.0);
 float bands = max(2.0,bandCount);
 // Three default values: 0, .5, 1. No smoothstep across diffuse boundaries.
 float diffuse = lit*(1.0+min(bands-2.0,floor(t*(bands-1.0))))/(bands-1.0);
 // Continuous hemispheric fill previously hid the graphic bands. Quantise it
 // too, and lower/tint the unlit side instead of filling every shadow equally.
 float hemi = clamp(dot(N,normalize(skyDirection))*.5+.5,0.0,1.0);
 hemi = floor(hemi*(bands-1.0)+.5)/(bands-1.0);
 vec3 ambient = mix(groundColor,skyColor,hemi)*ambientStrength;
 vec3 shaded = base*(ambient*mix(shadowColor*shadowStrength,vec3(1.0),lit)+sunColor*sunStrength*diffuse);
 float fresnel = pow(clamp(1.0-max(0.0,dot(N,V)),0.0,1.0),rimPower);
 // A narrow hard rim, not a soft glow that rounds off every value boundary.
 float rim = step(.55,fresnel)*rimStrength;
 vec3 H = normalize(L+V+vec3(.00001));
 float highlight = step(specularThreshold,max(0.0,dot(N,H)))*lit;
 shaded += rimColor*rim*min(1.0,length(skyColor)+length(sunColor));
 shaded += sunColor*highlight*specularStrength;
 vec3 emission = emissiveColor;
 #ifdef CEL_EMISSIVE
 vec3 e = texture2D(emissiveSampler,mappedUV(emissiveMatrix,emissiveUV)).rgb;
 emission *= linearTex(e,emissiveGamma)*emissiveLevel;
 #endif
 vec3 result = mix(shaded,base,unlit)+emission;
 #ifdef CEL_BOX_INK
 // City solids are hardware-instanced boxes. Draw their face-border ink in
 // this existing pass, using the instance matrix, never de-instance or redraw.
 // Face normal removes the perpendicular zero-distance axis from the minimum.
 vec3 edgeDistance = max(vec3(0.0),min(vLocalPosition-inkBoxMin,inkBoxMax-vLocalPosition))*vAxisScale;
 edgeDistance += abs(vLocalNormal)*10000.0;
 float edge = min(edgeDistance.x,min(edgeDistance.y,edgeDistance.z));
 float nearEmphasis = 1.0+inkNearBoost*(1.0-clamp(vFogDistance/inkNearDistance,0.0,1.0));
 float width = min(inkMaxWidth,inkPixelWorld*max(1.0,vFogDistance)*inkPixels*nearEmphasis);
 float fade = clamp((inkCutoff-vFogDistance)/(inkCutoff*.2),0.0,1.0);
 float coverage = (1.0-smoothstep(width*.7,width,edge))*inkEnabled*fade;
 result = mix(result,inkColor,coverage);
 #endif
 float fog = 1.0;
 if (inkFog.x == 1.0) fog = exp(-vFogDistance*inkFog.w);
 else if (inkFog.x == 2.0) fog = exp(-pow(vFogDistance*inkFog.w,2.0));
 else if (inkFog.x == 3.0) fog = (inkFog.z-vFogDistance)/max(.001,inkFog.z-inkFog.y);
 result = mix(inkFogColor,result,clamp(fog,0.0,1.0));
 if (outputLinear < .5) {
  result = pow(max(result*fallbackExposure,vec3(0.0)),vec3(1.0/2.2));
  result = max(vec3(0.0),(result-.5)*fallbackContrast+.5);
 }
 gl_FragColor = vec4(result,alpha*meshVisibility);
}`;
function mergeOptions(previous,next) {
 const result = {...previous,...next};
 for (const key of ['grade','bloom','outlines']) result[key] = {...previous[key],...next[key]};
 result.bandCount=clamp(Math.round(result.bandCount),2,8);
 result.terminator=clamp(result.terminator,0,.95);
 result.textureStrength=clamp(result.textureStrength,0,1);
 result.textureLevels=result.textureLevels < 2 ? 0 : clamp(Math.round(result.textureLevels),2,32);
 return result;
}
function textures(source) {
 return {albedo:source.albedoTexture||source.diffuseTexture,opacity:source.opacityTexture,emissive:source.emissiveTexture};
}
function alphaState(source) {
 const mode=source.transparencyMode;
 const test=mode===B.Material.MATERIAL_ALPHATEST||mode===B.Material.MATERIAL_ALPHATESTANDBLEND||!!source.needAlphaTesting?.();
 const blend=mode===B.Material.MATERIAL_ALPHABLEND||mode===B.Material.MATERIAL_ALPHATESTANDBLEND||!!source.needAlphaBlending?.();
 const albedo=source.albedoTexture||source.diffuseTexture;
 return {test,blend,albedo:!!albedo?.hasAlpha&&(test||!!source.useAlphaFromAlbedoTexture||!!source.useAlphaFromDiffuseTexture)};
}
function variantFor(mesh) {
 if (!mesh) return {uv1:true,uv2:true,color:false,box:false};
 return {uv1:mesh.isVerticesDataPresent(B.VertexBuffer.UVKind),uv2:mesh.isVerticesDataPresent(B.VertexBuffer.UV2Kind),
  color:mesh.useVertexColors&&mesh.isVerticesDataPresent(B.VertexBuffer.ColorKind),
  // Restrict automatic borders to the known box topology of the city pools.
  // Other scenes can explicitly opt a box into this without new vertex data.
  box:mesh.metadata?.celBoxInk===true||!!(mesh.metadata?.cityWorld&&mesh.metadata?.template&&mesh.getTotalVertices()===24&&mesh.getTotalIndices()===36)};
}
const effectMesh=mesh=>/^(tire-smoke-|tire-particulate-|grit-speck-|skid-mark-|boost-flame-)/.test(mesh.name);
export function applyCelShading(view,options={}) {
 const scene=view.scene;
 if (!scene) throw new TypeError('applyCelShading needs a view with a scene');
 const existing=controllers.get(scene);
 if (existing) {existing.setOptions(options);existing.refresh();return existing;}
 let settings=mergeOptions(CEL_DEFAULTS,view.quality==='high'?options:{...options,
  bloom:{enabled:false,...options.bloom},outlines:{...CEL_BALANCED_OUTLINES,...options.outlines}});
 const cache=new WeakMap(),sourceFor=new WeakMap(),created=new Set(),assigned=new Map(),outlined=new Map();
 let disposed=false,convertedCount=0;
 const identity=B.Matrix.Identity(),white=B.Color3.White(),black=B.Color3.Black();
 const up=new B.Vector3(0,1,0),toSun=new B.Vector3(0,1,0),skyDirection=new B.Vector3(0,1,0);
 let palette={},shadowTint=white,rimTint=white,outlineColor=black,outlineLinear=black,paletteFog=null;
 const originalFog=scene.fogColor.clone();
 const counts={materialsConverted:0,outlineTechnique:'inverted-hull',instanceInkTechnique:'box-face-borders',
  bandCount:settings.bandCount,outlinedMeshes:0,outlinedTriangles:0,outlinedCarMeshes:0,boxInkMaterials:0};
 scene.metadata={...scene.metadata,celShading:counts};
 function configure() {
  palette=typeof settings.palette==='string'?palettes.get(settings.palette)||{}:settings.palette||{};
  shadowTint=asColor(palette.shadowColor,'#747bb5');rimTint=asColor(palette.rimColor,'#cfddff');
  outlineColor=asColor(settings.outlines.color);outlineLinear=outlineColor.toLinearSpace();
  paletteFog=palette.fogColor?asColor(palette.fogColor):null;
  if (paletteFog) scene.fogColor.copyFrom(paletteFog);
  const ipc=scene.imageProcessingConfiguration,grade=settings.grade;
  ipc.toneMappingEnabled=grade.toneMappingEnabled;
  if (grade.toneMappingType!==undefined) ipc.toneMappingType=grade.toneMappingType;
  ipc.exposure=grade.exposure;ipc.contrast=grade.contrast;
  ipc.colorCurves=ipc.colorCurves||new B.ColorCurves();
  ipc.colorCurves.globalSaturation=grade.saturation;ipc.colorCurvesEnabled=grade.saturation!==0;
  if (view.pipeline) {
   view.pipeline.imageProcessingEnabled=true;view.pipeline.bloomEnabled=settings.bloom.enabled;
   view.pipeline.bloomThreshold=settings.bloom.threshold;view.pipeline.bloomWeight=settings.bloom.weight;view.pipeline.bloomKernel=settings.bloom.kernel;
  }
  Object.assign(counts,{bandCount:settings.bandCount,terminator:settings.terminator,textureStrength:settings.textureStrength,
   textureLevels:settings.textureLevels,palette:typeof settings.palette==='string'?settings.palette:'custom',grade:{...grade},
   outlineCutoff:settings.outlines.cutoff,outlinePixels:settings.outlines.pixels,outlineTriangleBudget:settings.outlines.triangleBudget,
   fogColor:paletteFog?.toHexString()||null});
 }
 function convertMaterial(input,mesh=null) {
  if (!input||sourceFor.has(input)||input.metadata?.celShading===false) return input;
  const variant=variantFor(mesh),key=`${+variant.uv1}${+variant.uv2}${+variant.color}${+variant.box}`;
  let variants=cache.get(input);
  if (!variants) {variants=new Map();cache.set(input,variants);}
  if (variants.has(key)) return variants.get(key);
  if (input instanceof B.MultiMaterial) {
   const multi=new B.MultiMaterial(input.name,scene);
   variants.set(key,multi);sourceFor.set(multi,input);created.add(multi);
   multi.subMaterials=input.subMaterials.map(m=>convertMaterial(m,mesh));return multi;
  }
  if (!(input instanceof B.PBRMaterial)&&!(input instanceof B.StandardMaterial)) return input;
  const maps=textures(input),alpha=alphaState(input),attributes=['position','normal'],defines=[];
  const boxInk=variant.box&&!alpha.test&&!alpha.blend&&input.backFaceCulling;
  for (const [flag,on,attribute] of [['CEL_UV1',variant.uv1,'uv'],['CEL_UV2',variant.uv2,'uv2'],['CEL_COLOR',variant.color,'color']]) {
   if (on) {defines.push(`#define ${flag}`);attributes.push(attribute);}
  }
  if (boxInk) {defines.push('#define CEL_BOX_INK');counts.boxInkMaterials++;}
  for (const [name,texture] of Object.entries(maps)) if (texture) defines.push(`#define CEL_${name.toUpperCase()}`);
  if (alpha.test) defines.push('#define CEL_ALPHATEST');
  const uniforms=['world','view','viewProjection','mBones','boneTextureWidth',
   'baseColor','emissiveColor','cameraPosition','sunDirection','sunColor','skyDirection','skyColor','groundColor',
   'shadowColor','rimColor','inkFogColor','bandCount','terminator','ambientStrength','sunStrength','shadowStrength','rimStrength','rimPower',
   'specularStrength','specularThreshold','materialAlpha','meshVisibility','alphaCutoff','useAlbedoAlpha','vertexAlpha',
   'textureStrength','textureLevels','doubleSided','unlit','outputLinear','fallbackExposure','fallbackContrast','inkFog',
   'albedoMatrix','albedoUV','albedoGamma','albedoLevel','opacityMatrix','opacityUV','opacityRGB','opacityLevel',
   'emissiveMatrix','emissiveUV','emissiveGamma','emissiveLevel','inkBoxMin','inkBoxMax','inkColor',
   'inkEnabled','inkPixels','inkPixelWorld','inkCutoff','inkMaxWidth','inkNearBoost','inkNearDistance'];
  const mat=new B.ShaderMaterial(input.name,scene,{vertexSource:CEL_VERTEX_SHADER,fragmentSource:CEL_FRAGMENT_SHADER},{
   attributes,uniforms,samplers:['albedoSampler','opacitySampler','emissiveSampler','boneSampler'],defines,
   needAlphaBlending:alpha.blend,needAlphaTesting:alpha.test});
  variants.set(key,mat);sourceFor.set(mat,input);created.add(mat);
  mat.metadata={...input.metadata,celShading:true,celSourceName:input.name,celBoxInk:boxInk};
  // Original paint/brake/weather handles remain live and independent per car.
  for (const property of ['alpha','alphaMode','transparencyMode','backFaceCulling','cullBackFaces','sideOrientation','disableDepthWrite','forceDepthWrite','needDepthPrePass','zOffset','zOffsetUnits','fogEnabled','fillMode']) {
   Object.defineProperty(mat,property,{configurable:true,get:()=>input[property],set:value=>{input[property]=value;}});
  }
  for (const property of ['albedoColor','diffuseColor','emissiveColor','albedoTexture','diffuseTexture','opacityTexture','emissiveTexture','alphaCutOff']) {
   Object.defineProperty(mat,property,{configurable:true,get:()=>input[property],set:value=>{input[property]=value;}});
  }
  mat.getAlphaTestTexture=()=>input.getAlphaTestTexture?.()||maps.albedo||maps.opacity||null;
  mat.clone=name=>convertMaterial(input.clone(name),mesh);
  for (const [name,texture] of Object.entries(maps)) if (texture) mat.setTexture(`${name}Sampler`,texture);
  mat.onBindObservable.add(boundMesh=>{
   const effect=mat.getEffect();if (!effect) return;
   const sun=view.sun||scene.lights.find(light=>light instanceof B.DirectionalLight);
   const hemi=view.hemi||scene.lights.find(light=>light instanceof B.HemisphericLight);
   const camera=scene.activeCamera||view.camera;
   toSun.copyFrom(sun?.transformedDirection||sun?.direction||up).scaleInPlace(-1).normalize();
   skyDirection.copyFrom(hemi?.direction||up).normalize();
   const sourceColor=input.albedoColor||input.diffuseColor||white;
   const paletteKey=input.metadata?.celPaletteKey||input.name.replace(/^car-\d+-/,'');
   const override=palette.materialColors?.[input.name]||palette.materialColors?.[paletteKey];
   const base=override?asColor(override).toLinearSpace():input instanceof B.PBRMaterial?sourceColor:sourceColor.toLinearSpace();
   effect.setColor3('baseColor',base);effect.setColor3('emissiveColor',input.emissiveColor||black);
   effect.setVector3('cameraPosition',camera?.globalPosition||camera?.position||up);
   effect.setVector3('sunDirection',toSun);effect.setVector3('skyDirection',skyDirection);
   effect.setColor3('sunColor',sun?.isEnabled()?sun.diffuse.scale(sun.intensity):black);
   effect.setColor3('skyColor',hemi?.isEnabled()?hemi.diffuse.scale(hemi.intensity):black);
   effect.setColor3('groundColor',hemi?.isEnabled()?hemi.groundColor.scale(hemi.intensity):black);
   effect.setColor3('shadowColor',shadowTint);effect.setColor3('rimColor',rimTint);
   for (const name of ['bandCount','terminator','ambientStrength','sunStrength','shadowStrength','rimStrength','rimPower','specularStrength','specularThreshold','textureLevels']) effect.setFloat(name,settings[name]);
   const tintStrength=palette.materialTextureStrengths?.[input.name]??palette.materialTextureStrengths?.[paletteKey]??settings.textureStrength;
   effect.setFloat('textureStrength',clamp(tintStrength,0,1));
   effect.setFloat('materialAlpha',input.alpha??1);effect.setFloat('meshVisibility',boundMesh?.visibility??1);
   effect.setFloat('alphaCutoff',input.alphaCutOff??.4);effect.setFloat('useAlbedoAlpha',+alpha.albedo);
   effect.setFloat('vertexAlpha',+(boundMesh?.hasVertexAlpha||false));
   effect.setFloat('doubleSided',+!input.backFaceCulling);effect.setFloat('unlit',+(input.unlit||input.disableLighting||false));
   effect.setFloat('outputLinear',+scene.imageProcessingConfiguration.applyByPostProcess);
   effect.setFloat('fallbackExposure',settings.grade.exposure);effect.setFloat('fallbackContrast',settings.grade.contrast);
   const fog=scene.fogEnabled&&input.fogEnabled!==false&&boundMesh?.applyFog!==false;
   effect.setFloat4('inkFog',fog?scene.fogMode:0,scene.fogStart,scene.fogEnd,scene.fogDensity);
   effect.setColor3('inkFogColor',scene.fogColor.toLinearSpace());
   if (boxInk) {
    const bounds=mesh.getBoundingInfo().boundingBox,o=settings.outlines;
    effect.setVector3('inkBoxMin',bounds.minimum);effect.setVector3('inkBoxMax',bounds.maximum);
    effect.setColor3('inkColor',outlineLinear);effect.setFloat('inkEnabled',+o.enabled);
    effect.setFloat('inkPixels',o.pixels);effect.setFloat('inkPixelWorld',2*Math.tan((camera?.fov||.8)/2)/scene.getEngine().getRenderHeight());
    effect.setFloat('inkCutoff',o.cutoff);effect.setFloat('inkMaxWidth',o.maxWidth);
    effect.setFloat('inkNearBoost',o.nearBoost);effect.setFloat('inkNearDistance',Math.max(1,o.nearDistance));
   }
   for (const [name,texture] of Object.entries(textures(input))) if (texture) {
    effect.setTexture(`${name}Sampler`,texture);effect.setMatrix(`${name}Matrix`,texture.getTextureMatrix?.()||identity);
    effect.setFloat(`${name}UV`,texture.coordinatesIndex||0);effect.setFloat(`${name}Level`,texture.level??1);
    if (name==='opacity') effect.setFloat('opacityRGB',+!!texture.getAlphaFromRGB);
    else effect.setFloat(`${name}Gamma`,+!!texture.gammaSpace);
   }
  });
  convertedCount++;counts.materialsConverted=convertedCount;return mat;
 }
 function convertMesh(mesh) {
  if (!mesh||mesh.isDisposed()||mesh.metadata?.celShading===false||mesh.metadata?.template||effectMesh(mesh)||mesh.infiniteDistance) return mesh;
  if (!mesh.getTotalVertices?.()||!mesh.isVerticesDataPresent(B.VertexBuffer.NormalKind)) return mesh;
  const target=mesh.sourceMesh||mesh;
  if (target.material?.disableLighting||target.material?.metadata?.celShading===false) return mesh;
  const before=target.material,after=convertMaterial(before,target);
  if (before!==after) {if (!assigned.has(target)) assigned.set(target,before);target.material=after;}
  if (sourceFor.has(after)&&!outlined.has(target)) outlined.set(target,{renderOutline:target.renderOutline,color:target.outlineColor,width:target.outlineWidth});
  return mesh;
 }
 function updateOutlines() {
  // Weather can set fog every reset. Keep the selected art palette authoritative
  // for hue, while weather still owns density/mode/start/end.
  if (paletteFog) scene.fogColor.copyFrom(paletteFog);
  const camera=scene.activeCamera||view.camera;if (!camera) return;
  const o=settings.outlines,position=camera.globalPosition||camera.position,candidates=[];
  const carMeshes=new Set((view.carNodes||[]).flatMap(node=>node.meshes||node.root?.getChildMeshes()||[]));
  for (const [mesh] of outlined) {
   if (mesh.isDisposed()) {outlined.delete(mesh);assigned.delete(mesh);continue;}
   mesh.renderOutline=false;
   // Cutout/glass excluded. Instanced boxes use same-pass face ink above.
   if (!o.enabled||!mesh.isEnabled()||!mesh.isVisible||mesh.visibility<1||mesh.instances?.length||mesh.hasThinInstances) continue;
   const mat=mesh.material;
   if (!mat||mat instanceof B.MultiMaterial||mat.needAlphaTesting()||mat.needAlphaBlending()||!mat.backFaceCulling) continue;
   mesh.computeWorldMatrix();
   const sphere=mesh.getBoundingInfo().boundingSphere;
   const distance=B.Vector3.Distance(position,sphere.centerWorld);
   if (Math.max(0,distance-sphere.radiusWorld)>=o.cutoff) continue;
   const car=carMeshes.has(mesh)||!!mesh.metadata?.mustang||/^car-\d+-/.test(mesh.name);
   const paint=/CARPAINT|paint/i.test(mat.name);
   candidates.push({mesh,distance,triangles:mesh.getTotalIndices()/3,car,paint});
  }
  // Spend the unchanged budget on hero paint before hidden wheel/brake detail.
  // Nearest car paint wins first, then other car parts, then nearby scenery.
  candidates.sort((a,b)=>(+b.car-+a.car)||(+b.paint-+a.paint)||a.distance-b.distance);
  let triangles=0,meshes=0,cars=0;
  // Built-in expanded hull reuses immutable geometry. It can draw twice:
  // budgets count SOURCE triangles, not draw cost. No full-scene prepass.
  for (const item of candidates) {
   if (triangles+item.triangles>o.triangleBudget) continue;
   const mesh=item.mesh,m=mesh.getWorldMatrix().m;
   const scale=Math.max(.0001,Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10]));
   const distance=Math.max(1,item.distance),pixelWorld=2*Math.tan(camera.fov/2)*distance/scene.getEngine().getRenderHeight();
   const near=1+o.nearBoost*(1-clamp(distance/Math.max(1,o.nearDistance),0,1));
   const fade=clamp((o.cutoff-distance)/(o.cutoff*.2),0,1);
   mesh.outlineWidth=Math.min(o.maxWidth,pixelWorld*o.pixels*near*(item.car?o.carBoost:1))*fade/scale;
   let fog=1;
   if (scene.fogEnabled&&mesh.applyFog!==false&&mesh.material.fogEnabled!==false) {
    if (scene.fogMode===B.Scene.FOGMODE_EXP) fog=Math.exp(-distance*scene.fogDensity);
    else if (scene.fogMode===B.Scene.FOGMODE_EXP2) fog=Math.exp(-((distance*scene.fogDensity)**2));
    else if (scene.fogMode===B.Scene.FOGMODE_LINEAR) fog=clamp((scene.fogEnd-distance)/Math.max(.001,scene.fogEnd-scene.fogStart),0,1);
   }
   // Core hull shader has no fog. Blend its ink toward the same haze on CPU,
   // retaining some dark line contrast; no global outline shader replacement.
   mesh.outlineColor=B.Color3.Lerp(outlineColor,scene.fogColor,(1-fog)*o.fogMix);
   mesh.renderOutline=mesh.outlineWidth>0;
   triangles+=item.triangles;meshes++;if (item.car) cars++;
  }
  counts.outlinedMeshes=meshes;counts.outlinedTriangles=triangles;counts.outlinedCarMeshes=cars;
 }
 const observer=scene.onBeforeRenderObservable.add(updateOutlines);
 const api={
  convertMaterial,convertMesh,
  refresh() {if (!disposed) for (const mesh of [...scene.meshes]) convertMesh(mesh);return api;},
  setOptions(next) {settings=mergeOptions(settings,next);configure();return api;},
  registerPalette(name,value) {registerCelPalette(name,value);return api;},
  get options() {return mergeOptions(settings,{});},
  dispose() {
   if (disposed) return;disposed=true;scene.onBeforeRenderObservable.remove(observer);
   for (const [mesh,source] of assigned) if (!mesh.isDisposed()) mesh.material=source;
   for (const [mesh,old] of outlined) if (!mesh.isDisposed()) {mesh.renderOutline=old.renderOutline;mesh.outlineColor=old.color;mesh.outlineWidth=old.width;}
   if (paletteFog) scene.fogColor.copyFrom(originalFog);
   for (const material of created) material.dispose(false,false);
   assigned.clear();outlined.clear();created.clear();controllers.delete(scene);
  }
 };
 controllers.set(scene,api);configure();api.refresh();scene.onDisposeObservable.addOnce(()=>api.dispose());return api;
}
