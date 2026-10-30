import {assertPose, assertPosePresetMark, poseReady, poseReferences, poseStateSignature, type PoseReference, type PoseExtensions} from './model.ts';
import type {Node, Edge} from '@xyflow/react';
import type {ShotItem, StoryBible} from '../../types/workflow.ts';
import {productionSignatureCurrent, shotProductionSignature} from '../../utils/productionContext.ts';
import {orderedReferences,referencePlanSignature,assertReferenceDraft,type ReferencePlan} from './references.ts';
export interface PoseTarget {projectId:string;nodeId?:string;shotId?:string}
export interface PoseProject {projectId:string;syncAccess:string;nodes:Node[];edges:Edge[];shots:ShotItem[];bible:StoryBible}
export function poseTarget(project:PoseProject,target:PoseTarget) {
  if(project.projectId!==target.projectId)throw Error('工程已切换，姿态未写入其他工程');
  const node=target.nodeId?project.nodes.find(n=>n.id===target.nodeId&&n.type==='imageToImageNode'):undefined;
  if(target.nodeId&&!node)throw Error('图像节点已移除');
  if(target.shotId&&node?.data.shotId&&target.shotId!==node.data.shotId)throw Error('镜头绑定已变化');
  const shotId=target.shotId||node?.data.shotId;
  const shot=shotId?project.shots.find(s=>s.id===shotId):undefined;
  if(shotId&&!shot)throw Error('镜头已移除');
  if(shot?.bridge)throw Error('补帧镜头使用首尾帧，不绑定姿态参考');
  if(!node&&!shot)throw Error('请选择图像节点或镜头');
  const pose=(shot?.extensions?.pose3d||(!shot?(node?.data.extensions as PoseExtensions|undefined)?.pose3d:undefined)) as PoseReference|undefined;
  return {node,shot,pose};
}
/** 单次原子更新镜头与其图像节点；不动剧本、历史输出、已采用视频及时间线。 */
export function planPoseChange(project:PoseProject,target:PoseTarget,next:PoseReference|undefined,expected?:string) {
  if(!['editing','offline'].includes(project.syncAccess))throw Error('当前窗口没有编辑权，请先接管工程');
  const {node,shot,pose}=poseTarget(project,target);
  if(expected!==undefined&&poseStateSignature(pose)!==expected)throw Error('姿态已被更新，本次渲染未覆盖新草稿');
  if(next){
    assertPose(next.scene);
    assertPosePresetMark(next.preset,next.scene);
    if(next.render&&(!poseReady(next)||!next.render.url.startsWith(`/media/p/${project.projectId}/`)))throw Error('姿态参考尚未保存到当前工程');
  }
  const related=project.nodes.filter(n=>shot?n.data.shotId===shot.id:n.id===node!.id);
  if(related.some(n=>n.data.isGenerating||n.data.videoJobStatus==='pending'))throw Error('镜头仍有生成任务，请结束后调整姿态');
  const previousRoles=shot?.extensions?.referenceImages||(!shot?(node?.data.extensions as PoseExtensions|undefined)?.referenceImages:undefined);
  const roles=previousRoles?{...previousRoles,entries:orderedReferences([...previousRoles.entries.filter(e=>e.purpose!=='pose'),...(poseReady(next)?[{url:next!.render!.url,purpose:'pose' as const}]:[])]),actors:next?previousRoles.actors.filter(binding=>next.scene.actors.some(actor=>actor.id===binding.actorId)):[]}:undefined;
  const updatedShot=shot?{...shot,extensions:{...shot.extensions,pose3d:next,...(roles?{referenceImages:roles}:{})}}:undefined;
  const images=new Set(related.filter(n=>n.type==='imageToImageNode').map(n=>n.id));
  const downstream=new Set(project.edges.filter(e=>images.has(e.source)).map(e=>e.target));
  return {
    shots:project.shots.map(s=>s.id===shot?.id?updatedShot!:s),
    nodes:project.nodes.map(n=>{
      if(images.has(n.id))return {...n,data:{...n.data,extensions:{...(n.data.extensions||{}),pose3d:next,...(roles?{referenceImages:roles}:{})},
        refImages:roles?roles.entries.map(e=>e.url):poseReferences(Array.isArray(n.data.refImages)?n.data.refImages:[],pose,next),reviewedImageUrl:undefined,
        ...(shot&&productionSignatureCurrent(project.bible,shot,n.data)?{productionSignature:shotProductionSignature(project.bible,updatedShot!)}:{})}};
      if(n.type==='videoGenNode'&&(downstream.has(n.id)||(shot&&n.data.shotId===shot.id)))return {...n,data:{...n.data,approvedFrameUrl:undefined,
        ...(shot&&productionSignatureCurrent(project.bible,shot,n.data)?{productionSignature:shotProductionSignature(project.bible,updatedShot!)}:{})}};
      return n;
    }),
  };
}

/** 允许保存不完整用途草稿；执行前统一校验，不为用户猜人物映射。 */
export function planReferenceChange(project:PoseProject,target:PoseTarget,next:ReferencePlan,expected:string) {
  const {node,shot,pose}=poseTarget(project,target),previous=shot?.extensions?.referenceImages||(!shot?(node?.data.extensions as PoseExtensions|undefined)?.referenceImages:undefined);
  if(referencePlanSignature(previous)!==expected)throw Error('参考用途已在其他操作中变化，请核对当前绑定');
  assertReferenceDraft(next);
  const base=planPoseChange(project,target,pose),updatedShot=shot?{...base.shots.find(s=>s.id===shot.id)!,extensions:{...shot.extensions,referenceImages:next}}:undefined;
  const imageIds=new Set(project.nodes.filter(n=>n.type==='imageToImageNode'&&(shot?n.data.shotId===shot.id:n.id===node!.id)).map(n=>n.id));
  return {shots:base.shots.map(s=>s.id===shot?.id?updatedShot!:s),nodes:base.nodes.map(n=>{
    const old=project.nodes.find(o=>o.id===n.id)!;
    if(imageIds.has(n.id))return {...n,data:{...n.data,extensions:{...(n.data.extensions||{}),referenceImages:next},refImages:next.entries.map(e=>e.url),...(shot&&productionSignatureCurrent(project.bible,shot,old.data)?{productionSignature:shotProductionSignature(project.bible,updatedShot!)}:{})}};
    if(n.type==='videoGenNode'&&shot&&n.data.shotId===shot.id&&productionSignatureCurrent(project.bible,shot,old.data))return {...n,data:{...n.data,productionSignature:shotProductionSignature(project.bible,updatedShot!)}};
    return n;
  })};
}
