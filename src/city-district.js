// Procedural scenery extension. Race physics and all Mustang resources are read-only.
// Called within selected-world readiness, before the final night material pass.
import { BARRIER } from './sim.js';
import { roadHeight } from './mountain-layout.js';
const B = globalThis.BABYLON;
const rgb = hex => B.Color3.FromHexString(hex);
const installed = new WeakSet();
export const DISTRICT_BUDGET = Object.freeze({
 buildings: 750, instances: 16000, instanceSources: 32, drawCalls: 80,
 textureBytes: 2 * 1024 * 1024, geometryBytes: 32 * 1024 * 1024,
 instanceBufferBytes: 8 * 1024 * 1024, estimatedResidentBytes: 64 * 1024 * 1024,
 renderedTriangles: 750000
});
export const DISTRICT_ARCHETYPES = Object.freeze([
 'courtyard-l', 'stepped-office', 'twin-wing', 'terraced-apartment', 'slender-spire', 'corner-shop'
]);
const hash = (x, z, seed = 0) => {
 let n = Math.imul(x + 113, 374761393) ^ Math.imul(z + 71, 668265263) ^ seed;
 n = Math.imul(n ^ (n >>> 13), 1274126177);
 return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const mod = (n, d) => ((n % d) + d) % d;
const lineDistance = (n, spacing) => Math.min(mod(n, spacing), spacing - mod(n, spacing));
function classify(mesh, role, extra = {}) {
 mesh.isPickable = false;
 mesh.metadata = { ...mesh.metadata, cityWorld: true, district: true, role, ...extra };
 return mesh;
}
function texture(scene, counts, name, size, pixel) {
 const pixels = new Uint8Array(size * size * 4);
 for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) pixels.set(pixel(x, y), (y * size + x) * 4);
 const tex = B.RawTexture.CreateRGBATexture(pixels, size, size, scene, false, false, B.Texture.NEAREST_SAMPLINGMODE);
 tex.name = name; tex.wrapU = tex.wrapV = B.Texture.WRAP_ADDRESSMODE;
 counts.proceduralTextures++; counts.proceduralTextureBytes += pixels.byteLength;
 return tex;
}
function material(scene, name, color, emission = 0) {
 const mat = new B.StandardMaterial(name, scene);
 mat.diffuseColor = rgb(color); mat.specularColor = B.Color3.Black();
 mat.emissiveColor = rgb(color).scale(emission);
 return mat;
}
// One merged mesh per surface material, not a mesh per tile/marking.
function batch(scene, name, tiles, mat, cx, cz, repeat) {
 const p = [], uv = [], indices = [], normals = [];
 for (const tile of tiles) {
  const n = p.length / 3, { x, z, size, heights: h } = tile;
  p.push(x,h[0],z, x+size,h[1],z, x,h[2],z+size, x+size,h[3],z+size);
  uv.push((x-cx)/repeat,(z-cz)/repeat,(x+size-cx)/repeat,(z-cz)/repeat,
   (x-cx)/repeat,(z+size-cz)/repeat,(x+size-cx)/repeat,(z+size-cz)/repeat);
  indices.push(n,n+2,n+1,n+1,n+2,n+3);
 }
 B.VertexData.ComputeNormals(p, indices, normals);
 // Match the existing world's actual upward-facing winding.
 if (normals.filter((_, i) => i % 3 === 1).reduce((a,b)=>a+b,0) < 0) {
  for (let i=0;i<indices.length;i+=3) [indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  B.VertexData.ComputeNormals(p, indices, normals);
 }
 const mesh = new B.Mesh(name, scene), data = new B.VertexData();
 data.positions=p; data.indices=indices; data.normals=normals; data.uvs=uv;
 data.applyToMesh(mesh); mesh.material=mat; classify(mesh,'surface'); mesh.freezeWorldMatrix();
 return mesh;
}
function interpolate(tile, x, z) {
 const u=(x-tile.x)/tile.size,v=(z-tile.z)/tile.size,[a,b,c,d]=tile.heights;
 return u+v<=1 ? a*(1-u-v)+b*u+c*v : b*(1-v)+c*(1-u)+d*(u+v-1);
}
function surfaces(view, counts) {
 const {scene}=view, {centerX:cx,centerZ:cz}=view.race.track.bounds;
 const oldSampler=view.sceneryGroundHeight, street=[], sidewalk=[], skirt=[], lookup=new Map();
 const road=material(scene,'city-asphalt','#35436a');
 road.metadata={celPaletteKey:'district-road'};
 road.diffuseTexture=texture(scene,counts,'city-district-road-art',256,(x,y)=>{
  const u=x/256*80,v=y/256*80,dx=lineDistance(u,80),dz=lineDistance(v,80);
  const cross=(dx<6&&dz>10&&dz<16&&Math.floor(dz*1.6)%2===0)||(dz<6&&dx>10&&dx<16&&Math.floor(dx*1.6)%2===0);
  const dash=(dx<.22&&dz>18&&Math.floor(v/4)%2===0)||(dz<.22&&dx>18&&Math.floor(u/4)%2===0);
  const cover=Math.abs(Math.hypot(u-3,v-24)-.65)<.22;
  if(cross) return [164,181,207,255];
  if(dash) return [207,156,80,255];
  if(cover) return [91,104,131,255];
  // Graphic seams/wear and narrow, low-contrast wet streaks. No luminous overlay.
  const seam=x%41===0||y%53===0, smear=(x%17<2&&y%31<18)||(y%23<2&&x%37<15);
  const k=seam?-.08:smear?.06:hash(x,y,43)*.025;
  return [48+k*255,64+k*255,96+k*255,255];
 });
 const pavement=material(scene,'city-curb','#626981');
 pavement.metadata={celPaletteKey:'district-pavement'};
 pavement.diffuseTexture=texture(scene,counts,'city-district-paving-art',128,(x,y)=>{
  const joint=x%16===0||y%16===0,n=joint?52:136+Math.floor(hash(x,y,9)*12);
  return [n,n,n+10,255];
 });
 const makeTile=(x,z,size,fn)=>({x,z,size,heights:[fn(x,z),fn(x+size,z),fn(x,z+size),fn(x+size,z+size)]});
 // Four-metre cells conservatively excluded from the entire physical shoulder.
 for(let iz=-100;iz<100;iz++) for(let ix=-100;ix<100;ix++) {
  const x=cx+ix*4,z=cz+iz*4;
  const dx=lineDistance((ix+.5)*4,80),dz=lineDistance((iz+.5)*4,80),d=Math.min(dx,dz);
  if(d>10||view.race.track.project(x+2,z+2).distance-Math.SQRT2*2<BARRIER+5) continue;
  const paved=d>6;
  const tile=makeTile(x,z,4,(a,b)=>Math.max(roadHeight(a,b),oldSampler(a,b))+(paved?.16:.025));
  (paved?sidewalk:street).push(tile); lookup.set(`${ix},${iz}`,tile);
 }
 batch(scene,'city-district-streets',street,road,cx,cz,80);
 batch(scene,'city-district-sidewalks',sidewalk,pavement,cx,cz,8);
 // Beyond the original 1040 m ground, a buried skirt fades under the skyline.
 // Its inner overlap stays below the original grid, with no raised edge.
 for(let iz=-32;iz<32;iz++) for(let ix=-32;ix<32;ix++) {
  if(Math.abs((ix+.5)*32)<496&&Math.abs((iz+.5)*32)<496) continue;
  skirt.push(makeTile(cx+ix*32,cz+iz*32,32,(x,z)=>roadHeight(x,z)-1));
 }
 batch(scene,'city-district-horizon-ground',skirt,material(scene,'city-ground','#252b50'),cx,cz,32);
 const skirtMap=new Map(skirt.map(t=>[`${Math.round((t.x-cx)/32)},${Math.round((t.z-cz)/32)}`,t]));
 view.sceneryGroundHeight=(x,z)=>{
  const tile=lookup.get(`${Math.floor((x-cx)/4)},${Math.floor((z-cz)/4)}`);
  if(tile) return interpolate(tile,x,z);
  if(Math.abs(x-cx)<=520&&Math.abs(z-cz)<=520) return oldSampler(x,z);
  const outer=skirtMap.get(`${Math.floor((x-cx)/32)},${Math.floor((z-cz)/32)}`);
  return outer?interpolate(outer,x,z):oldSampler(x,z);
 };
 Object.assign(counts,{districtStreetTiles:street.length,districtSidewalkTiles:sidewalk.length,
  districtStreetAxes:22,districtStreetSpacing:80,districtHalfExtent:400,skylineHalfExtent:1024,
  groundHeightSampler:'city-grid-plus-triangle-district-tiles',districtCrossings:'presentational-behind-continuous-race-guardrails'});
}
export function expandCityDistrict(view) {
 const {scene}=view, counts=scene.metadata.scenery;
 if(installed.has(scene)) throw new Error('City district already installed');
 if(scene.isDisposed) throw new Error('City district loaded after scene disposal');
 installed.add(scene);
 const high=view.quality==='high',track=view.race.track,{centerX:cx,centerZ:cz}=track.bounds;
 // Replace only corridor building roots. Keep every shared collision prop, rail,
 // wall, lamp, approved shader and procedural resource from the existing builder.
 for(const root of [...scene.transformNodes]) if(root.name.startsWith('city-building-root-')) root.dispose();
 counts.buildings=0;counts.litWindows=0;counts.neonPanels=0;counts.neonStrips=0;counts.largeSigns=0;
 Object.assign(counts,{districtBuildings:0,farTowers:0,buildingArchetypes:DISTRICT_ARCHETYPES.length,
  archetypeCounts:Array(6).fill(0),skylineRings:3,skylineRingCounts:[0,0,0],
  rooftopStructures:0,storefronts:0,districtStreetlights:0,streetFurniture:{},
  districtQuality:high?'high':'balanced',districtFreeDriving:false});
 surfaces(view,counts);
 const sources=new Map();
 for(const mesh of scene.meshes) if(mesh.metadata?.template) sources.set(mesh.name.replace('city-template-',''),mesh);
 for(let i=0;i<4;i++) {
  const source=sources.get(`building-${i}`);
  if(!source) throw new Error('Missing city facade instance source');
  source.registerInstancedBuffer('districtTint',4);
  source.instancedBuffers.districtTint=new B.Color4(1,1,1,1);
 }
 function source(key,color,shape='box',emission=0) {
  const mesh=shape==='cylinder'?B.MeshBuilder.CreateCylinder(`city-template-${key}`,{height:1,diameter:1,tessellation:12},scene)
   :B.MeshBuilder.CreateBox(`city-template-${key}`,{size:1},scene);
  mesh.material=material(scene,`city-${key}`,color,emission);mesh.isVisible=false;
  classify(mesh,'template',{template:true});sources.set(key,mesh);
 }
 source('district-metal','#36445d');source('district-glass','#3d8caf','box',.12);
 source('district-leaf','#29656a');source('district-red','#923e72');source('district-tank','#465069','cylinder');
 let serial=0;
 function part(key,size,pos,yaw=0,kind='building-detail',parent=null,tint=null) {
  const src=sources.get(key);if(!src) throw new Error(`Missing district source ${key}`);
  const mesh=src.createInstance(`city-district-${kind}-${serial++}`);
  mesh.isVisible=true;mesh.scaling.set(...size);mesh.position.set(...pos);mesh.rotation.y=yaw;mesh.parent=parent;
  classify(mesh,'solid',{kind});
  if(key.startsWith('building-')) mesh.instancedBuffers.districtTint=tint||new B.Color4(1,1,1,1);
  mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();return mesh;
 }
 function root(name,x,z,yaw=0) {
  const node=new B.TransformNode(name,scene);
  node.position.set(x,Math.max(roadHeight(x,z),view.sceneryGroundHeight(x,z))-.25,z);node.rotation.y=yaw;
  node.computeWorldMatrix(true);return node;
 }
 function building(x,z,w,d,h,type,variant,seed,far=false,ring=0) {
  // 3 m extra radius encloses awnings, cornices, tanks and antennas too.
  const radius=Math.hypot(w,d)/2+3;
  if(track.project(x,z).distance-radius<BARRIER+3) return false;
  const node=root(`city-district-building-root-${seed}`,x,z,far?hash(seed,2)*Math.PI:0);
  const tint=new B.Color4(.76+hash(seed,1)*.24,.76+hash(seed,2)*.24,.76+hash(seed,3)*.24,1);
  node.metadata={cityWorld:true,district:true,kind:'building-root',footprintRadius:radius,archetype:type,far,ring};
  const body=(size,pos)=>part(`building-${variant}`,size,pos,0,'building',node,tint);
  if(far) body([w,h,d],[0,h/2,0]);
  else {
   // Distinct repeatable assemblies, all sharing four facade box geometries.
   if(type===0) {body([w*.46,h,d],[-w*.27,h/2,0]);body([w*.54,h*.72,d*.46],[w*.23,h*.36,-d*.27]);}
   if(type===1) {body([w,h*.62,d],[0,h*.31,0]);body([w*.68,h*.38,d*.7],[0,h*.81,0]);}
   if(type===2) {body([w*.43,h,d],[-w*.285,h/2,0]);body([w*.43,h*.86,d],[w*.285,h*.43,0]);body([w*.14,h*.45,d*.6],[0,h*.225,0]);}
   if(type===3) {body([w,h*.5,d],[0,h*.25,0]);body([w*.82,h*.3,d*.76],[0,h*.65,0]);body([w*.62,h*.2,d*.5],[0,h*.9,0]);}
   if(type===4) {body([w,h*.2,d],[0,h*.1,0]);body([w*.62,h*.8,d*.62],[0,h*.6,0]);}
   if(type===5) {body([w,h*.65,d*.62],[0,h*.325,-d*.19]);body([w*.68,h,d*.38],[-w*.16,h/2,d*.31]);}
   // A continuous shop plinth, doors and awning give every archetype a readable base.
   part('district-metal',[w,3,d],[0,1.5,0],0,'shop-plinth',node);
   part('district-glass',[w*.7,1.8,.12],[-w*.08,1.55,-d/2-.08],0,'storefront',node);
   part('dark',[1.3,2.3,.14],[w*.36,1.15,-d/2-.1],0,'shop-door',node);
   part(seed%2?'district-red':'district-metal',[w+.5,.25,1.5],[0,3.1,-d/2-.5],0,'awning',node);
   counts.storefronts++;
   const neon=seed%3;
   // Keep existing YZ-facing bounded sign shader and its ink/housing fixes.
   part(`sign-${neon}`,[.12,2.8,3],[w/2+.12,4.8,0],0,'neon-panel',node);
   part(`neon-${neon}`,[.1,.12,d*.65],[w/2+.14,3.5,0],0,'neon-strip',node);
   counts.neonPanels++;counts.neonStrips++;
   const roofScale=type===1?.68:type===3?.62:type===4?.62:1;
   const rw=w*roofScale,rd=d*(type===3?.5:roofScale),rx=type===0?-w*.27:type===2?-w*.285:type===5?-w*.16:0;
   const capW=type===0?w*.46:type===2?w*.43:type===5?w*.68:rw;
   const capD=type===5?d*.38:rd,rz=type===5?d*.31:0;
   part('district-metal',[capW+.35,.3,capD+.35],[rx,h+.15,rz],0,'roof-cap',node);
   if(high) {
    for(const side of [-1,1]) {
     part('concrete',[capW,.65,.16],[rx,h+.6,rz+side*(capD/2-.08)],0,'parapet',node);
     part('concrete',[.16,.65,capD],[rx+side*(capW/2-.08),h+.6,rz],0,'parapet',node);
    }
    part('district-metal',[2.2,1.1,1.7],[rx,h+.85,rz],0,'roof-ac',node);
    part('rail',[.1,4,.1],[rx+1,h+2.3,rz+1],0,'roof-antenna',node);
    if(seed%3===0) {
     part('district-metal',[2.5,1,2.5],[rx,h+.8,rz-1],0,'tank-support',node);
     part('district-tank',[2.6,3,2.6],[rx,h+2.7,rz-1],0,'water-tower',node);
    }
    // Real projecting ledges, while fine floor lines/fire escapes stay shader detail.
    for(let level=1;level<=2;level++) part('district-metal',[w+.25,.16,d+.25],[0,h*.18*level,0],0,'ledge',node);
    counts.rooftopStructures+=2+(seed%3===0?1:0);
   } else {
    part('district-metal',[2,1,1.5],[rx,h+.8,rz],0,'roof-ac',node);counts.rooftopStructures++;
   }
   counts.districtBuildings++;counts.archetypeCounts[type]++;
  }
  counts.buildings++;counts.litWindows+=180*6;
  if(far) {counts.farTowers++;counts.skylineRingCounts[ring]++;}
  return true;
 }
 // Ten by ten blocks with four independent lots each. Streets extend on both axes.
 let seed=0;
 for(let bz=-5;bz<5;bz++) for(let bx=-5;bx<5;bx++) for(const oz of [26,54]) for(const ox of [26,54]) {
  const id=seed++,type=id%6,w=16+hash(id,4)*6,d=16+hash(id,5)*6;
  building(cx+bx*80+ox,cz+bz*80+oz,w,d,18+hash(id,6)*54,type,id%4,id);
 }
 for(let ring=0;ring<3;ring++) {
  const n=(high?72:36)+ring*(high?24:12),radius=560+ring*160;
  for(let i=0;i<n;i++) {
   const id=1000+ring*200+i,a=(i+.35*ring)/n*Math.PI*2,r=radius+(hash(i,ring,83)-.5)*48;
   building(cx+Math.cos(a)*r,cz+Math.sin(a)*r,18+hash(i,ring,55)*16,18+hash(i,ring,31)*14,
    45+hash(i,ring,19)*110,4,(i+ring)%4,id,true,ring);
  }
 }
 // A small furniture assembly library. All parts share existing/new pools.
 const kinds=['traffic-light','hydrant','dumpster','planter','bench','bus-stop','parked-car','vendor'];
 for(let bz=-5;bz<=5;bz++) for(let bx=-5;bx<=5;bx++) {
  const id=(bz+5)*11+bx+5,x=cx+bx*80+10,z=cz+bz*80+24;
  if(Math.abs(x-cx)>395||Math.abs(z-cz)>395||track.project(x,z).distance-6<BARRIER+3) continue;
  const kind=kinds[id%kinds.length],node=root(`city-district-furniture-${id}`,x,z),p=(key,size,pos)=>part(key,size,pos,0,kind,node);
  counts.streetFurniture[kind]=(counts.streetFurniture[kind]||0)+1;
  if(kind==='traffic-light') {p('dark',[.18,4.4,.18],[0,2.2,0]);p('dark',[.6,1.5,.5],[0,4.3,0]);p('district-red',[.24,.24,.06],[0,4.7,-.28]);p('district-glass',[.24,.24,.06],[0,3.9,-.28]);}
  if(kind==='hydrant') {p('district-red',[.4,.85,.4],[0,.43,0]);p('rail',[.75,.16,.16],[0,.65,0]);}
  if(kind==='dumpster') {p('district-leaf',[1.5,1.25,2.2],[0,.625,0]);p('dark',[1.6,.15,2.3],[0,1.32,0]);}
  if(kind==='planter') {p('concrete',[1.4,.75,2.5],[0,.38,0]);p('district-leaf',[1.2,.65,2.3],[0,1,0]);}
  if(kind==='bench') {p('district-metal',[.85,.16,2.4],[0,.6,0]);p('district-metal',[.15,.6,2.4],[.4,.9,0]);for(const s of [-1,1])p('dark',[.7,.55,.14],[0,.28,s*.9]);}
  if(kind==='bus-stop') {for(const s of [-1,1])p('dark',[.12,2.8,.12],[.7,1.4,s*1.8]);p('district-glass',[.1,2.4,3.6],[.7,1.4,0]);p('district-metal',[2.4,.2,4],[0,2.9,0]);p('district-metal',[.7,.15,2.8],[.3,.6,0]);}
  if(kind==='parked-car') {p('district-red',[1.8,.75,4],[0,.65,0]);p('district-glass',[1.5,.65,2.1],[0,1.3,-.1]);for(const a of [-1,1])for(const b of [-1,1])p('dark',[.22,.6,.6],[a*.9,.35,b*1.25]);}
  if(kind==='vendor') {p('district-metal',[1.6,1,2.4],[0,.6,0]);p('district-red',[2.3,.25,3],[0,2.3,0]);for(const s of [-1,1])p('dark',[.1,2.2,.1],[.7,1.1,s]);p('district-glass',[.8,.2,1.2],[0,1.2,0]);}
  // Visible emitter drives the already-approved eight-nearest-lamps ground pass.
  const lamp=root(`city-district-lamp-root-${id}`,x,cz+bz*80-24);
  if(track.project(lamp.position.x,lamp.position.z).distance-3>BARRIER+3&&Math.abs(lamp.position.z-cz)<395) {
   part('dark',[.18,7.5,.18],[0,3.75,0],0,'streetlight',lamp);
   part('dark',[2.5,.15,.18],[-1.15,7.4,0],0,'streetlight',lamp);
   const emitter=part('warm',[1,.09,.42],[-2.2,7.32,0],0,'streetlight',lamp);
   emitter.name=`city-lamp-emitter-district-${id}`;counts.districtStreetlights++;
  } else lamp.dispose();
 }
 const sky=scene.getMeshByName('city-night-sky');if(sky) sky.scaling.setAll(2);
 counts.streetlights+=counts.districtStreetlights;counts.lightPools+=counts.districtStreetlights;
 counts.facadeTintTechnique='hardware-instance-vec4';counts.districtReady=false;
 return {finish(){
  if(scene.isDisposed) throw new Error('City district finished after scene disposal');
  finishFacades(scene);
  auditCityDistrict(view);
  counts.districtReady=true;
 }};
}
function finishFacades(scene) {
 // Run AFTER the legacy surface refinement, so its one-time four-colour texture
 // update remains intact elsewhere. These denser deterministic windows replace it.
 const hues=['#ffd39a','#87dcff','#b3a3ff','#ffafd7','#a4eed6','#efbd77'];
 for(let variant=0;variant<4;variant++) {
  const tex=scene.textures.find(t=>t.name===`city-window-grid-${variant}`);
  if(!tex) throw new Error('Missing procedural city facade texture');
  const pixels=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++) for(let x=0;x<128;x++) {
   const col=Math.floor(x/8),row=Math.floor(y/8),on=hash(col,row,variant+41)>.24&&x%8>=2&&x%8<6&&y%8>=2&&y%8<6;
   const c=rgb(hues[(col+row*3+variant)%hues.length]),k=(y*128+x)*4;
   pixels[k]=on?c.r*155:0;pixels[k+1]=on?c.g*155:0;pixels[k+2]=on?c.b*155:0;pixels[k+3]=255;
  }
  tex.update(pixels);tex.updateSamplingMode(B.Texture.NEAREST_SAMPLINGMODE);
 }
 for(const mat of scene.materials) {
  if(!/^city-building-[0-3]$/.test(mat.name)||!mat.metadata?.celBoxInk||mat.metadata.districtTint) continue;
  const path=mat.shaderPath;
  if(!path?.vertexSource?.includes('#include<instancesDeclaration>')||!path.fragmentSource.includes('vec3 base = baseColor*mix(vec3(1.0),tint,textureStrength);')) throw new Error('District facade shader contract changed');
  mat.options.attributes.push('districtTint');
  const vertex=path.vertexSource.replace('#include<instancesDeclaration>',
   'attribute vec4 districtTint;\nvarying vec4 vDistrictTint;\n#include<instancesDeclaration>').replace('void main(void) {','void main(void) {\n vDistrictTint=districtTint;');
  let fragment=path.fragmentSource.replace('precision highp float;','precision highp float;\nvarying vec4 vDistrictTint;');
  fragment=fragment.replace('vec3 base = baseColor*mix(vec3(1.0),tint,textureStrength);',
   `vec3 base = baseColor*mix(vec3(1.0),tint,textureStrength)*vDistrictTint.rgb;
 // Painted brick/panel joints and fire-escape ladders. No separate meshes.
 float mortar=step(.93,fract(vUV1.y*32.0));
 float ladder=step(.87,vUV1.x)*step(vUV1.x,.94)*step(.7,fract(vUV1.y*48.0));
 base*=1.0-.20*mortar-.45*ladder;`);
  mat.shaderPath={...path,vertexSource:vertex,fragmentSource:fragment};mat.metadata.districtTint=true;
 }
}
export function auditCityDistrict(view) {
 const counts=view.scene.metadata.scenery;
 const meshes=view.scene.meshes.filter(m=>m.metadata?.cityWorld);
 const templates=meshes.filter(m=>m.metadata?.template);
 const visible=meshes.filter(m=>m.isVisible&&m.isEnabled()&&m.getTotalVertices()>0);
 const instances=meshes.filter(m=>m instanceof B.InstancedMesh);
 const draws=new Set(visible.map(m=>m.sourceMesh||m));
 const geometries=new Set(meshes.map(m=>(m.sourceMesh||m).geometry).filter(Boolean));
 let bytes=0;
 for(const geometry of geometries) {
  for(const kind of geometry.getVerticesDataKinds()) bytes+=(geometry.getVerticesData(kind)?.length||0)*4;
  // Conservative 32-bit indices even when Babylon can use 16-bit indices.
  bytes+=(geometry.getIndices()?.length||0)*4;
 }
 let instanceBytes=0;
 for(const source of templates) {
  const n=source.instances.length+1,capacity=2**Math.ceil(Math.log2(Math.max(32,n)));
  // Capacity-rounded world matrix + tint, double-buffered allowance.
  instanceBytes+=capacity*80*2;
 }
 Object.assign(counts,{instances:instances.length,instanceSources:templates.length,
  estimatedDrawCalls:[...draws].reduce((sum,m)=>sum+Math.max(1,m.subMeshes?.length||0),0),
  geometryBytes:bytes,estimatedInstanceBufferBytes:instanceBytes,
  estimatedResidentBytes:bytes*2+instanceBytes+counts.proceduralTextureBytes,
  estimatedRenderedTriangles:visible.reduce((sum,m)=>sum+m.getTotalIndices()/3,0),
  budget:{...DISTRICT_BUDGET},budgetScope:'city-only; no cars/rain/postprocessing/driver overhead',
  drawCallAssumption:'all city visible; hardware instancing; base pass; same-pass box ink',
  textureStorage:'RGBA8, no mipmaps; base pixel allocation, including retained legacy textures'});
 const checks={buildings:counts.buildings,instances:counts.instances,instanceSources:counts.instanceSources,
  drawCalls:counts.estimatedDrawCalls,textureBytes:counts.proceduralTextureBytes,geometryBytes:counts.geometryBytes,
  instanceBufferBytes:counts.estimatedInstanceBufferBytes,estimatedResidentBytes:counts.estimatedResidentBytes,
  renderedTriangles:counts.estimatedRenderedTriangles};
 for(const [key,value] of Object.entries(checks)) if(!Number.isFinite(value)||value>DISTRICT_BUDGET[key]) throw new Error(`City district budget exceeded: ${key} = ${value}`);
 return counts;
}
