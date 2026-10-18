import test from 'node:test';
import assert from 'node:assert/strict';
import { worldPoint, explodeVector, piecePolygon } from './scene.mjs';
import * as scene from './scene.mjs';
import * as THREE from 'three';
test('assembly transform maps actual plate corners without changing source dimensions',()=>{
 const p={width:300,height:150,transform:{origin:[0,200,0],u:[1,0,0],v:[0,0,1],normal:[0,-1,0]}};
 assert.deepEqual(worldPoint(p,300,150,3.2),[300,196.8,150]);
 assert.equal(p.width,300);
});
test('explosion is presentation only and follows face orientation',()=>{
 const p={transform:{origin:[0,0,0],u:[1,0,0],v:[0,0,1],normal:[0,-1,0]}};
 const before=JSON.stringify(p);
 assert.deepEqual(explodeVector(p,40),[0,-40,0]);
 assert.equal(JSON.stringify(p),before);
});
test('viewer keeps a custom contour rather than replacing it by its envelope',()=>{
 const contour=[{x:0,y:0},{x:60,y:0},{x:60,y:20},{x:20,y:20},{x:20,y:60},{x:0,y:60}];
 assert.deepEqual(piecePolygon({width:60,height:60,contour}),contour.map(p=>[p.x,p.y]));
});
test('blind front and back bores leave solid material beyond their informed depth',()=>{
 assert.equal(typeof scene.pieceDepthLayers,'function');
 const piece={thickness:10,holes:[
  {id:'through',through:true,diameter:4,x:20,y:20},
  {id:'front',through:false,depth:2,face:'front',diameter:4,x:40,y:20},
  {id:'back',through:false,depth:3,face:'back',diameter:4,x:60,y:20},
 ]};
 const layers=scene.pieceDepthLayers(piece);
 const removedAt=z=>layers.find(layer=>z>=layer.start&&z<layer.start+layer.depth).holes.map(h=>h.id).sort();
 assert.deepEqual(removedAt(1),['front','through']);
 assert.deepEqual(removedAt(4),['through']);
 assert.deepEqual(removedAt(9),['back','through']);
 assert.equal(layers.reduce((sum,layer)=>sum+layer.depth,0),10);
});
test('flat preview retains imported polygon voids and the original outer contour',()=>{
 assert.equal(typeof scene.pieceRings,'function');
 const p={width:100,height:80,contour:[[0,0],[100,0],[100,80],[0,80]],cutouts:[{contour:[{x:20,y:20},{x:40,y:20},{x:40,y:40},{x:20,y:40}]}]};
 const before=JSON.stringify(p),rings=scene.pieceRings(p);
 assert.deepEqual(rings,[p.contour,[[20,20],[40,20],[40,40],[20,40]]]);
 assert.equal(JSON.stringify(p),before);
});
test('assembly animates from an already exploded view and finishes mounted',()=>{
 assert.equal(typeof scene.createAssemblyMotion,'function');
 const motion=scene.createAssemblyMotion(true);
 assert.equal(motion.sample(0),1);
 motion.animate(100);
 assert.equal(motion.sample(100),1);
 assert.equal(motion.sample(1000),.5);
 assert.equal(motion.sample(1900),0);
 motion.explode(true);
 assert.equal(motion.sample(3000),1);
 motion.reset();
 assert.equal(motion.sample(4000),0);
});
test('camera refits on portrait transition or cumulative aspect change, not tiny resize jitter',()=>{
 assert.equal(typeof scene.needsCameraRefit,'function');
 assert.equal(scene.needsCameraRefit(2,.65),true);
 assert.equal(scene.needsCameraRefit(1.01,.99),true);
 assert.equal(scene.needsCameraRefit(2,1.99),false);
 assert.equal(scene.needsCameraRefit(2,1.6),true);
 assert.equal(scene.needsCameraRefit(undefined,.65),true);
});
test('resized perspective keeps every box corner inside the mobile view at the same angle',()=>{
 assert.equal(typeof scene.fittedCameraDistance,'function');
 const size=[300,200,150],center=new THREE.Vector3(150,100,75),direction=new THREE.Vector3(1,-1,.8).normalize();
 let desktopDistance;
 for(const aspect of [2,.65,.4]){
  const distance=scene.fittedCameraDistance(size,direction.toArray(),aspect,36);
  if(aspect===2)desktopDistance=distance;else assert.ok(distance>desktopDistance);
  const camera=new THREE.PerspectiveCamera(36,aspect,.1,100000);camera.up.set(0,0,1);camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);camera.updateMatrixWorld();
  for(const x of [0,300])for(const y of [0,200])for(const z of [0,150]){const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<.9&&Math.abs(p.y)<.9,`Clipped corner at aspect ${aspect}: ${p.toArray()}`);}
  assert.ok(camera.position.clone().sub(center).normalize().distanceTo(direction)<1e-9);
 }
});
