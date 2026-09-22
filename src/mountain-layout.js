// Shared deterministic mountain layout for rendering and simulation collision rules.
export const MOUNTAIN={id:'sakura-mountain-preview-v1',name:'Sakura Pass',preview:true};
export function roadHeight(x,z){return 12+.035*(z+200)+4*Math.sin(x*.008);}
export function roadPose(x,z,yaw=0){
  const dx=.032*Math.cos(x*.008),dz=.035;
  return {y:roadHeight(x,z),pitch:-Math.atan(dx*Math.sin(yaw)+dz*Math.cos(yaw)),roll:Math.atan(dx*Math.cos(yaw)-dz*Math.sin(yaw))};
}
export function mountainLayout(track){
  const trees=[],props=[],walls=[];let seed=2309;
  const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let s=25,n=0;s<track.length;s+=30,n++)for(const side of [-1,1]){
    const offset=side*(14.5+rnd()*6),p=track.at(s,offset);
    if(track.project(p.x,p.z).distance<12.5)continue;
    const type=(n+Number(side>0))%3===0?'green':'cherry';
    trees.push({id:`tree-${n}-${side}`,type,x:p.x,z:p.z,y:roadHeight(p.x,p.z),yaw:rnd()*Math.PI*2,height:type==='green'?12+rnd()*3:9+rnd()*3,radius:type==='green'?.65:.5});
  }
  for(let s=55,n=0;s<track.length;s+=85,n++){
    const p=track.at(s,n%2?11.3:-11.3);
    props.push({id:`prop-${n}`,type:n%4===0?'sign':'cone',x:p.x,z:p.z,y:roadHeight(p.x,p.z),yaw:p.heading,tilt:0,vx:0,vz:0,active:true,radius:.45,mass:5});
  }
  for(let s=0,n=0;s<track.length;s+=5,n++){
    const k=track.curvature(s);if(Math.abs(k)<.011)continue;
    const side=Math.sign(k),p=track.at(s,side*15.8);
    walls.push({id:`wall-${n}`,x:p.x,z:p.z,y:roadHeight(p.x,p.z),yaw:p.heading,length:5.3,width:.8,height:3.4});
  }
  return {trees,props,walls};
}
