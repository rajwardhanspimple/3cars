// District facade-only mapping repair. Reuse existing CEL_BOX_INK varyings:
// local position/normal and the lengths of the instance's finalWorld axes.
// No geometry, instance attributes, textures, observers or extra draws added.
export const FACADE_MAPPING = Object.freeze({
 cellMetres: 3.2, cellsPerAtlas: 16, atlasMetres: 51.2,
 windowMetres: 1.6, mortarMetres: .4, ladderBayMetres: 12,
 ladderWidthMetres: .8, rungMetres: .32
});

// CPU reference matching facadeMetres() below. axisScale is the length of each
// finalWorld basis vector, including parent scale; normal remains object-local.
export function facadeCoordinates(position, normal, axisScale, min = [-.5,-.5,-.5]) {
 const p = position.map((n,i) => (n-min[i])*axisScale[i]);
 if (Math.abs(normal[0]) > .5) return [p[2],p[1]];
 if (Math.abs(normal[2]) > .5) return [p[0],p[1]];
 return [p[0],p[2]];
}
export function facadeAtlasUV(position, normal, axisScale, min) {
 return facadeCoordinates(position,normal,axisScale,min).map(n=>n/FACADE_MAPPING.atlasMetres);
}
const DECLARATION = `
// Face coordinates in metres, independent of default box UV orientation.
// Select with LOCAL normals: rotating a tower must not change its facade axes.
vec2 facadeMetres() {
 vec3 p=(vLocalPosition-inkBoxMin)*vAxisScale;
 if(abs(vLocalNormal.x)>.5) return p.zy;
 if(abs(vLocalNormal.z)>.5) return p.xy;
 return p.xz;
}
vec2 facadeAtlasUV() {
 // 128-square atlas: 16 cells, each 3.2m, with a 1.6m lit window.
 return facadeMetres()/51.2;
}
`;
const OLD_DETAIL = ` float mortar=step(.93,fract(vUV1.y*32.0));
 float ladder=step(.87,vUV1.x)*step(vUV1.x,.94)*step(.7,fract(vUV1.y*48.0));`;
const METRIC_DETAIL = ` vec2 detailMetres=facadeMetres();
 float facadeWall=1.0-step(.5,abs(vLocalNormal.y));
 float mortar=step(.93,fract(detailMetres.y/.4))*facadeWall;
 // One 0.8m ladder bay per 12m; rung spacing does not grow with tower height.
 float ladderX=mod(detailMetres.x,12.0);
 float ladder=step(10.4,ladderX)*step(ladderX,11.2)*step(.7,fract(detailMetres.y/.32))*facadeWall;`;
const OLD_SAMPLE = 'texture2D(emissiveSampler,mappedUV(emissiveMatrix,emissiveUV))';
function replaceRequired(source, oldText, newText) {
 if (!source.includes(oldText)) throw new Error('District facade mapping contract changed: '+oldText.slice(0,80));
 return source.replace(oldText,newText);
}
export function installFacadeMapping(scene) {
 const B=globalThis.BABYLON;
 // Restrict to the four district source materials, not all cel or emissive
// materials. Road UVs, sign masks, cars and alpha-cutout foliage stay untouched.
 const candidates=scene.materials.filter(mat=>/^city-building-[0-3]$/.test(mat.name)&&mat.metadata?.districtTint&&mat.metadata?.celBoxInk);
 if(candidates.length!==4) throw new Error('Expected four district facade shader variants');
 // Validate every variant before changing any of them.
 const changes=[];
 for(const mat of candidates) {
  if(mat.metadata.facadeMapping==='instance-face-metres') continue;
  const path=mat.shaderPath,texture=mat.emissiveTexture;
  if(!path?.fragmentSource||!texture||!path.vertexSource.includes('vAxisScale = vec3(length(a),length(b),length(c));')) throw new Error('Missing instance-scaled facade shader inputs');
  let fragment=replaceRequired(path.fragmentSource,'void main(void) {',DECLARATION+'\nvoid main(void) {');
  fragment=replaceRequired(fragment,OLD_SAMPLE,'texture2D(emissiveSampler,facadeAtlasUV())');
  fragment=replaceRequired(fragment,OLD_DETAIL,METRIC_DETAIL);
  changes.push({mat,path,fragment,texture});
 }
 for(const {mat,path,fragment,texture} of changes) {
  // Shared uScale/vScale cannot encode differently sized instances. Sampling
  // now deliberately bypasses emissiveMatrix only for these facade atlases.
  texture.wrapU=texture.wrapV=B.Texture.WRAP_ADDRESSMODE;
  mat.shaderPath={...path,fragmentSource:fragment};
  mat.metadata={...mat.metadata,facadeMapping:'instance-face-metres',facadeCellMetres:3.2,facadeAtlasMetres:51.2};
 }
 if(scene.metadata?.scenery) scene.metadata.scenery.facadeMapping={...FACADE_MAPPING,technique:'instance-face-metres',variants:candidates.length};
 return candidates;
}
