import {lazy, Suspense, useState} from 'react';
import {ReferencePurposePanel} from './ReferencePurposePanel';
import {Box, Loader2, Sparkles, Trash2} from 'lucide-react';
import {useProjectStore} from '../../store/useProjectStore';
import {confirmDialog} from '../../store/useDialogStore';
import {mediaImageUrl} from '../../utils/mediaImages';
import {changePose} from './bridge';
import {assertPose, poseReady, poseStateSignature, type PoseReference, type PoseExtensions} from './model';
import {poseMatchIssue} from './posePresetMatch';
import {isAdultProject} from '../../utils/contentPolicy';
import {beginNodeRun} from '../../services/runTrace';
const PoseEditorModal=lazy(()=>import('./PoseEditorModal'));

/** 扩展唯一入口：画布与分镜均通过此面板访问同一份镜头姿态。 */
export function PoseReferencePanel({nodeId,shotId,aspectRatio}:{nodeId?:string;shotId?:string;aspectRatio?:string}) {
  const owner=useProjectStore(s=>s.projectId),access=useProjectStore(s=>s.syncAccess);
  const pose=useProjectStore(s=>{
    const node=s.nodes.find(n=>n.id===nodeId),shot=s.shots.find(shot=>shot.id===(shotId||node?.data.shotId));
    return (shot?shot.extensions?.pose3d:(node?.data.extensions as PoseExtensions|undefined)?.pose3d) as PoseReference|undefined;
  });
  const busy=useProjectStore(s=>{const relatedShot=shotId||s.nodes.find(n=>n.id===nodeId)?.data.shotId;return s.nodes.some(n=>(relatedShot?n.data.shotId===relatedShot:n.id===nodeId)&&(n.data.isGenerating||n.data.videoJobStatus==='pending'));});
  const shotKey=useProjectStore(s=>shotId||s.nodes.find(n=>n.id===nodeId)?.data.shotId as string|undefined);
  // 预设姿势库仅在成人向工程提供；单人且无姿态的镜头可一键匹配。
  const matchIssue=useProjectStore(s=>{if(!shotKey||!isAdultProject(s.bible.config))return '不可用';const shot=s.shots.find(item=>item.id===shotKey);return shot?poseMatchIssue(s.bible,shot):'不可用';});
  const runNode=useProjectStore(s=>nodeId||s.nodes.find(n=>n.type==='imageToImageNode'&&n.data.shotId===shotKey)?.id||s.nodes.find(n=>n.type==='episodeStoryboardNode')?.id);
  const [matching,setMatching]=useState(false);
  const [open,setOpen]=useState(false),legacy=!!pose&&!pose.scene?.rig,ready=poseReady(pose),editable=['editing','offline'].includes(access)&&!busy;
  const target={projectId:owner,nodeId,shotId};
  let invalid='';try{if(pose)assertPose(pose.scene);}catch(e){invalid=e instanceof Error?e.message:'姿态数据无效';}
  const remove=async()=>{
    const expected=poseStateSignature(pose);
    if(!await confirmDialog({title:'移除姿态参考？',description:'移除本镜头或节点的姿态草稿和参考绑定。其他素材、历史生成结果与已采用视频保持不变。',danger:true,confirmLabel:'移除姿态'}))return;
    try{changePose(target,undefined,expected);}catch(error){useProjectStore.getState().addToast({type:'error',title:'姿态未移除',description:String(error instanceof Error?error.message:error)});}
  };
  const autoMatch=async()=>{
    if(matching||!shotKey)return;
    setMatching(true);
    const run=runNode?beginNodeRun(runNode,'匹配预设姿势'):undefined,toast=useProjectStore.getState().addToast;
    try{
      const {autoBindPresetPoses}=await import('./autoPose');
      const result=await autoBindPresetPoses({shotIds:[shotKey],aspectRatio,nodeId:runNode});
      if(result.bound.length){run?.done();toast({type:'success',title:'已绑定预设姿势',description:`${result.bound[0].label}；可在姿态编辑器中改选或微调。`});}
      else{const reason=result.skipped[0]?.reason||'未匹配到预设姿势';run?.settle(reason);toast({type:'info',title:'未绑定姿势',description:reason});}
    }catch(error){run?.fail(error);toast({type:'error',title:'姿势匹配失败',description:error instanceof Error?error.message:String(error)});}
    finally{run?.settle();setMatching(false);}
  };
  return <section className="nodrag nopan rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 space-y-2" aria-label="三维姿态参考">
    <div className="flex items-center gap-2 flex-wrap"><Box className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true"/><span className="text-xs text-zinc-200 flex-1">姿态与构图</span><span className="text-[10px] text-zinc-500">{legacy?'旧版姿态参考':ready?'已绑定参考图':pose?'草稿待绑定':'可选参考'}</span>{pose?.preset&&<span className="w-full text-[10px] text-zinc-400">预设：{pose.preset.label}{pose.preset.source==='auto'?'（自动匹配）':'（姿势库）'} · 可在编辑器左侧姿势库改选，保存后替换参考图</span>}</div>
    <div className="flex items-center gap-2">
      {ready&&<img src={mediaImageUrl(pose!.render!.url)} alt="已绑定的中性人偶姿态" className="w-12 h-12 rounded border border-zinc-800 object-contain bg-zinc-900"/>}
      <p className="text-[10px] text-zinc-500 flex-1 leading-relaxed">{legacy?'旧白模及参考图原样保留；重新编辑并保存后升级为完整人体。':pose&&!ready?'姿态已更改。保存并绑定参考图后，再生成候选。':'用完整中性人体控制姿态与机位；人物身份仍由定妆参考提供。'}</p>
    </div>
    {invalid&&<p role="alert" className="text-[10px] text-zinc-300">姿态数据异常：{invalid}。请先导出工程备份；原数据保留，未重置。</p>}
    <div className="flex gap-2"><button type="button" className="ide-btn-secondary rounded px-3 py-1.5 text-xs flex-1 disabled:opacity-40" disabled={!editable||!!invalid} onClick={()=>setOpen(true)}>{pose?'继续编辑姿态':'打开三维姿态编辑器'}</button>{pose&&<button type="button" aria-label="移除姿态参考" title="移除姿态参考" disabled={!editable} onClick={remove} className="ide-btn-secondary rounded px-2 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5"/></button>}</div>
    {!pose&&matchIssue===undefined&&<button type="button" className="ide-btn-secondary rounded px-3 py-1.5 text-xs w-full flex items-center justify-center gap-1.5 disabled:opacity-40" disabled={!editable||matching||access!=='editing'} onClick={()=>void autoMatch()}>{matching?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<Sparkles className="w-3.5 h-3.5"/>}{matching?'正在匹配预设姿势…':'按镜头动作自动匹配预设姿势'}</button>}
    {!editable&&<p className="text-[10px] text-zinc-500">{busy?'生成期间暂不修改姿态。':'当前窗口只读，接管编辑权后可调整姿态。'}</p>}
    {!invalid&&<ReferencePurposePanel nodeId={nodeId} shotId={shotId}/>}
    {open&&!invalid&&<Suspense fallback={<p role="status" className="text-xs text-zinc-400">正在载入三维编辑器…</p>}><PoseEditorModal key={`${owner}:${shotId||nodeId}`} target={target} aspectRatio={aspectRatio} onClose={()=>setOpen(false)}/></Suspense>}
  </section>;
}
