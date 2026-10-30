import {apiJSON} from './apiClient';
import type {PosePresetCatalog} from '../extensions/pose3d/posePresetSpec';

export interface PosePresetChannel {id:string;name:string;model:string}

/** 姿势库由 ComfyUI 上的 VNCCS 节点提供，与所选图像工作流无关：任意启用的 ComfyUI 图像渠道都可只读载入。 */
export async function loadPosePresetChannels():Promise<PosePresetChannel[]> {
  const result=await apiJSON<{channels?:Array<Record<string,unknown>>}>('/api/db/channels');
  return (Array.isArray(result.channels)?result.channels:[])
    .filter(channel=>channel.enabled!==false&&channel.protocol==='comfyui-image')
    .flatMap(channel=>typeof channel.id==='string'&&typeof channel.name==='string'&&typeof channel.model==='string'?[{id:channel.id,name:channel.name,model:channel.model}]:[]);
}

export async function loadPosePresetCatalog(channelId:string):Promise<PosePresetCatalog> {
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(channelId))throw new Error('姿势库渠道标识无效');
  return apiJSON<PosePresetCatalog>(`/api/pose-presets?channelId=${encodeURIComponent(channelId)}`);
}
