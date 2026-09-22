// Rendering-only material-family responses. Values are linear pre-grade RGB.
// Never mutate source material colours/alpha, textures, mesh data or parenting.
const B=globalThis.BABYLON;
export const CAR_CEL_FAMILIES=Object.freeze({
 glass:Object.freeze({peak:.055,shadow:.38,light:.62,rim:.006,highlight:.012}),
 rubber:Object.freeze({peak:.022,shadow:.45,light:.55,rim:.001,highlight:0}),
 trim:Object.freeze({peak:.028,shadow:.4,light:.6,rim:.003,highlight:.006}),
 metal:Object.freeze({peak:.3,shadow:.3,light:.7,rim:.012,highlight:.065}),
 tail:Object.freeze({peak:.2,shadow:.4,light:.6,rim:.004,highlight:.012}),
 lamp:Object.freeze({peak:.24,shadow:.4,light:.6,rim:.005,highlight:.025}),
 other:Object.freeze({peak:.22,shadow:.35,light:.65,rim:.004,highlight:.018})
});
export function carMaterialFamily(name='') {
 // The loader clones every fleet material with this prefix. Do not recolour
 // world materials named 'glass' or the disabled source template.
 if(!/^car-\d+-/.test(name)) return null;
 const base=name.replace(/^car-\d+-/,'');
 if(base==='CARPAINT') return 'paint';
 if(base==='RedGlass') return 'tail';
 if(['Window_Glass','Front_Glass','GlassTransparent'].includes(base)||/glass/i.test(base)) return 'glass';
 if(/rubber|tire|tyre/i.test(base)) return 'rubber';
 if(/black_metal_paint|black_plastic|carbon|trim|grille/i.test(base)) return 'trim';
 if(/chrome|alumin|alloy|mirror|caliper/i.test(base)) return 'metal';
 if(base==='Light') return 'lamp';
 return 'other';
}
export function carBaseColor(source,family) {
 // Preserve hue and distinct source values below the family ceiling. In
 // particular Rubber_Black .016/.018/.020 is NOT replaced by a common grey.
 const color=source.clone(),style=CAR_CEL_FAMILIES[family];
 if(!style) return color;
 if(family==='tail') {
  color.r=Math.min(.2,Math.max(.08,color.r));
  color.g=Math.min(color.g,color.r*.025);color.b=Math.min(color.b,color.r*.015);
 }
 const peak=Math.max(color.r,color.g,color.b);
 if(peak>style.peak) color.scaleInPlace(style.peak/peak);
 return color;
}
export function carSurfaceColor(source,family,band,rim=0,highlight=0) {
 // Reference for headless numerical tests, before texture/vertex modulation,
 // emission, fog, transparency compositing and image processing.
 const style=CAR_CEL_FAMILIES[family],base=carBaseColor(source,family);
 if(!style) return base;
 const color=base.scale(style.shadow+style.light*band);
 color.r+=style.rim*rim+style.highlight*highlight;
 color.g+=style.rim*rim+style.highlight*highlight;
 color.b+=style.rim*rim+style.highlight*highlight;
 const cap=style.peak+style.rim+style.highlight,peak=Math.max(color.r,color.g,color.b);
 if(peak>cap) color.scaleInPlace(cap/peak);
 return color;
}
function replace(source,oldText,newText) {
 if(!source.includes(oldText)) throw new Error('Car cel shader contract changed: '+oldText.slice(0,64));
 return source.replace(oldText,newText);
}
export function refineCarMaterial(mat,fragment) {
 const family=carMaterialFamily(mat.name);
 if(!family||family==='paint') return {fragment,bind:null};
 const style=CAR_CEL_FAMILIES[family];
 // Restore texture-carried colour. At strength .12, a black texture previously
 // became .88 white before lighting. No photo-posterisation on car materials.
 fragment=replace(fragment,'vec3 base = baseColor*mix(vec3(1.0),tint,textureStrength);',
  'vec3 base = baseColor*clamp(texel.rgb,0.0,1.0);');
 fragment=replace(fragment,
  'vec3 shaded = base*(ambient*mix(shadowColor*shadowStrength,vec3(1.0),lit)+sunColor*sunStrength*diffuse);',
  `vec3 shaded = base*(${style.shadow.toFixed(4)}+${style.light.toFixed(4)}*diffuse);`);
 // Add only tiny bounded neutral highlights, not the shared .22 cyan rim.
 fragment=replace(fragment,'shaded += rimColor*rim*min(1.0,length(skyColor)+length(sunColor));',
  `shaded += vec3(${style.rim.toFixed(4)})*step(.7,fresnel);`);
 fragment=replace(fragment,'shaded += sunColor*highlight*specularStrength;',
  `shaded += vec3(${style.highlight.toFixed(4)})*highlight;
 float carSurfacePeak=max(shaded.r,max(shaded.g,shaded.b));
 shaded*=min(1.0,${(style.peak+style.rim+style.highlight).toFixed(4)}/max(.0001,carSurfacePeak));`);
 // Emission code is deliberately untouched: RedGlass braking stays live and
 // independent per car. Alpha, opacity samplers and alpha test stay untouched.
 mat.metadata={...mat.metadata,celCarFamily:family,celCarSurfacePeak:style.peak+style.rim+style.highlight};
 const boundColor=new B.Color3();
 return {fragment,bind(effect){
  const source=mat.albedoColor||mat.diffuseColor||B.Color3.White();
  boundColor.copyFrom(carBaseColor(source,family));
  effect.setColor3('baseColor',boundColor);
  effect.setFloat('textureStrength',1);effect.setFloat('textureLevels',0);
  // Do not force alpha=1 or change blending: Window_Glass remains .84 and
  // Front_Glass/GlassTransparent remain .30 as set in mustang.js.
 }};
}
