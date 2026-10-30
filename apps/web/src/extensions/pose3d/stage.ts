import * as THREE from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {JOINT_BONES,clampJointRotation,type PoseJoint,type Rotation} from './rigDefinition';
import type {PoseScene} from './model';
import {loadHumanMesh} from './humanAsset';
import {createHumanRig} from './humanRig';
import type {HumanMeshData} from './humanMeshData';

/** 完整蒙皮网格、53 根实际骨骼；编辑辅助物不进入参考图。 */
export function createPoseStage(host:HTMLElement,onPick:(actorId:string,joint:PoseJoint)=>void,onCamera:(camera:PoseScene['camera'])=>void,onJoint:(actorId:string,joint:PoseJoint,value:Rotation)=>void) {
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setClearColor(0x27272a);
  renderer.domElement.setAttribute('aria-label','完整人体蒙皮取景预览');host.appendChild(renderer.domElement);
  const world=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,100);
  world.add(new THREE.HemisphereLight(0xffffff,0x52525b,2));
  const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,5,4);world.add(light);
  const rim=new THREE.DirectionalLight(0xffffff,1.5);rim.position.set(3,3,-4);world.add(rim);
  const grid=new THREE.GridHelper(10,20,0x52525b,0x3f3f46);world.add(grid);
  const roots=new THREE.Group();world.add(roots);
  const rigs=new Map<string,ReturnType<typeof createHumanRig>>(),actorKeys=new Map<string,string>();
  let data:HumanMeshData|undefined,disposed=false,current:PoseScene|undefined,selectedActor='',selectedJoint:PoseJoint='torso',skeletonVisible=false,editable=true;
  const transform=new TransformControls(camera,renderer.domElement);transform.setMode('rotate');transform.setSpace('local');transform.setSize(.65);
  const gizmo=transform.getHelper();world.add(gizmo);
  gizmo.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Line)object.onBeforeRender=()=>{const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)if('color' in material)(material.color as THREE.Color).setHex(object.name===transform.axis?0xffffff:0xa1a1aa);};});
  const selection=new THREE.Mesh(new THREE.SphereGeometry(.012,10,8),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false}));selection.renderOrder=3;world.add(selection);
  const selected=()=>rigs.get(selectedActor)?.byName.get(JOINT_BONES[selectedJoint]);
  const render=()=>{if(disposed)return;world.updateMatrixWorld(true);const item=selected();selection.visible=!!item&&skeletonVisible;if(item)item.bone.getWorldPosition(selection.position);renderer.render(world,camera);};
  const clearRigs=()=>{transform.detach();for(const rig of rigs.values()){world.remove(rig.helper);rig.dispose();}rigs.clear();actorKeys.clear();roots.clear();};
  const resize=()=>{
    if(!current||disposed)return;const ratio=current.aspectRatio==='16:9'?16/9:current.aspectRatio==='9:16'?9/16:1;
    const width=Math.max(1,Math.min(host.clientWidth,host.clientHeight*ratio));renderer.setSize(width,width/ratio);camera.aspect=ratio;camera.updateProjectionMatrix();render();
  };
  const update=(scene:PoseScene,actorId=selectedActor,joint=selectedJoint,showSkeleton=skeletonVisible,canEdit=editable)=>{
    if(disposed)return;current=scene;selectedActor=actorId;selectedJoint=joint;skeletonVisible=showSkeleton;editable=canEdit;
    if(data){
      if([...rigs.keys()].join('|')!==scene.actors.map(a=>a.id).join('|')){
        clearRigs();for(const actor of scene.actors){const rig=createHumanRig(data,actor.id);roots.add(rig.root);world.add(rig.helper);rigs.set(actor.id,rig);}
      }
      for(const actor of scene.actors){const rig=rigs.get(actor.id)!,key=JSON.stringify(actor);if(actorKeys.get(actor.id)!==key){rig.update(actor);rig.mesh.computeBoundingSphere();actorKeys.set(actor.id,key);}rig.helper.visible=showSkeleton;}
      const item=selected();if(item&&transform.object!==item.bone)transform.attach(item.bone);gizmo.visible=!!item&&canEdit;transform.enabled=canEdit;
    }
    const c=scene.camera,y=THREE.MathUtils.degToRad(c.yaw),p=THREE.MathUtils.degToRad(c.pitch);
    camera.position.set(c.distance*Math.sin(y)*Math.cos(p),c.targetHeight+c.distance*Math.sin(p),c.distance*Math.cos(y)*Math.cos(p));camera.lookAt(0,c.targetHeight,0);resize();
  };
  const ready=loadHumanMesh().then(value=>{if(disposed)return;data=value;if(current)update(current,selectedActor,selectedJoint);});
  const objectChange=()=>{const item=selected();if(!item)return;const euler=new THREE.Euler().setFromQuaternion(item.rest.clone().invert().multiply(item.bone.quaternion),'XYZ');const value=clampJointRotation(selectedJoint,[euler.x,euler.y,euler.z].map(THREE.MathUtils.radToDeg) as Rotation);item.bone.quaternion.copy(item.rest).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...value.map(THREE.MathUtils.degToRad) as Rotation)));render();};
  const mouseUp=()=>{const item=selected();if(!item||!editable)return;const euler=new THREE.Euler().setFromQuaternion(item.rest.clone().invert().multiply(item.bone.quaternion),'XYZ');onJoint(selectedActor,selectedJoint,clampJointRotation(selectedJoint,[euler.x,euler.y,euler.z].map(THREE.MathUtils.radToDeg) as Rotation));};
  transform.addEventListener('objectChange',objectChange);transform.addEventListener('mouseUp',mouseUp);transform.addEventListener('change',render);
  const observer=new ResizeObserver(resize);observer.observe(host);
  const pick=(event:PointerEvent)=>{
    const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    const hit=ray.intersectObjects([...rigs.values()].map(r=>r.mesh))[0];if(hit?.face){const id=hit.object.userData.actorId;onPick(id,rigs.get(id)!.jointAtFace(hit.face));}
  };
  let gesture:{x:number;y:number;scene:PoseScene;moved:boolean}|undefined;
  const down=(event:PointerEvent)=>{if(!current||transform.dragging||transform.axis)return;gesture={x:event.clientX,y:event.clientY,scene:current,moved:false};renderer.domElement.setPointerCapture(event.pointerId);};
  const move=(event:PointerEvent)=>{if(!gesture||transform.dragging)return;const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;if(Math.abs(dx)+Math.abs(dy)<5&&!gesture.moved)return;gesture.moved=true;const c=gesture.scene.camera;update({...gesture.scene,camera:{...c,yaw:Math.max(-180,Math.min(180,c.yaw-dx*.4)),pitch:Math.max(-70,Math.min(70,c.pitch+dy*.3))}});};
  const up=(event:PointerEvent)=>{const previous=gesture;gesture=undefined;if(previous?.moved&&current)onCamera(current.camera);else if(previous)pick(event);};
  const cancel=()=>{if(gesture)update(gesture.scene);gesture=undefined;};
  const wheel=(event:WheelEvent)=>{event.preventDefault();if(!current||!editable||transform.dragging)return;onCamera({...current.camera,distance:Math.round(Math.max(2,Math.min(12,current.camera.distance+event.deltaY*.003))*100)/100});};
  renderer.domElement.addEventListener('wheel',wheel,{passive:false});
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);
  return {ready,update,capture:async()=>{
    await ready;if(!current||!data||disposed)throw Error('完整人体网格尚未就绪');
    grid.visible=false;gizmo.visible=false;selection.visible=false;for(const rig of rigs.values())rig.helper.visible=false;
    const pixelRatio=renderer.getPixelRatio(),ratio=camera.aspect,w=ratio>=1?1024:Math.round(1024*ratio),h=ratio>=1?Math.round(1024/ratio):1024;
    renderer.setPixelRatio(1);renderer.setSize(w,h);renderer.render(world,camera);
    try{return await new Promise<Blob>((resolve,reject)=>renderer.domElement.toBlob(blob=>blob?resolve(blob):reject(Error('人体参考图导出失败')),'image/webp',.92));}
    finally{if(!disposed){renderer.setPixelRatio(pixelRatio);grid.visible=true;update(current,selectedActor,selectedJoint);}}
  },dispose:()=>{disposed=true;observer.disconnect();renderer.domElement.removeEventListener('wheel',wheel);renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('pointercancel',cancel);transform.removeEventListener('objectChange',objectChange);transform.removeEventListener('mouseUp',mouseUp);transform.removeEventListener('change',render);transform.detach();transform.dispose();clearRigs();selection.geometry.dispose();selection.material.dispose();grid.geometry.dispose();(grid.material as THREE.Material).dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}