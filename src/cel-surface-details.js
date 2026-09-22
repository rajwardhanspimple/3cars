// Surface-only repairs. No mesh creation, vertex writes, parenting or lights.
// Installed after world readiness. New fleet shaders are picked up before their
// first draw, after render interpolation has posed the car roots.
import { refineCarMaterial } from './car-cel-materials.js';
const B=globalThis.BABYLON;
const installed=new WeakMap();
export const SURFACE_STYLE=Object.freeze({paintShadow:.32,paintLight:.68,paintRim:.06,
 contactStrength:.68,contactWidth:1.05,contactLength:2.5,inkFaceFraction:.12});
export const FACADE_COLORS=Object.freeze(['#3a497b','#513a73','#285b70','#613b67']);
export const WINDOW_COLORS=Object.freeze(['#ffd39a','#87dcff','#b3a3ff','#ffafd7']);
export const DISABLED_ROAD_OVERLAYS=Object.freeze(['city-wet-reflection-film','city-warm-road-pools']);
const CONTACT_DECLARATION=`
uniform vec4 contact0, contact1, contact2;
uniform vec3 contactYaw;
uniform float contactReceiver;
float carContact(vec4 car, float yaw) {
 vec2 delta=vPosition.xz-car.xz;
 float c=cos(yaw), s=sin(yaw);
 vec2 local=vec2(c*delta.x-s*delta.y,s*delta.x+c*delta.y);
 float radius=length(local/vec2(1.05,2.5));
 float footprint=1.0-smoothstep(.76,1.0,radius);
 float heightGate=1.0-smoothstep(.18,.5,abs(vPosition.y-car.y));
 return footprint*heightGate*car.w;
}
`;
const CONTACT_FRAGMENT=`
 // Cheap contact shadow, evaluated on the existing receiver surface. No quad,
 // no road z-fighting, no added pass, and no shadow projected onto car roofs.
 float contact=max(carContact(contact0,contactYaw.x),max(carContact(contact1,contactYaw.y),carContact(contact2,contactYaw.z)));
 result *= 1.0-.68*contact*contactReceiver*step(.4,N.y);
`;
function replaceOnce(source,oldText,newText) {
 if (!source.includes(oldText)) throw new Error('Cel surface shader contract changed: '+oldText.slice(0,64));
 return source.replace(oldText,newText);
}
export function paintBandColor(color,band,rim=0) {
 // CPU reference of the hue-preserving shader path, used by headless tests.
 return color.scale(SURFACE_STYLE.paintShadow+SURFACE_STYLE.paintLight*band+SURFACE_STYLE.paintRim*rim);
}
export function windowPixels(variant) {
 const data=new Uint8Array(128*128*4);
 for(let y=0;y<128;y++) for(let x=0;x<128;x++) {
  const column=Math.floor(x/16),row=Math.floor(y/8),hash=(column*17+row*31+variant*13)%11;
  const on=hash>3&&x%16>=4&&x%16<12&&y%8>=2&&y%8<6;
  const color=B.Color3.FromHexString(WINDOW_COLORS[(column+row*3+variant)%WINDOW_COLORS.length]);
  const brightness=.62+((row+column)%3)*.12,k=(y*128+x)*4;
  data[k]=on?Math.round(color.r*255*brightness):0;
  data[k+1]=on?Math.round(color.g*255*brightness):0;
  data[k+2]=on?Math.round(color.b*255*brightness):0;data[k+3]=255;
 }
 return data;
}
function receiver(mesh) {
 if(!mesh||mesh.metadata?.mustang||/^car-\d+-/.test(mesh.name)) return false;
 return mesh.metadata?.role==='surface'||/asphalt|terrain|curb|road|ground|edge-paint|center-/i.test(mesh.name);
}
export function installCelSurfaceDetails(view) {
 const scene=view.scene;
 if(installed.has(scene)) {installed.get(scene).refresh();return installed.get(scene);}
 const patched=new Map(),hidden=new Map(),updatedTextures=new Set();
 const contacts=Array.from({length:3},()=>new B.Vector4(0,0,0,0)),yaw=new B.Vector3();
 const metadata={paintLighting:'hue-preserving-three-band',contactShadowTechnique:'analytic-road-footprint',
  contactShadowCount:0,contactCenters:[],disabledRoadOverlays:[],facadeColors:[...FACADE_COLORS],windowColors:[...WINDOW_COLORS],
  railInkMaxFaceFraction:SURFACE_STYLE.inkFaceFraction};
 scene.metadata={...scene.metadata,celSurfaceDetails:metadata};
 let disposed=false;
 function patch(mat) {
  if(patched.has(mat)||!mat.metadata?.celShading||!(mat instanceof B.ShaderMaterial)) return;
  const path=mat.shaderPath;
  if(!path?.fragmentSource) return;
  const paint=/(^|-)CARPAINT$/.test(mat.name);
  let fragment=path.fragmentSource;
  fragment=replaceOnce(fragment,'void main(void) {',CONTACT_DECLARATION+'\nvoid main(void) {');
  fragment=replaceOnce(fragment,' float fog = 1.0;',CONTACT_FRAGMENT+'\n float fog = 1.0;');
  // The old .12m world-space cap could consume a .22m rail face. Cap ink to
  // 12% of the thinner IN-PLANE face dimension (not the face-normal axis).
  fragment=replaceOnce(fragment,
   ' float fade = clamp((inkCutoff-vFogDistance)/(inkCutoff*.2),0.0,1.0);',
   ` vec3 faceSize=(inkBoxMax-inkBoxMin)*vAxisScale+abs(vLocalNormal)*10000.0;
 width=min(width,.12*min(faceSize.x,min(faceSize.y,faceSize.z)));
 float fade = clamp((inkCutoff-vFogDistance)/(inkCutoff*.2),0.0,1.0);`);
  if(paint) {
   // The model selector writes linear albedoColor explicitly. It is NOT a
   // texture-only paint asset. Preserve that chosen hue, without a blue fill
   // multiplying it or an additive cyan rim overwhelming its dark side.
   fragment=replaceOnce(fragment,'vec3 base = baseColor*mix(vec3(1.0),tint,textureStrength);','vec3 base = baseColor;');
   fragment=replaceOnce(fragment,'base *= vColor.rgb;','// Selected paint is authoritative; vertex colour must not mute its hue.');
   fragment=replaceOnce(fragment,
    'vec3 shaded = base*(ambient*mix(shadowColor*shadowStrength,vec3(1.0),lit)+sunColor*sunStrength*diffuse);',
    'vec3 shaded = base*(.32+.68*diffuse);');
   fragment=replaceOnce(fragment,
    'shaded += rimColor*rim*min(1.0,length(skyColor)+length(sunColor));',
    'shaded += base*.06*step(.55,fresnel);');
   fragment=replaceOnce(fragment,'shaded += sunColor*highlight*specularStrength;','shaded += base*highlight*.08;');
   mat.metadata.celPaintHuePreserved=true;
  }
  const carResponse=refineCarMaterial(mat,fragment);
  fragment=carResponse.fragment;
  mat.shaderPath={...path,fragmentSource:fragment};
  for(const uniform of ['contact0','contact1','contact2','contactYaw','contactReceiver']) {
   if(!mat.options.uniforms.includes(uniform)) mat.options.uniforms.push(uniform);
  }
  const observer=mat.onBindObservable.add(mesh=>{
   const effect=mat.getEffect();if(!effect) return;
   // Runs after the converter's live-source binding. Never use a stale copy of
   // paint colour; race resets replace albedoColor, brake lights mutate in place.
   if(paint&&mat.albedoColor) effect.setColor3('baseColor',mat.albedoColor);
   carResponse.bind?.(effect);
   contacts.forEach((contact,i)=>effect.setFloat4('contact'+i,contact.x,contact.y,contact.z,contact.w));
   effect.setVector3('contactYaw',yaw);effect.setFloat('contactReceiver',+receiver(mesh));
  });
  patched.set(mat,{path,observer});
 }
 function refineCity() {
  // These are the verified broad-gradient producers: a full-road additive
  // reflection film and broad radial streetlight pools. Hide only those draws;
  // retain their geometry/texture references and weather/scroll bookkeeping.
  for(const name of DISABLED_ROAD_OVERLAYS) {
   const mesh=scene.getMeshByName(name);
   if(mesh) {if(!hidden.has(mesh)) hidden.set(mesh,mesh.isVisible);mesh.isVisible=false;}
  }
  metadata.disabledRoadOverlays=[...hidden.keys()].map(mesh=>mesh.name);
  for(let i=0;i<4;i++) {
   const texture=scene.textures.find(t=>t.name===`city-window-grid-${i}`);
   if(texture&&!updatedTextures.has(texture)) {
    texture.update(windowPixels(i));texture.updateSamplingMode(B.Texture.NEAREST_SAMPLINGMODE);
    texture.metadata={...texture.metadata,celWindowColors:[...WINDOW_COLORS],celWindowGaps:true};updatedTextures.add(texture);
   }
  }
  // City material names and shared instance pools stay unchanged. The selected
  // world palette already provides four facade tints and 18-75m building heights.
 }
 function refresh() {
  if(disposed) return;
  refineCity();
  for(const mat of [...scene.materials]) patch(mat);
  metadata.contactCenters=[];
  for(let i=0;i<3;i++) {
   const rig=view.carNodes?.[i],root=rig?.root;
   const active=!!root&&!root.isDisposed()&&root.isEnabled();
   if(active) {
    const p=root.position;contacts[i].set(p.x,p.y,p.z,1);
    yaw[['x','y','z'][i]]=root.rotation.y;
    metadata.contactCenters.push({car:root.name,x:p.x,y:p.y,z:p.z,yaw:root.rotation.y});
   } else {contacts[i].set(0,0,0,0);yaw[['x','y','z'][i]]=0;}
  }
  metadata.contactShadowCount=metadata.contactCenters.length;
 }
 const observer=scene.onBeforeRenderObservable.add(refresh);
 const api={refresh,dispose(){
  if(disposed) return;disposed=true;scene.onBeforeRenderObservable.remove(observer);
  for(const [mat,state] of patched) {mat.onBindObservable.remove(state.observer);mat.shaderPath=state.path;}
  for(const [mesh,visible] of hidden) if(!mesh.isDisposed()) mesh.isVisible=visible;
  patched.clear();hidden.clear();updatedTextures.clear();installed.delete(scene);
 }};
 installed.set(scene,api);refresh();scene.onDisposeObservable.addOnce(()=>api.dispose());return api;
}
