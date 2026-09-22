// Shared route used by physics, scenery, and the minimap. Distances are metres.
export const CIRCUIT=Object.freeze({
 id:'sakura-valley-v1',name:'Sakura Valley',subtitle:'Blossom circuit',
 // Clockwise scenic loop: paddock straight, river sweep, two technical bends,
 // north woodland, west hairpin, then a broad return to the starting straight.
 controls:Object.freeze([
  [-180,-195],[-35,-195],[125,-190],[240,-150],[278,-65],
  [232,5],[148,30],[156,100],[242,160],[215,220],
  [105,254],[-15,235],[-78,169],[-152,181],[-236,236],
  [-294,180],[-277,92],[-204,24],[-234,-76],[-248,-148]
 ].map(point=>Object.freeze(point))),
 samplesPerSegment:48,
 riverX:345,
 scenerySeed:2015,
});
export function trackBounds(points){
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
 return{minX,maxX,minZ,maxZ,width:maxX-minX,depth:maxZ-minZ,centerX:(minX+maxX)/2,centerZ:(minZ+maxZ)/2};
}
