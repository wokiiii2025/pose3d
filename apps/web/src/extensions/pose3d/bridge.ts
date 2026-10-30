import {useProjectStore} from '../../store/useProjectStore';
import {apiJSON} from '../../services/apiClient';
import {planPoseChange, planReferenceChange, poseTarget, type PoseTarget} from './binding';
import type {ReferencePlan} from './references';
import {poseSignature, poseStateSignature, type PosePresetMark, type PoseReference, type PoseScene} from './model';

export function changePose(target:PoseTarget,next:PoseReference|undefined,expected?:string) {
  const state=useProjectStore.getState();
  const plan=planPoseChange(state,target,next,expected);
  useProjectStore.setState(plan);
  state.scheduleAutoSave(); // 与正文共用 IndexedDB 草稿、编辑租约及幂等保存队列。
}
export function changeReferencePlan(target:PoseTarget,next:ReferencePlan,expected:string) {
  const state=useProjectStore.getState();
  useProjectStore.setState(planReferenceChange(state,target,next,expected));
  state.scheduleAutoSave();
}
/** 上传仅锁定明确工程；等待期间切换、接管或姿态更新时，不回填迟到的截图。 */
export async function bindPoseRender(target:PoseTarget,scene:PoseScene,capture:()=>Promise<Blob>,preset?:PosePresetMark) {
  const state=useProjectStore.getState(),pose=poseTarget(state,target).pose;
  planPoseChange(state,target,{scene});
  if(state.syncAccess!=='editing')throw Error('当前离线，姿态草稿保留；联网后再保存参考图');
  const expected=poseStateSignature(pose),signature=poseSignature(scene),blob=await capture();
  planPoseChange(useProjectStore.getState(),target,{scene},expected);
  if(useProjectStore.getState().syncAccess!=='editing')throw Error('连接或编辑权已变化，姿态草稿保留');
  if(blob.type!=='image/webp')throw Error('浏览器未导出 WebP，参考图未绑定');
  const result=await apiJSON<{url:string}>(`/api/media/upload?projectId=${encodeURIComponent(target.projectId)}`,{method:'POST',headers:{'Content-Type':'image/webp'},body:blob});
  if(useProjectStore.getState().syncAccess!=='editing')throw Error('编辑权已变化，参考图未覆盖当前草稿');
  changePose(target,{scene,render:{url:result.url,signature},...(preset?{preset}:{})},expected);
  return result.url;
}
