import {useEffect,useEffectEvent,useMemo,useRef,useState} from 'react';
import {Check,ChevronDown,ChevronRight,Loader2,RefreshCw,Search} from 'lucide-react';
import {IDESelect} from '../../components/Common/IDESelect';
import {loadPosePresetCatalog,loadPosePresetChannels,type PosePresetChannel} from '../../services/posePresetLibrary';
import {VNCCS_EXPECTED_POSE_COUNT,type PosePresetCatalog,type PosePresetRecord} from './posePresetSpec';

/**
 * 内嵌姿势库：搜索 + 分类 + 定高网格，单击选中、双击或按钮应用到当前人偶。
 * 目录从 ComfyUI 的 VNCCS 姿势库只读载入，打开即自动载入，不写回远端。
 */
export function PosePresetPicker({disabled,onApply}:{disabled:boolean;onApply:(preset:PosePresetRecord)=>void}) {
  const [channels,setChannels]=useState<PosePresetChannel[]>([]),[channelId,setChannelId]=useState('');
  const [catalog,setCatalog]=useState<PosePresetCatalog>(),[selectedId,setSelectedId]=useState('');
  const [loadingChannels,setLoadingChannels]=useState(true),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [query,setQuery]=useState(''),[category,setCategory]=useState('全部'),[collapsed,setCollapsed]=useState(false);
  const request=useRef(0);
  const load=async(id=channelId)=>{
    if(!id)return;
    const token=++request.current;
    setLoading(true);setError('');
    try{const next=await loadPosePresetCatalog(id);if(token!==request.current)return;setCatalog(next);setSelectedId(current=>next.presets.some(item=>item.id===current)?current:'');}
    catch(reason){if(token===request.current)setError(reason instanceof Error?reason.message:'姿势目录读取失败');}
    finally{if(token===request.current)setLoading(false);}
  };
  const loadFirst=useEffectEvent((id:string)=>{void load(id);});
  // 读取可用渠道后自动载入第一个渠道的目录；只读请求，不修改远端姿势库。切换渠道由选择器显式触发。
  useEffect(()=>{let active=true;const pending=request;void loadPosePresetChannels().then(items=>{if(!active)return;setChannels(items);const first=items[0]?.id||'';setChannelId(current=>current||first);if(first)loadFirst(first);},reason=>{if(active)setError(reason instanceof Error?reason.message:'姿势库渠道读取失败');}).finally(()=>{if(active)setLoadingChannels(false);});return()=>{active=false;pending.current++;};},[]);
  const categories=useMemo(()=>{const counts=new Map<string,number>();for(const item of catalog?.presets||[])counts.set(item.category,(counts.get(item.category)||0)+1);return [['全部',catalog?.presets.length||0] as const,...counts.entries()];},[catalog]);
  const keyword=query.trim().toLocaleLowerCase();
  const filtered=useMemo(()=>(catalog?.presets||[]).filter(item=>(category==='全部'||item.category===category)&&(!keyword||`${item.label} ${item.name} ${item.category} ${item.sourceLabel}`.toLocaleLowerCase().includes(keyword))),[catalog,category,keyword]);
  const selected=catalog?.presets.find(item=>item.id===selectedId);
  const apply=(preset:PosePresetRecord|undefined)=>{if(preset&&!disabled)onApply(preset);};
  const filtering=!!keyword||category!=='全部';
  const status=loading?'载入中':catalog?(filtering?`${filtered.length} 项`:`${catalog.presets.length}/${VNCCS_EXPECTED_POSE_COUNT}`):loadingChannels?'读取中':'未载入';
  return <section className="pose-library" aria-label="预设姿势库">
    <div className="pose-library-title">
      <button type="button" className="pose-library-toggle" aria-expanded={!collapsed} onClick={()=>setCollapsed(value=>!value)}>{collapsed?<ChevronRight size={13}/>:<ChevronDown size={13}/>}<span>预设姿势库</span><em>{status}</em></button>
      {catalog&&!collapsed&&<button type="button" className="pose-library-refresh" title="重新读取 ComfyUI 姿势目录" disabled={disabled||loading||!channelId} onClick={()=>void load()}>{loading?<Loader2 size={12} className="animate-spin"/>:<RefreshCw size={12}/>}<span className="pose-library-refresh-label">刷新目录</span></button>}
    </div>
    {!collapsed&&<>
      {loadingChannels?<p role="status" className="pose-hint"><Loader2 size={12} className="animate-spin"/>正在读取 ComfyUI 渠道…</p>
        :!channels.length?<p className="pose-hint">配置中心尚无已启用的 ComfyUI 图像渠道；姿势库由该 ComfyUI 上的 VNCCS 节点提供。</p>
        :channels.length>1&&<div className="pose-library-channel"><IDESelect title="姿势库渠道" value={channelId} disabled={disabled||loading} onChange={event=>{setChannelId(event.target.value);setCatalog(undefined);setSelectedId('');void load(event.target.value);}} className="w-full text-xs" options={channels.map(channel=>({value:channel.id,label:`${channel.name} / ${channel.model}`}))}/></div>}
      {loading&&!catalog&&<p role="status" className="pose-hint"><Loader2 size={12} className="animate-spin"/>正在从 ComfyUI 读取姿势目录…</p>}
      {catalog&&<>
        <div className="pose-library-search"><Search size={13}/><input value={query} onChange={event=>setQuery(event.target.value)} aria-label="搜索预设姿势" placeholder="搜索姿势、分类或来源"/><span>显示 {filtered.length} / {catalog.presets.length}</span></div>
        <div className="pose-library-categories" role="group" aria-label="姿势分类">{categories.map(([item,count])=><button key={item} type="button" aria-pressed={category===item} onClick={()=>setCategory(item)}>{item.replace(/姿态$/,'')}<small>{count}</small></button>)}</div>
        <div className="pose-library-grid" role="listbox" aria-label="预设姿势目录">
          {filtered.map(item=><button type="button" role="option" aria-selected={item.id===selectedId} key={item.id} title={`${item.label} · ${item.sourceLabel}（双击应用）`} disabled={disabled} onClick={()=>setSelectedId(item.id)} onDoubleClick={()=>{setSelectedId(item.id);apply(item);}}><strong>{item.label}</strong><small>{item.sourceLabel}</small></button>)}
          {!filtered.length&&<p>没有匹配的预设姿势</p>}
        </div>
        <div className="pose-library-actions"><span>{selected?`已选：${selected.label} · ${selected.sourceLabel}`:'单击选择姿势，双击直接应用'}</span><button type="button" className="ide-btn-primary" disabled={disabled||!selected} onClick={()=>apply(selected)}><Check size={12}/>应用到当前人偶</button></div>
      </>}
      {catalog&&!catalog.complete&&<p role="alert" className="pose-error">姿势库未完整同步：已读取 {catalog.presets.length}/{catalog.expected}，缺少 {catalog.missing.length} 项。现有姿势仍可使用。</p>}
      {error&&<p role="alert" className="pose-error">{error}{channelId&&<button type="button" className="pose-library-retry" onClick={()=>void load()}>重试</button>}</p>}
    </>}
  </section>;
}
