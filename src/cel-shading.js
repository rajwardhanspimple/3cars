// Babylon.js 7.54.3 core only. No material-library dependency or geometry edits.
// Entry point: applyCelShading(view, options), after world/fleet readiness.
// Later scenes: registerCelPalette('night', { rimColor:'#a9beff',
//   shadowColor:'#727dac', materialColors:{ asphalt:'#30394f' } });
// view.celShading.setOptions({ palette:'night', grade:{ exposure:.9 },
//   bloom:{ enabled:true, threshold:1.1, weight:.12 } });
// Call refresh() after adding meshes. Set mesh/material.metadata.celShading=false
// to retain a special effect. Original materials stay alive as live control state.
const B = globalThis.BABYLON;
const controllers = new WeakMap();
const palettes = new Map();
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const defaults = {
 bandCount: 3, terminator: .08, ambientStrength: .42, sunStrength: .36,
 rimStrength: .16, rimPower: 3, specularStrength: .16, specularThreshold: .985,
 textureStrength: 1, palette: null,
 grade: { toneMappingEnabled: false, exposure: 1, contrast: 1.02, saturation: 14 },
 bloom: { enabled: true, threshold: 1.05, weight: .08, kernel: 24 },
 outlines: { enabled: true, color: '#151525', pixels: 1.25, cutoff: 42, maxWidth: .035, triangleBudget: 1600000 }
};
const asColor = (value, fallback = '#ffffff') => typeof value === 'string'
 ? B.Color3.FromHexString(value) : value?.clone?.() || B.Color3.FromHexString(fallback);

