import {useEffect, useEffectEvent, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Box, Check, Loader2, RotateCcw, X} from 'lucide-react';
import {useProjectStore} from '../../store/useProjectStore';
import {IDESelect} from '../../components/Common/IDESelect';
import {changePose, bindPoseRender} from './bridge';
import {poseTarget, type PoseTarget} from './binding';
import {createPoseStage} from './stage';
import {defaultPose, neutralActor, JOINT_LABELS, posePreset, poseReady, humanScene, handPreset, applyPosePresetBones, keepPosePreset, type PoseScene, type PoseJoint} from './model';
import {JOINT_GROUPS,jointGroup,jointLimits,clampJointRotation,PROPORTION_LABELS,proportionLimits,type HumanProportions} from './rigDefinition';
import {isAdultProject} from '../../utils/contentPolicy';
import {PosePresetPicker} from './PosePresetPicker';
import './pose3d.css';

function Slider({label,value,min=-180,max=180,onChange,disabled=false}:{label:string;value:number;min?:number;max?:number;onChange:(value:number)=>void;disabled?:boolean}) {
  return <label className="pose-slider"><span>{label}<output>{Number(value.toFixed(2))}</output></span><input type="range" aria-label={label} min={min} max={max} step={max<=3?.01:max<=12?.1:1} value={value} disabled={disabled} onChange={e=>onChange(Number(e.target.value))}/></label>;
}
export default function PoseEditorModal({target,aspectRatio,onClose}:{target:PoseTarget;aspectRatio?:string;onClose:()=>void}) {
  const projectId=useProjectStore(s=>s.projectId),access=useProjectStore(s=>s.syncAccess),saveStatus=useProjectStore(s=>s.autoSaveStatus);
  const adult=useProjectStore(s=>isAdultProject(s.bible.config));
  const pose=useProjectStore(s=>{try{return poseTarget(s,target).pose;}catch{return undefined;}});
  const [initial]=useState(()=>defaultPose(aspectRatio));
  const scene=useMemo(()=>humanScene(pose?.scene||initial),[pose?.scene,initial]);
  const [actorId,setActorId]=useState(scene.actors[0].id),[joint,setJoint]=useState<PoseJoint>('torso');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[stageError,setStageError]=useState(''),[meshReady,setMeshReady]=useState(false),[showSkeleton,setShowSkeleton]=useState(false);
  const host=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDivElement>(null),stage=useRef<ReturnType<typeof createPoseStage>|null>(null),saving=useRef(false);
  const actor=scene.actors.find(a=>a.id===actorId)||scene.actors[0];
  const relatedBusy=useProjectStore(s=>{const n=s.nodes.find(n=>n.id===target.nodeId),shotId=target.shotId||n?.data.shotId;return s.nodes.some(n=>(shotId?n.data.shotId===shotId:n.id===target.nodeId)&&(n.data.isGenerating||n.data.videoJobStatus==='pending'));});
  const editable=['editing','offline'].includes(access)&&!busy&&!relatedBusy&&meshReady,legacy=!!pose&&!pose.scene.rig,ready=!legacy&&poseReady(pose),group=jointGroup(joint),[jointMin,jointMax]=jointLimits(joint);
  const reportStageError=useEffectEvent((e:unknown)=>setStageError(e instanceof Error?e.message:'三维预览启动失败'));
  const pick=useEffectEvent((id:string,k:PoseJoint)=>{setActorId(id);setJoint(k);});
  const orbit=useEffectEvent((value:PoseScene['camera'])=>{try{if(editable)changePose(target,keepPosePreset(pose,{...scene,camera:value}));else stage.current?.update(scene,actor.id,joint,showSkeleton,false);}catch(e){setError(e instanceof Error?e.message:'机位未保存');}});
  const rotateJoint=useEffectEvent((id:string,key:PoseJoint,value:[number,number,number])=>{try{if(!editable)return;changePose(target,keepPosePreset(pose,{...scene,actors:scene.actors.map(a=>a.id===id?{...a,joints:{...a.joints,[key]:clampJointRotation(key,value)}}:a)}));}catch(e){setError(e instanceof Error?e.message:'关节未保存');}});
  useEffect(()=>{
    let active=true;
    try{if(host.current){const instance=createPoseStage(host.current,(id,k)=>pick(id,k),value=>orbit(value),(id,key,value)=>rotateJoint(id,key,value));stage.current=instance;void instance.ready.then(()=>{if(active)setMeshReady(true);},e=>{if(active)reportStageError(e);});}}catch(e){queueMicrotask(()=>{if(active)reportStageError(e);});}
    return ()=>{active=false;stage.current?.dispose();stage.current=null;};
  },[]);
  useEffect(()=>{try{stage.current?.update(scene,actor.id,joint,showSkeleton,editable);}catch(e){queueMicrotask(()=>reportStageError(e));}},[scene,actor.id,joint,showSkeleton,editable]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();
    const handle=(event:KeyboardEvent)=>{
      if(event.key!=='Tab')return;
      const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')||[]).filter(el=>el.getClientRects().length);
      if(!controls.length){event.preventDefault();return;}
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first.focus();}
    };
    const element=dialog.current;element?.addEventListener('keydown',handle);
    return ()=>{element?.removeEventListener('keydown',handle);if(previous?.isConnected)previous.focus();};
  },[]);
  const change=(value:PoseScene,preset?:{id:string;label:string})=>{if(!editable)return;try{changePose(target,preset?{scene:value,preset:{...preset,actorId:actor.id,source:'library'}}:keepPosePreset(pose,value));setError('');}catch(e){setError(e instanceof Error?e.message:'姿态更新失败');}};
  const updateActor=(patch:Partial<typeof actor>)=>change({...scene,actors:scene.actors.map(a=>a.id===actor.id?{...a,...patch}:a)});
  const camera=(patch:Partial<PoseScene['camera']>)=>change({...scene,camera:{...scene.camera,...patch}});
  const save=async()=>{
    if(saving.current)return;saving.current=true;setBusy(true);setError('');
    try{await bindPoseRender(target,scene,()=>{if(!stage.current)throw Error('三维预览尚未就绪');stage.current.update(scene,actor.id,joint,showSkeleton,false);return stage.current.capture();},keepPosePreset(pose,scene).preset);}
    catch(e){setError(e instanceof Error?e.message:'参考图保存失败，姿态草稿保留');}
    finally{saving.current=false;setBusy(false);}
  };
  if(projectId!==target.projectId)return null;
  return createPortal(<div className="pose-overlay nodrag nopan" onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="pose-editor-title" tabIndex={-1} className="pose-dialog" onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.stopPropagation();onClose();}}}>
      <header className="pose-header"><div><h2 id="pose-editor-title"><Box size={17} aria-hidden="true"/>姿态与镜头构图</h2><p>中性人偶参考 · 草稿随工程保存 · 此处不执行生成</p></div><button type="button" aria-label="关闭姿态编辑器" disabled={busy} onClick={onClose}><X size={19}/></button></header>
      <div className={adult?'pose-body pose-body-with-library':'pose-body'}>
        {/* 左栏：预设姿势库（仅成人向）；窄屏下排到视口之后。 */}
        {adult&&<aside className="pose-library-column" aria-label="预设姿势库栏"><PosePresetPicker disabled={!editable} onApply={preset=>change(applyPosePresetBones(scene,actor.id,preset.bones),preset)}/></aside>}
        <section className="pose-view-section" aria-label="三维取景"><div className="pose-view-toolbar"><span>{scene.aspectRatio} 取景框</span><span>{JOINT_LABELS[joint]} · 圆环旋转 / 拖动环绕 / 滚轮缩放</span></div><div className="pose-viewport-wrap"><div ref={host} className="pose-viewport"/>{!meshReady&&!stageError&&<p className="pose-mesh-loading" role="status"><Loader2 size={18} className="animate-spin"/>正在加载完整人体网格…</p>}</div>{stageError&&<p role="alert" className="pose-error">三维预览不可用：{stageError}。姿态草稿保留，可关闭后重试。</p>}<div className="pose-presets" role="group" aria-label="中性姿态预设">{([['neutral','正立'],['wave','抬手'],['walk','行走'],['seated','坐姿']] as const).map(([key,label])=><button type="button" disabled={!editable} key={key} onClick={()=>change(posePreset(scene,actor.id,key))}>{label}</button>)}<button type="button" aria-pressed={showSkeleton} disabled={!meshReady} onClick={()=>setShowSkeleton(!showSkeleton)}>{showSkeleton?'隐藏骨架':'显示骨架'}</button><span>真实人体蒙皮 · 53 根骨骼 · 参考引导不等同于生成骨架强约束</span></div></section>
        <aside className="pose-controls" aria-label="姿态参数">
          <section><h3>人偶与关节</h3><div className="pose-control-row"><IDESelect title="选择人偶" value={actor.id} disabled={!editable} onChange={e=>setActorId(e.target.value)}>{scene.actors.map((a,i)=><option key={a.id} value={a.id}>人偶 {i+1}</option>)}</IDESelect><button type="button" disabled={!editable||scene.actors.length>=4} onClick={()=>{const id=crypto.randomUUID();change({...scene,actors:[...scene.actors,{...neutralActor(id),position:[Math.min(3,scene.actors.length*.65),0,0]}]});setActorId(id);}}>添加人偶</button><button type="button" disabled={!editable||scene.actors.length<=1} onClick={()=>{change({...scene,actors:scene.actors.filter(a=>a.id!==actor.id)});setActorId(scene.actors.find(a=>a.id!==actor.id)!.id);}}>移除</button></div>
            <IDESelect title="身体部位" value={group} disabled={!editable} onChange={e=>setJoint((Object.keys(JOINT_LABELS) as PoseJoint[]).find(key=>jointGroup(key)===e.target.value)!)}>{JOINT_GROUPS.map(label=><option key={label} value={label}>{label}</option>)}</IDESelect>
            <IDESelect title="选择关节" value={joint} disabled={!editable} onChange={e=>setJoint(e.target.value)}>{Object.entries(JOINT_LABELS).filter(([key])=>jointGroup(key as PoseJoint)===group).map(([key,label])=><option key={key} value={key}>{label}</option>)}</IDESelect>
            {(['屈伸','扭转','侧摆'] as const).map((label,i)=><Slider key={label} label={`${JOINT_LABELS[joint]}${label}`} value={actor.joints[joint][i]} min={jointMin[i]} max={jointMax[i]} disabled={!editable} onChange={v=>{const rotation=[...actor.joints[joint]] as [number,number,number];rotation[i]=v;updateActor({joints:{...actor.joints,[joint]:clampJointRotation(joint,rotation)}});}}/>)}
          </section>
          {(group==='左手'||group==='右手')&&<section><h3>手势快捷调整</h3><div className="pose-control-row">{([['open','张手'],['relaxed','放松'],['fist','握拳'],['point','指向']] as const).map(([key,label])=><button key={key} type="button" disabled={!editable} onClick={()=>change(handPreset(scene,actor.id,group==='左手'?'left':'right',key))}>{label}</button>)}</div><p className="pose-hint">快捷手势只更新当前人偶这一只手的指节，可继续逐节微调。</p></section>}
          <section><h3>人体比例</h3>{(Object.keys(PROPORTION_LABELS) as (keyof HumanProportions)[]).map(key=>{const [min,max]=proportionLimits(key);return <Slider key={key} label={PROPORTION_LABELS[key]} value={actor.proportions![key]} min={min} max={max} disabled={!editable} onChange={value=>updateActor({proportions:{...actor.proportions!,[key]:value}})}/>;})}</section>
          <section><h3>人物站位</h3>{['横向位置','上下位置','前后位置'].map((label,i)=><Slider key={label} label={label} value={actor.position[i]} min={-4} max={4} disabled={!editable} onChange={v=>{const position=[...actor.position] as [number,number,number];position[i]=v;updateActor({position});}}/>)}<Slider label="人物朝向" value={actor.yaw} disabled={!editable} onChange={v=>updateActor({yaw:v})}/></section>
          <section><h3>镜头取景</h3><IDESelect title="姿态参考画幅" value={scene.aspectRatio} disabled={!editable} onChange={e=>change({...scene,aspectRatio:e.target.value})}>{['16:9','9:16','1:1'].map(v=><option key={v} value={v}>{v}</option>)}</IDESelect><Slider label="相机环绕" value={scene.camera.yaw} disabled={!editable} onChange={v=>camera({yaw:v})}/><Slider label="相机俯仰" value={scene.camera.pitch} min={-70} max={70} disabled={!editable} onChange={v=>camera({pitch:v})}/><Slider label="相机距离" value={scene.camera.distance} min={2} max={12} disabled={!editable} onChange={v=>camera({distance:v})}/><Slider label="取景高度" value={scene.camera.targetHeight} min={0} max={3} disabled={!editable} onChange={v=>camera({targetHeight:v})}/><button type="button" disabled={!editable} className="pose-reset" onClick={()=>camera(defaultPose().camera)}><RotateCcw size={12}/>重置机位</button></section>
        </aside>
      </div>
      <footer className="pose-footer"><div aria-live="polite">{error?<p role="alert" className="pose-error">{error}</p>:<p>{access==='offline'?'离线草稿保留，联网后可保存参考图':access==='readonly'?'当前窗口只读，草稿保留':legacy?'旧版白模参考保留；保存后才替换为完整人体参考':ready?`参考图已绑定${pose?.preset?` · 预设：${pose.preset.label}`:''} · 后续通过生成按钮提交候选`:'调整完成后保存参考图，不会自动生成'}<small>{saveStatus==='saved'?'工程已同步':saveStatus==='error'?'工程保存异常，请先导出备份':'草稿随工程同步状态保存'}</small></p>}</div><div className="pose-footer-actions"><button type="button" disabled={busy} onClick={onClose}>完成编辑</button><button type="button" className="ide-btn-primary" disabled={!editable||access!=='editing'||!!stageError} onClick={save}>{busy?<Loader2 size={14} className="animate-spin"/>:<Check size={14}/>}保存并绑定参考图</button></div></footer>
    </div>
  </div>,document.body);
}
