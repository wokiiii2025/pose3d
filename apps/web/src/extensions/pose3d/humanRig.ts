import * as THREE from 'three';
import {JOINT_BONES,DEFAULT_PROPORTIONS,clampJointRotation,type PoseJoint,type Rotation} from './rigDefinition';
import type {PoseActor} from './model';
import type {HumanMeshData} from './humanMeshData';
export function createHumanRig(data:HumanMeshData,actorId:string) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));
  geometry.setAttribute('skinIndex',new THREE.BufferAttribute(data.skinIndices,4));
  geometry.setAttribute('skinWeight',new THREE.BufferAttribute(data.skinWeights,4));
  geometry.setIndex(new THREE.BufferAttribute(data.indices,1));geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({color:0xbfc0c4,roughness:.7,metalness:.05});
  const mesh=new THREE.SkinnedMesh(geometry,material);mesh.frustumCulled=false;mesh.userData.actorId=actorId;
  const worldRotations=data.bones.map(b=>new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...b.tail).sub(new THREE.Vector3(...b.head)).normalize()));
  const bones=data.bones.map((b,i)=>{const bone=new THREE.Bone();bone.name=b.name;bone.userData.actorId=actorId;
    const position=new THREE.Vector3(...b.head),rotation=worldRotations[i].clone();
    if(b.parent>=0){position.sub(new THREE.Vector3(...data.bones[b.parent].head)).applyQuaternion(worldRotations[b.parent].clone().invert());rotation.premultiply(worldRotations[b.parent].clone().invert());}
    bone.position.copy(position);bone.quaternion.copy(rotation);return bone;});
  for(const [i,b]of data.bones.entries())if(b.parent>=0)bones[b.parent].add(bones[i]);else mesh.add(bones[i]);
  mesh.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);mesh.bind(skeleton);
  const root=new THREE.Group();root.add(mesh);
  const byName=new Map(bones.map((bone,index)=>[bone.name,{bone,rest:bone.quaternion.clone(),index}]));
  const helper=new THREE.SkeletonHelper(mesh),lineMaterial=helper.material as THREE.LineBasicMaterial;lineMaterial.color.set(0xe4e4e7);lineMaterial.vertexColors=false;lineMaterial.depthTest=false;lineMaterial.transparent=true;lineMaterial.opacity=.65;helper.visible=false;helper.renderOrder=2;
  const boneToJoint=new Map(Object.entries(JOINT_BONES).map(([joint,name])=>[name,joint as PoseJoint]));
  const update=(actor:PoseActor)=>{
    root.position.set(...actor.position);root.rotation.y=THREE.MathUtils.degToRad(actor.yaw);
    const shape={...DEFAULT_PROPORTIONS,...actor.proportions};root.scale.setScalar(shape.height/1.75);
    // 补偿中性站姿腿长，避免调整比例时脚底穿入地面；不强行锁定手调站位或姿态。
    root.position.y+=(shape.legs-1)*.9*shape.height/1.75;
    for(const item of byName.values()){item.bone.quaternion.copy(item.rest);item.bone.scale.set(1,1,1);}
    for(const [joint,name]of Object.entries(JOINT_BONES)){const item=byName.get(name)!;const value=clampJointRotation(joint as PoseJoint,actor.joints[joint as PoseJoint]||[0,0,0]);item.bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...value.map(THREE.MathUtils.degToRad) as Rotation,'XYZ')));}
    for(const suffix of ['l','r']){
      byName.get(`clavicle_${suffix}`)!.bone.scale.y=shape.shoulders;
      for(const bone of ['upperarm','lowerarm'])byName.get(`${bone}_${suffix}`)!.bone.scale.y=shape.arms;
      for(const bone of ['thigh','calf'])byName.get(`${bone}_${suffix}`)!.bone.scale.y=shape.legs;
      byName.get(`hand_${suffix}`)!.bone.scale.setScalar(shape.hands);byName.get(`foot_${suffix}`)!.bone.scale.setScalar(shape.feet);
    }
    byName.get('head')!.bone.scale.setScalar(shape.head);root.updateMatrixWorld(true);skeleton.update();
  };
  const jointAtFace=(face:{a:number;b:number;c:number})=>{
    const votes=new Map<number,number>();for(const v of [face.a,face.b,face.c])for(let i=0;i<4;i++){const index=data.skinIndices[v*4+i];votes.set(index,(votes.get(index)||0)+data.skinWeights[v*4+i]);}
    const index=[...votes].sort((a,b)=>b[1]-a[1])[0][0];return boneToJoint.get(bones[index].name)||'pelvis';
  };
  return {root,mesh,skeleton,helper,byName,jointAtFace,update,dispose:()=>{helper.dispose();skeleton.dispose();geometry.dispose();material.dispose();}};
}
