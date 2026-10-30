import {decodeHumanMesh, type HumanMeshData} from './humanMeshData';
let pending:Promise<HumanMeshData>|undefined;
export function loadHumanMesh():Promise<HumanMeshData> {
  if(!pending)pending=fetch(new URL('./assets/human-neutral.bin',import.meta.url)).then(async response=>{
    if(!response.ok)throw Error(`人体网格加载失败（${response.status}），未生成参考图`);
    return decodeHumanMesh(await response.arrayBuffer());
  }).catch(error=>{pending=undefined;throw error;});
  return pending;
}
