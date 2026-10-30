import {useProjectStore} from '../../store/useProjectStore';
import {AIService} from '../../services/aiService';
import {loadPosePresetCatalog, loadPosePresetChannels} from '../../services/posePresetLibrary';
import {isAdultProject} from '../../utils/contentPolicy';
import {traceStep} from '../../services/runTrace';
import {bindPoseRender, changeReferencePlan} from './bridge';
import {createPoseStage} from './stage';
import {poseSignature} from './model';
import type {PosePresetCatalog} from './posePresetSpec';
import {referencePlanSignature} from './references';
import {assertPresetBinding, buildPoseMatchRequest, parsePoseMatchResult, poseMatchCandidates, poseMatchIssue, presetPoseReference, presetReferencePlan, type PoseMatchSkip} from './posePresetMatch';

export interface AutoPoseResult {bound:{shotId:string;label:string}[];skipped:PoseMatchSkip[]}

/** 依次尝试已启用的 ComfyUI 图像渠道，取第一个能读出姿势目录的渠道；只读，不写回远端。 */
async function loadCatalog():Promise<PosePresetCatalog> {
  const channels=await loadPosePresetChannels();
  if(!channels.length)throw Error('配置中心尚无已启用的 ComfyUI 图像渠道，无法读取预设姿势库');
  let failure='';
  for(const channel of channels){
    try{const catalog=await loadPosePresetCatalog(channel.id);if(catalog.presets.length)return catalog;failure=`${channel.name} 的姿势库为空`;}
    catch(error){failure=`${channel.name}：${error instanceof Error?error.message:'姿势目录读取失败'}`;}
  }
  throw Error(`预设姿势库不可用（${failure}）`);
}
const imageRefs=(shotId:string)=>{const node=useProjectStore.getState().nodes.find(n=>n.type==='imageToImageNode'&&n.data.shotId===shotId);return Array.isArray(node?.data.refImages)?node.data.refImages as string[]:[];};

/**
 * 为单人镜头自动匹配预设姿势：模型（装载分级制作技能）只选白名单编号；系统渲染中性人偶、上传到当前工程，
 * 绑定人偶与镜头角色，并按执行时的同一套规则校验参考用途。已有姿态的镜头不改动；任一镜头失败不影响其他镜头。
 */
export async function autoBindPresetPoses({shotIds,aspectRatio,nodeId}:{shotIds:string[];aspectRatio?:string;nodeId?:string}):Promise<AutoPoseResult> {
  const start=useProjectStore.getState(),owner=start.projectId;
  if(!isAdultProject(start.bible.config))throw Error('预设姿势库仅在成人向工程中提供');
  if(start.syncAccess!=='editing')throw Error('当前窗口没有在线编辑权，未匹配姿势');
  const {candidates,skipped}=poseMatchCandidates(start.bible,start.shots.filter(s=>shotIds.includes(s.id)));
  if(!candidates.length)return {bound:[],skipped};

  const loading=traceStep(nodeId,'读取预设姿势库');
  let catalog:PosePresetCatalog;
  try{catalog=await loadCatalog();loading.done(`已载入 ${catalog.presets.length} 项预设`);}catch(error){loading.fail(error);throw error;}

  const choosing=traceStep(nodeId,'模型选择预设姿势',`${candidates.length} 个单人镜头`);
  let choices;
  try{
    const raw=await AIService.chatCompletions({purpose:'production',task:'posePresets',responseFormat:'json_object',temperature:.2,nodeId,...buildPoseMatchRequest(start.bible,candidates,catalog.presets)});
    choices=parsePoseMatchResult(raw,candidates.map(s=>s.id),new Set(catalog.presets.map(p=>p.id)));
    choosing.done(`${choices.filter(c=>c.presetId).length} 个镜头选定姿势`);
  }catch(error){choosing.fail(error);throw error;}

  const bound:AutoPoseResult['bound']=[];
  for(const choice of choices)if(!choice.presetId)skipped.push({shotId:choice.shotId,reason:`没有合适的预设姿势${choice.reason?`：${choice.reason}`:''}`});
  const picked=choices.filter(c=>c.presetId);
  if(!picked.length)return {bound,skipped};

  const host=document.createElement('div');
  host.setAttribute('aria-hidden','true');
  Object.assign(host.style,{position:'fixed',left:'-10000px',top:'0',width:'640px',height:'640px',pointerEvents:'none'});
  document.body.appendChild(host);
  const stage=createPoseStage(host,()=>{},()=>{},()=>{});
  try{
    await stage.ready;
    for(const choice of picked){
      const preset=catalog.presets.find(p=>p.id===choice.presetId)!;
      const rendering=traceStep(nodeId,'渲染并绑定人偶',`镜头 ${candidates.find(s=>s.id===choice.shotId)?.shotNumber??''} · ${preset.label}`);
      try{
        const state=useProjectStore.getState();
        if(state.projectId!==owner)throw Error('工程已切换，停止绑定');
        const shot=state.shots.find(s=>s.id===choice.shotId);
        if(!shot)throw Error('镜头已移除');
        const issue=poseMatchIssue(state.bible,shot);
        if(issue)throw Error(issue);
        const pose=presetPoseReference(preset,shot.shotType,aspectRatio);
        const target={projectId:owner,shotId:shot.id};
        // 先用占位地址按执行规则预检，校验不通过时不上传参考图。
        const existing=shot.extensions?.referenceImages;
        assertPresetBinding(presetReferencePlan(state.bible,shot,imageRefs(shot.id),existing,`/media/p/${owner}/pending.webp`),{...pose,render:{url:`/media/p/${owner}/pending.webp`,signature:poseSignature(pose.scene)}},state.bible,shot,owner);
        const url=await bindPoseRender(target,pose.scene,()=>{stage.update(pose.scene,'',undefined,false,false);return stage.capture();},pose.preset);
        const latest=useProjectStore.getState(),current=latest.shots.find(s=>s.id===shot.id)!,plan=presetReferencePlan(latest.bible,current,imageRefs(shot.id).filter(u=>u!==url),current.extensions?.referenceImages,url);
        assertPresetBinding(plan,current.extensions!.pose3d!,latest.bible,current,owner);
        changeReferencePlan(target,plan,referencePlanSignature(current.extensions?.referenceImages));
        bound.push({shotId:shot.id,label:preset.label});
        rendering.done(`${preset.label}${choice.reason?` · ${choice.reason}`:''}`);
      }catch(error){
        const reason=error instanceof Error?error.message:'姿态绑定失败';
        skipped.push({shotId:choice.shotId,reason});
        rendering.fail(error);
        if(useProjectStore.getState().projectId!==owner)break;
      }
    }
  }finally{stage.dispose();host.remove();}
  return {bound,skipped};
}
