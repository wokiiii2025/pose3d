import {useProjectStore} from '../../store/useProjectStore';
import {IDESelect} from '../../components/Common/IDESelect';
import {mediaImageUrl} from '../../utils/mediaImages';
import {shotReferences} from '../../utils/productionContext';
import {changeReferencePlan} from './bridge';
import {poseTarget} from './binding';
import {poseReady} from './model';
import {characterReferenceOptions} from '../../utils/characterReferenceOptions';
import {isAdultProject} from '../../utils/contentPolicy';
import {REFERENCE_PURPOSES,referenceDraft,referencePlanSignature,orderedReferences,prepareReferenceContract,compileReferencePrompt,assertReferenceDraft,type ReferenceEntry,type ReferencePlan} from './references';

/** 两处入口共用的用途与人偶绑定面板；所有修改仍走工程正文草稿。 */
export function ReferencePurposePanel({nodeId,shotId}:{nodeId?:string;shotId?:string}) {
  const state=useProjectStore(),target={projectId:state.projectId,nodeId,shotId};
  const adult=isAdultProject(state.bible.config);
  // 删除时子组件可能先于画布父组件收到订阅通知；读取失效目标不应抛出渲染异常。
  const currentNode=state.nodes.find(n=>n.id===nodeId);
  if(nodeId&&!currentNode)return null;
  const currentShotId=shotId||currentNode?.data.shotId;
  if(currentShotId&&!state.shots.some(s=>s.id===currentShotId))return <section className="nodrag nopan text-xs text-zinc-500" role="status">镜头已移入历史或已移除，原有素材保留；当前不编辑参考用途。</section>;
  const {node,shot,pose}=poseTarget(state,target),nodeData=node?.data as Record<string,any>|undefined,stored=shot?.extensions?.referenceImages||(!shot?nodeData?.extensions?.referenceImages:undefined);
  try{if(stored)assertReferenceDraft(stored);}catch{return <section className="nodrag nopan rounded-lg border border-zinc-800 p-3 text-xs" role="alert">参考用途数据异常，原内容已保留。请先导出工程备份并核对扩展数据。</section>;}
  const refs:string[]=nodeData?.refImages|| (shot?shotReferences(state.bible,shot):[]);
  const plan:ReferencePlan=stored||referenceDraft(state.bible,shot,refs,pose),busy=state.nodes.some(n=>(shot?n.data.shotId===shot.id:n.id===nodeId)&&(n.data.isGenerating||n.data.videoJobStatus==='pending'));
  const editable=['editing','offline'].includes(state.syncAccess)&&!busy,expected=referencePlanSignature(stored);
  const commit=(next:ReferencePlan)=>{try{changeReferencePlan(target,{...next,entries:orderedReferences(next.entries)},expected);}catch(e){state.addToast({type:'error',title:'参考用途未保存',description:e instanceof Error?e.message:String(e)});}};
  const choices:ReferenceEntry[]=[];
  for(const c of state.bible.characters.filter(c=>!shot||shot.characterIds.includes(c.id))){
    if(c.stages?.length){for(const s of c.stages.filter(s=>!shot?.characterStageIds?.[c.id]||shot.characterStageIds[c.id]===s.id))if(s.referenceImageUrl)choices.push({url:s.referenceImageUrl,purpose:'character',assetId:c.id,stageId:s.id});}
    else if(c.referenceImageUrl)choices.push({url:c.referenceImageUrl,purpose:'character',assetId:c.id});
  }
  for(const s of state.bible.scenes.filter(s=>!shot||shot.sceneId===s.id))if(s.referenceImageUrl)choices.push({url:s.referenceImageUrl,purpose:'scene',assetId:s.id});
  for(const p of (state.bible.props||[]).filter(p=>!shot||shot.propIds?.includes(p.id)))if(p.referenceImageUrl)choices.push({url:p.referenceImageUrl,purpose:'prop',assetId:p.id});
  if(poseReady(pose))choices.push({url:pose!.render!.url,purpose:'pose'});
  const key=(e:ReferenceEntry)=>JSON.stringify([e.purpose,e.assetId||'',e.stageId||'']);
  const label=(e:ReferenceEntry)=>e.purpose==='pose'?'当前姿态构图':e.purpose==='character'?(()=>{const c=state.bible.characters.find(c=>c.id===e.assetId);return [c?.name,c?.stages?.find(s=>s.id===e.stageId)?.stageName].filter(Boolean).join(' · ');})():e.purpose==='scene'?state.bible.scenes.find(s=>s.id===e.assetId)?.name||'':state.bible.props?.find(p=>p.id===e.assetId)?.name||'';
  const setEntry=(index:number,entry:ReferenceEntry)=>commit({...plan,entries:plan.entries.map((e,i)=>i===index?entry:e)});
  let issue='',compiled='';
  try{const contract=prepareReferenceContract(plan,refs,pose,state.bible,shot,state.projectId);compiled=compileReferencePrompt(shot?.imagePrompt||nodeData?.prompt||'',contract,refs,state.projectId);}catch(e){issue=e instanceof Error?e.message:'参考用途尚未配置完整';}
  const outOfSync=JSON.stringify(refs)!==JSON.stringify(plan.entries.map(e=>e.url));
  return <section className="nodrag nopan rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 space-y-3 text-xs min-w-0" aria-label="参考用途与人偶绑定">
    <div className="flex items-center justify-between gap-2"><h4 className="text-zinc-200">参考用途与传参</h4><span className="text-[10px] text-zinc-500">{stored?'随工程自动保存':'尚未启用'}</span></div>
    <p className="text-[10px] text-zinc-500 leading-relaxed">姿态 → 角色造型 → 场景 → 道具。下列顺序就是发送顺序，短提示词保持独立；姿态仅作结构引导。</p>
    {!stored&&<button type="button" disabled={!editable||!refs.length} className="ide-btn-secondary rounded px-3 py-1.5 w-full disabled:opacity-40" onClick={()=>commit(plan)}>配置参考用途</button>}
    {stored&&<>
      {plan.entries.map((entry,i)=><div key={`${i}:${entry.url}`} className="border border-zinc-800 rounded-lg p-2 space-y-2 min-w-0">
        <div className="flex gap-2 items-center min-w-0"><img loading="lazy" src={mediaImageUrl(entry.url)} alt={`参考图 ${i+1}`} className="w-9 h-9 object-contain rounded bg-zinc-900 shrink-0"/><span className="text-[10px] text-zinc-400 shrink-0">参考图 {i+1}</span><IDESelect title={`参考图 ${i+1} 用途`} value={entry.purpose} disabled={!editable} containerClassName="min-w-0 flex-1" className="w-full text-xs" placeholder="请选择用途" options={Object.entries(REFERENCE_PURPOSES).filter(([p])=>p!=='pose'||(poseReady(pose)&&entry.url===pose?.render?.url)).map(([value,label])=>({value,label}))} onChange={e=>setEntry(i,{url:entry.url,purpose:e.target.value})}/><button type="button" aria-label={`移除参考图 ${i+1} 用途`} disabled={!editable||entry.purpose==='pose'} className="px-1 text-zinc-500 disabled:opacity-30" onClick={()=>commit({...plan,entries:plan.entries.filter((_,n)=>n!==i)})}>移除</button></div>
        {entry.purpose&&entry.purpose!=='pose'&&<IDESelect title={`参考图 ${i+1} 绑定素材`} value={entry.assetId?key(entry):''} disabled={!editable} placeholder="明确绑定素材与造型" className="w-full text-xs" options={choices.filter(e=>e.purpose===entry.purpose).map(e=>({value:key(e),label:label(e)}))} onChange={e=>{const next=choices.find(c=>key(c)===e.target.value);if(next)setEntry(i,next);}}/>}
        {entry.purpose==='character'&&entry.assetId&&(()=>{const options=characterReferenceOptions(state.bible,state.assets,entry.assetId,entry.stageId,adult);return options.length>1&&<IDESelect title={`参考图 ${i+1} 角色参考版本`} value={entry.url} disabled={!editable} placeholder="选择角色参考版本" className="w-full text-xs" options={options.map(o=>({value:o.url,label:o.label}))} onChange={event=>{const o=options.find(x=>x.url===event.target.value);if(o)setEntry(i,{url:o.url,purpose:'character',assetId:entry.assetId,stageId:entry.stageId,...(o.variant?{variant:o.variant}:{}),...(o.assetRecordId?{assetRecordId:o.assetRecordId}:{})});}}/>;})()}
      </div>)}
      <IDESelect title="添加参考素材" value="" placeholder="添加已绑定的参考素材…" className="w-full text-xs" disabled={!editable} options={choices.filter(c=>!plan.entries.some(e=>e.url===c.url)).map(c=>({value:key(c),label:`${REFERENCE_PURPOSES[c.purpose as keyof typeof REFERENCE_PURPOSES]} · ${label(c)}`}))} onChange={e=>{const entry=choices.find(c=>key(c)===e.target.value);if(entry)commit({...plan,entries:[...plan.entries,entry]});}}/>
      {outOfSync&&<button type="button" disabled={!editable} className="ide-btn-secondary rounded px-3 py-1.5 w-full" onClick={()=>{const draft=referenceDraft(state.bible,shot,refs,pose);commit({...draft,actors:plan.actors,entries:draft.entries.map(e=>plan.entries.find(p=>p.url===e.url)||e)});}}>按当前已选图片核对用途</button>}
      {plan.actors.some(binding=>!pose?.scene.actors.some(actor=>actor.id===binding.actorId))&&<button type="button" disabled={!editable} className="ide-btn-secondary rounded px-3 py-1.5 w-full" onClick={()=>commit({...plan,actors:plan.actors.filter(binding=>pose?.scene.actors.some(actor=>actor.id===binding.actorId))})}>清理已移除人偶的绑定</button>}
      {pose&&<div className="space-y-2 border-t border-zinc-800 pt-3"><h5 className="text-zinc-300">人偶与角色造型</h5><p className="text-[10px] text-zinc-500">编号对应编辑器中的人偶；站位以当前相机为准。一人偶绑定一角色，造型明确对应。</p>{pose.scene.actors.map((actor,index)=>{const binding=plan.actors.find(a=>a.actorId===actor.id),yaw=pose.scene.camera.yaw*Math.PI/180,x=actor.position[0]*Math.cos(yaw)-actor.position[2]*Math.sin(yaw);return <div key={actor.id} className="space-y-1"><span className="text-[10px] text-zinc-400">人偶 {index+1} · 相机横向 {x.toFixed(2)}</span><IDESelect title={`人偶 ${index+1} 角色造型`} value={binding?JSON.stringify(['character',binding.characterId,binding.stageId||'']):''} placeholder="请选择角色造型" className="w-full text-xs" disabled={!editable} options={[{value:'',label:'未绑定'},...plan.entries.filter(e=>e.purpose==='character'&&e.assetId).map(e=>({value:key(e),label:label(e)}))]} onChange={e=>{const identity=plan.entries.find(c=>key(c)===e.target.value&&c.purpose==='character');commit({...plan,actors:[...plan.actors.filter(a=>a.actorId!==actor.id),...(identity?[{actorId:actor.id,characterId:identity.assetId!,stageId:identity.stageId}]:[])]});}}/></div>;})}</div>}
    </>}
    {(stored||pose)&&issue&&<p role="status" className="text-[10px] text-zinc-400 leading-relaxed">待核对：{issue}。草稿保留，生成前会拦截。</p>}
    {stored&&!issue&&<details className="text-[10px] text-zinc-400"><summary className="cursor-pointer py-1">查看实际发送的参考用途指令</summary><pre className="whitespace-pre-wrap break-words mt-2 leading-relaxed max-h-52 overflow-y-auto">{compiled}</pre></details>}
    {!editable&&<p className="text-[10px] text-zinc-500">{busy?'生成期间不能修改参考用途。':'当前窗口只读，接管后可编辑。'}</p>}
  </section>;
}
