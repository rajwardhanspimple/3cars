// Babylon uses left-handed face winding. Keep generated ground surfaces visible
// from above and lit from the sky, including rivers that run opposite the track.
export function orientGroundSurfaces(scene){
 const B=globalThis.BABYLON;
 const names=/^(sculpted-sakura|sakura-asphalt|outer-runoff|left-edge-line|right-edge-line|subtle-racing-patch|azuma-river|rocky-west-bank|rocky-east-bank)/;
 for(const mesh of scene.meshes){
  if(!names.test(mesh.name))continue;
  const p=mesh.getVerticesData(B.VertexBuffer.PositionKind),indices=Array.from(mesh.getIndices()||[]),normals=[];
  if(!p||!indices.length)continue;
  B.VertexData.ComputeNormals(p,indices,normals);let up=0;for(let i=1;i<normals.length;i+=3)up+=normals[i];
  if(up<0){for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];B.VertexData.ComputeNormals(p,indices,normals);mesh.setIndices(indices);mesh.setVerticesData(B.VertexBuffer.NormalKind,normals);}
 }
}