export function registerCelPalette(name, palette) {
 if (!name || !palette || typeof palette !== 'object') throw new TypeError('A named cel palette is required');
 palettes.set(name, { ...palette, materialColors: { ...palette.materialColors } });
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
 vec4 p = finalWorld * vec4(position, 1.0);
 vPosition = p.xyz;
 // Cofactors implement inverse-transpose without GLSL ES 3 inverse().
 // Correct under nonuniform scaling, including a negative determinant.
 vec3 a = finalWorld[0].xyz, b = finalWorld[1].xyz, c = finalWorld[2].xyz;
 mat3 cofactor = mat3(cross(b,c), cross(c,a), cross(a,b));
 float orientation = dot(a,cross(b,c)) < 0.0 ? -1.0 : 1.0;
 vNormal = normalize(cofactor * normal * orientation);
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
 vFogDistance = length((view * p).xyz);
 gl_Position = viewProjection * p;
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
uniform vec3 baseColor, emissiveColor, cameraPosition;
uniform vec3 sunDirection, sunColor, skyDirection, skyColor, groundColor;
uniform vec3 shadowColor, rimColor, inkFogColor;
uniform float bandCount, terminator, ambientStrength, sunStrength;
uniform float rimStrength, rimPower, specularStrength, specularThreshold;
uniform float materialAlpha, meshVisibility, alphaCutoff, useAlbedoAlpha;
uniform float vertexAlpha, textureStrength, doubleSided, unlit;
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
 return (transform * vec4(mix(vUV1, vUV2, step(.5, channel)), 1.0, 0.0)).xy;
}
vec3 linearTex(vec3 c, float gamma) {
 return mix(c, pow(max(c,vec3(0.0)),vec3(2.2)), gamma);
}
void main(void) {
 vec4 texel = vec4(1.0);
 #ifdef CEL_ALBEDO
 texel = texture2D(albedoSampler, mappedUV(albedoMatrix, albedoUV));
 texel.rgb = linearTex(texel.rgb, albedoGamma) * albedoLevel;
 #endif
 float alpha = materialAlpha * mix(1.0, texel.a, useAlbedoAlpha);
 #ifdef CEL_OPACITY
 vec4 opacity = texture2D(opacitySampler, mappedUV(opacityMatrix, opacityUV));
 alpha *= mix(opacity.a, dot(opacity.rgb, vec3(.3,.59,.11)), opacityRGB) * opacityLevel;
 #endif
 vec3 base = baseColor * mix(vec3(1.0), texel.rgb, textureStrength);
 #ifdef CEL_COLOR
 base *= vColor.rgb;
 alpha *= mix(1.0, vColor.a, vertexAlpha);
 #endif
 // Test before visibility, which is a per-mesh fade, not part of the cutout.
 #ifdef CEL_ALPHATEST
 if (alpha < alphaCutoff) discard;
 #endif
 vec3 N = normalize(vNormal);
 if (doubleSided > .5 && !gl_FrontFacing) N = -N;
 vec3 V = normalize(cameraPosition - vPosition);
 vec3 L = normalize(sunDirection);
 float ndl = dot(N,L);
 float lit = step(terminator, ndl);
 float t = clamp((ndl-terminator)/max(.001,1.0-terminator),0.0,1.0);
 float bands = max(2.0,bandCount);
 // Exactly bandCount values, including the dark side, with a hard terminator.
 float diffuse = lit * (1.0 + min(bands-2.0,floor(t*(bands-1.0)))) / (bands-1.0);
 float hemi = clamp(dot(N,normalize(skyDirection))*.5+.5,0.0,1.0);
 vec3 ambient = mix(groundColor,skyColor,hemi) * ambientStrength;
 vec3 shaded = base * (ambient * mix(shadowColor,vec3(1.0),lit) + sunColor*sunStrength*diffuse);
 float fresnel = pow(clamp(1.0-max(0.0,dot(N,V)),0.0,1.0),rimPower);
 float rim = smoothstep(.35,.65,fresnel) * rimStrength;
 // A compact hard highlight, never the broad smooth PBR specular lobe.
 vec3 H = normalize(L+V+vec3(.00001));
 float highlight = step(specularThreshold,max(0.0,dot(N,H))) * lit;
 shaded += rimColor * rim * min(1.0,length(skyColor)+length(sunColor));
 shaded += sunColor * highlight * specularStrength;
 vec3 emission = emissiveColor;
 #ifdef CEL_EMISSIVE
 vec3 e = texture2D(emissiveSampler,mappedUV(emissiveMatrix,emissiveUV)).rgb;
 emission *= linearTex(e,emissiveGamma) * emissiveLevel;
 #endif
 vec3 result = mix(shaded,base,unlit) + emission;
 float fog = 1.0;
 if (inkFog.x == 1.0) fog = exp(-vFogDistance*inkFog.w);
 else if (inkFog.x == 2.0) fog = exp(-pow(vFogDistance*inkFog.w,2.0));
 else if (inkFog.x == 3.0) fog = (inkFog.z-vFogDistance)/max(.001,inkFog.z-inkFog.y);
 result = mix(inkFogColor,result,clamp(fog,0.0,1.0));
 // DefaultRenderingPipeline consumes linear HDR; do not apply gamma twice.
 if (outputLinear < .5) {
  result = pow(max(result*fallbackExposure,vec3(0.0)),vec3(1.0/2.2));
  result = max(vec3(0.0),(result-.5)*fallbackContrast+.5);
 }
 gl_FragColor = vec4(result,alpha*meshVisibility);
}`;

function mergeOptions(previous, next) {
 const result = { ...previous, ...next };
 for (const key of ['grade','bloom','outlines']) result[key] = { ...previous[key], ...next[key] };
 result.bandCount = clamp(Math.round(result.bandCount),2,8);
 result.terminator = clamp(result.terminator,0,.95);
 return result;
}
function textures(source) {
 return { albedo: source.albedoTexture || source.diffuseTexture, opacity: source.opacityTexture, emissive: source.emissiveTexture };
}
function alphaState(source) {
 const mode = source.transparencyMode;
 const test = mode === B.Material.MATERIAL_ALPHATEST || mode === B.Material.MATERIAL_ALPHATESTANDBLEND || !!source.needAlphaTesting?.();
 const blend = mode === B.Material.MATERIAL_ALPHABLEND || mode === B.Material.MATERIAL_ALPHATESTANDBLEND || !!source.needAlphaBlending?.();
 const albedo = source.albedoTexture || source.diffuseTexture;
 return { test, blend, albedo: !!albedo?.hasAlpha && (test || !!source.useAlphaFromAlbedoTexture || !!source.useAlphaFromDiffuseTexture) };
}
function variantFor(mesh) {
 if (!mesh) return { uv1: true, uv2: true, color: false };
 return { uv1: mesh.isVerticesDataPresent(B.VertexBuffer.UVKind), uv2: mesh.isVerticesDataPresent(B.VertexBuffer.UV2Kind), color: mesh.useVertexColors && mesh.isVerticesDataPresent(B.VertexBuffer.ColorKind) };
}
const effectMesh = mesh => /^(tire-smoke-|tire-particulate-|grit-speck-|skid-mark-|boost-flame-)/.test(mesh.name);

export function applyCelShading(view, options = {}) {
 const scene = view.scene;
 if (!scene) throw new TypeError('applyCelShading needs a view with a scene');
 const existing = controllers.get(scene);
 if (existing) { existing.setOptions(options); existing.refresh(); return existing; }
 let settings = mergeOptions(defaults, view.quality === 'high' ? options : {
  ...options, bloom: { enabled:false,...options.bloom },
  outlines: { cutoff:28, pixels:1, triangleBudget:800000,...options.outlines }
 });
 const cache = new WeakMap(), sourceFor = new WeakMap(), created = new Set(), assigned = new Map(), outlined = new Map();
 let disposed = false, convertedCount = 0;
 const identity = B.Matrix.Identity(), white = B.Color3.White(), black = B.Color3.Black();
 const up = new B.Vector3(0,1,0), toSun = new B.Vector3(0,1,0), skyDirection = new B.Vector3(0,1,0);
 let palette = {}, shadowTint = white, rimTint = white, outlineColor = black;
 const counts = { materialsConverted:0, outlineTechnique:'inverted-hull', bandCount:settings.bandCount, outlinedMeshes:0, outlinedTriangles:0 };
 scene.metadata = { ...scene.metadata, celShading:counts };

 function configure() {
  palette = typeof settings.palette === 'string' ? palettes.get(settings.palette) || {} : settings.palette || {};
  shadowTint = asColor(palette.shadowColor); rimTint = asColor(palette.rimColor,'#cfddff');
  outlineColor = asColor(settings.outlines.color);
  const ipc = scene.imageProcessingConfiguration, grade = settings.grade;
  ipc.toneMappingEnabled = grade.toneMappingEnabled;
  if (grade.toneMappingType !== undefined) ipc.toneMappingType = grade.toneMappingType;
  ipc.exposure = grade.exposure; ipc.contrast = grade.contrast;
  ipc.colorCurves = ipc.colorCurves || new B.ColorCurves();
  ipc.colorCurves.globalSaturation = grade.saturation; ipc.colorCurvesEnabled = grade.saturation !== 0;
  if (view.pipeline) {
   view.pipeline.imageProcessingEnabled = true;
   view.pipeline.bloomEnabled = settings.bloom.enabled;
   view.pipeline.bloomThreshold = settings.bloom.threshold;
   view.pipeline.bloomWeight = settings.bloom.weight;
   view.pipeline.bloomKernel = settings.bloom.kernel;
  }
  Object.assign(counts,{ bandCount:settings.bandCount, palette:typeof settings.palette === 'string' ? settings.palette : 'custom', grade:{...grade}, outlineCutoff:settings.outlines.cutoff, outlineTriangleBudget:settings.outlines.triangleBudget });
 }

 function convertMaterial(input, mesh = null) {
  if (!input || sourceFor.has(input) || input.metadata?.celShading === false) return input;
  const variant = variantFor(mesh), key = `${+variant.uv1}${+variant.uv2}${+variant.color}`;
  let variants = cache.get(input);
  if (!variants) { variants = new Map(); cache.set(input,variants); }
  if (variants.has(key)) return variants.get(key);
  if (input instanceof B.MultiMaterial) {
   const multi = new B.MultiMaterial(input.name,scene);
   variants.set(key,multi); sourceFor.set(multi,input); created.add(multi);
   multi.subMaterials = input.subMaterials.map(m => convertMaterial(m,mesh));
   return multi;
  }
  // Existing custom shaders, particles and line materials retain their own contract.
  if (!(input instanceof B.PBRMaterial) && !(input instanceof B.StandardMaterial)) return input;
  const maps = textures(input), alpha = alphaState(input), attributes = ['position','normal'], defines = [];
  for (const [flag,on,attribute] of [['CEL_UV1',variant.uv1,'uv'],['CEL_UV2',variant.uv2,'uv2'],['CEL_COLOR',variant.color,'color']]) {
   if (on) { defines.push(`#define ${flag}`); attributes.push(attribute); }
  }
  for (const [name,texture] of Object.entries(maps)) if (texture) defines.push(`#define CEL_${name.toUpperCase()}`);
  if (alpha.test) defines.push('#define CEL_ALPHATEST');
  const uniforms = ['world','view','viewProjection','mBones','boneTextureWidth',
   'baseColor','emissiveColor','cameraPosition','sunDirection','sunColor','skyDirection','skyColor','groundColor',
   'shadowColor','rimColor','inkFogColor','bandCount','terminator','ambientStrength','sunStrength','rimStrength','rimPower',
   'specularStrength','specularThreshold','materialAlpha','meshVisibility','alphaCutoff','useAlbedoAlpha','vertexAlpha',
   'textureStrength','doubleSided','unlit','outputLinear','fallbackExposure','fallbackContrast','inkFog',
   'albedoMatrix','albedoUV','albedoGamma','albedoLevel','opacityMatrix','opacityUV','opacityRGB','opacityLevel',
   'emissiveMatrix','emissiveUV','emissiveGamma','emissiveLevel'];
  const mat = new B.ShaderMaterial(input.name,scene,{vertexSource:CEL_VERTEX_SHADER,fragmentSource:CEL_FRAGMENT_SHADER},{
   attributes, uniforms, samplers:['albedoSampler','opacitySampler','emissiveSampler','boneSampler'], defines,
   needAlphaBlending:alpha.blend, needAlphaTesting:alpha.test
  });
  variants.set(key,mat); sourceFor.set(mat,input); created.add(mat);
  mat.metadata = { ...input.metadata, celShading:true, celSourceName:input.name };
  // Keep all existing material handles (paint, brake lights, weather) live.
  // A different source object ALWAYS has a different shader object/cache entry.
  for (const property of ['alpha','alphaMode','transparencyMode','backFaceCulling','cullBackFaces','sideOrientation','disableDepthWrite','forceDepthWrite','needDepthPrePass','zOffset','zOffsetUnits','fogEnabled','fillMode']) {
   Object.defineProperty(mat,property,{configurable:true,get:()=>input[property],set:value=>{input[property]=value;}});
  }
  for (const property of ['albedoColor','diffuseColor','emissiveColor','albedoTexture','diffuseTexture','opacityTexture','emissiveTexture','alphaCutOff']) {
   Object.defineProperty(mat,property,{configurable:true,get:()=>input[property],set:value=>{input[property]=value;}});
  }
  mat.getAlphaTestTexture = () => input.getAlphaTestTexture?.() || maps.albedo || maps.opacity || null;
  // Override clone so new cars never inherit another car's live material state.
  mat.clone = name => convertMaterial(input.clone(name),mesh);
  for (const [name,texture] of Object.entries(maps)) if (texture) mat.setTexture(`${name}Sampler`,texture);
  mat.onBindObservable.add(boundMesh => {
   const effect = mat.getEffect(); if (!effect) return;
   const sun = view.sun || scene.lights.find(light=>light instanceof B.DirectionalLight);
   const hemi = view.hemi || scene.lights.find(light=>light instanceof B.HemisphericLight);
   toSun.copyFrom(sun?.transformedDirection || sun?.direction || up).scaleInPlace(-1).normalize();
   skyDirection.copyFrom(hemi?.direction || up).normalize();
   const sourceColor = input.albedoColor || input.diffuseColor || white;
   const paletteKey = input.metadata?.celPaletteKey || input.name.replace(/^car-\d+-/,'');
   const override = palette.materialColors?.[input.name] || palette.materialColors?.[paletteKey];
   const base = override ? asColor(override).toLinearSpace() : input instanceof B.PBRMaterial ? sourceColor : sourceColor.toLinearSpace();
   effect.setColor3('baseColor',base);
   effect.setColor3('emissiveColor',input.emissiveColor || black);
   effect.setVector3('cameraPosition',scene.activeCamera?.globalPosition || view.camera?.position || up);
   effect.setVector3('sunDirection',toSun); effect.setVector3('skyDirection',skyDirection);
   effect.setColor3('sunColor',sun?.isEnabled() ? sun.diffuse.scale(sun.intensity) : black);
   effect.setColor3('skyColor',hemi?.isEnabled() ? hemi.diffuse.scale(hemi.intensity) : black);
   effect.setColor3('groundColor',hemi?.isEnabled() ? hemi.groundColor.scale(hemi.intensity) : black);
   effect.setColor3('shadowColor',shadowTint); effect.setColor3('rimColor',rimTint);
   for (const name of ['bandCount','terminator','ambientStrength','sunStrength','rimStrength','rimPower','specularStrength','specularThreshold','textureStrength']) effect.setFloat(name,settings[name]);
   effect.setFloat('materialAlpha',input.alpha ?? 1); effect.setFloat('meshVisibility',boundMesh?.visibility ?? 1);
   effect.setFloat('alphaCutoff',input.alphaCutOff ?? .4); effect.setFloat('useAlbedoAlpha',+alpha.albedo);
   effect.setFloat('vertexAlpha',+(boundMesh?.hasVertexAlpha || false));
   effect.setFloat('doubleSided',+!input.backFaceCulling); effect.setFloat('unlit',+(input.unlit || input.disableLighting || false));
   effect.setFloat('outputLinear',+scene.imageProcessingConfiguration.applyByPostProcess);
   effect.setFloat('fallbackExposure',settings.grade.exposure); effect.setFloat('fallbackContrast',settings.grade.contrast);
   const fog = scene.fogEnabled && input.fogEnabled !== false && boundMesh?.applyFog !== false;
   effect.setFloat4('inkFog',fog ? scene.fogMode : 0,scene.fogStart,scene.fogEnd,scene.fogDensity);
   effect.setColor3('inkFogColor',scene.fogColor.toLinearSpace());
   for (const [name,texture] of Object.entries(textures(input))) if (texture) {
    effect.setTexture(`${name}Sampler`,texture); effect.setMatrix(`${name}Matrix`,texture.getTextureMatrix?.() || identity);
    effect.setFloat(`${name}UV`,texture.coordinatesIndex || 0); effect.setFloat(`${name}Level`,texture.level ?? 1);
    if (name === 'opacity') effect.setFloat('opacityRGB',+!!texture.getAlphaFromRGB);
    else effect.setFloat(`${name}Gamma`,+!!texture.gammaSpace);
   }
  });
  convertedCount++; counts.materialsConverted = convertedCount;
  return mat;
 }

 function convertMesh(mesh) {
  if (!mesh || mesh.isDisposed() || mesh.metadata?.celShading === false || mesh.metadata?.template || effectMesh(mesh) || mesh.infiniteDistance) return mesh;
  if (!mesh.getTotalVertices?.() || !mesh.isVerticesDataPresent(B.VertexBuffer.NormalKind)) return mesh;
  // InstancedMesh.material delegates to sourceMesh. Do not de-instance foliage.
  const target = mesh.sourceMesh || mesh;
  if (target.material?.disableLighting || target.material?.metadata?.celShading === false) return mesh;
  const before = target.material, after = convertMaterial(before,target);
  if (before !== after) { if (!assigned.has(target)) assigned.set(target,before); target.material = after; }
  if (sourceFor.has(after) && !outlined.has(target)) outlined.set(target,{renderOutline:target.renderOutline,color:target.outlineColor,width:target.outlineWidth});
  return mesh;
 }

 function updateOutlines() {
  const camera = scene.activeCamera || view.camera;
  if (!camera) return;
  const o = settings.outlines, position = camera.globalPosition || camera.position, candidates = [];
  for (const [mesh] of outlined) {
   if (mesh.isDisposed()) { outlined.delete(mesh); assigned.delete(mesh); continue; }
   mesh.renderOutline = false;
   // Cutout cards, glass and instances are excluded: an expanded card would
   // outline its rectangle, while an instanced source has many distant owners.
   if (!o.enabled || !mesh.isEnabled() || !mesh.isVisible || mesh.visibility < 1 || mesh.instances?.length || mesh.hasThinInstances) continue;
   const mat = mesh.material;
   if (!mat || mat instanceof B.MultiMaterial || mat.needAlphaTesting() || mat.needAlphaBlending() || !mat.backFaceCulling) continue;
   mesh.computeWorldMatrix();
   const distance = B.Vector3.Distance(position,mesh.getBoundingInfo().boundingSphere.centerWorld);
   if (distance >= o.cutoff) continue;
   const triangles = mesh.getTotalIndices()/3;
   candidates.push({mesh,distance,triangles});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  let triangles = 0, meshes = 0;
  // Core's expanded-hull outline renderer reuses immutable vertex/index buffers.
  // Chosen over a depth/normal postprocess: no full-scene 4.48M-triangle prepass,
  // normal target, or extra screen-sized buffers. Core can draw the hull twice,
  // so cap selected SOURCE triangles (not draw cost), in addition to distance.
  // Low quality may omit dense parts; it never simplifies any geometry.
  for (const item of candidates) {
   if (triangles + item.triangles > o.triangleBudget) continue;
   const mesh = item.mesh, m = mesh.getWorldMatrix().m;
   const scale = Math.max(.0001,Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10]));
   const pixelsToWorld = 2*Math.tan(camera.fov/2)*Math.max(1,item.distance)/scene.getEngine().getRenderHeight();
   const fade = clamp((o.cutoff-item.distance)/(o.cutoff*.2),0,1);
   mesh.outlineWidth = Math.min(o.maxWidth,pixelsToWorld*o.pixels)*fade/scale;
   mesh.outlineColor = outlineColor; mesh.renderOutline = true;
   triangles += item.triangles; meshes++;
  }
  counts.outlinedMeshes = meshes; counts.outlinedTriangles = triangles;
 }
 const observer = scene.onBeforeRenderObservable.add(updateOutlines);
 const api = {
  convertMaterial, convertMesh,
  refresh() { if (!disposed) for (const mesh of [...scene.meshes]) convertMesh(mesh); return api; },
  setOptions(next) { settings = mergeOptions(settings,next); configure(); return api; },
  registerPalette(name,value) { registerCelPalette(name,value); return api; },
  get options() { return mergeOptions(settings,{}); },
  dispose() {
   if (disposed) return; disposed = true;
   scene.onBeforeRenderObservable.remove(observer);
   for (const [mesh,source] of assigned) if (!mesh.isDisposed()) mesh.material = source;
   for (const [mesh,old] of outlined) if (!mesh.isDisposed()) { mesh.renderOutline=old.renderOutline; mesh.outlineColor=old.color; mesh.outlineWidth=old.width; }
   // Textures belong to the source materials, never to this rendering layer.
   for (const material of created) material.dispose(false,false);
   assigned.clear(); outlined.clear(); created.clear(); controllers.delete(scene);
  }
 };
 controllers.set(scene,api); configure(); api.refresh();
 scene.onDisposeObservable.addOnce(()=>api.dispose());
 return api;
}
