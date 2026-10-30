import React, {useRef, useEffect, useState} from 'react';
import {Handle, Position} from '@xyflow/react';
import {Activity, Camera, Check, Trash2} from 'lucide-react';
import {useProjectStore} from '../../store/useProjectStore';
import {canvasPoint} from '../../utils/canvasPointer';

interface Joint {
  id: number;
  name: string;
  x: number;
  y: number;
  color: string;
}

const LIMB_CONNECTIONS = [
  [0, 1], // Nose -> Neck
  [1, 2], // Neck -> RShoulder
  [2, 3], // RShoulder -> RElbow
  [3, 4], // RElbow -> RWrist
  [1, 5], // Neck -> LShoulder
  [5, 6], // LShoulder -> LElbow
  [6, 7], // LElbow -> LWrist
  [1, 8], // Neck -> MidHip
  [8, 9], // MidHip -> RHip
  [9, 10], // RHip -> RKnee
  [10, 11], // RKnee -> RAnkle
  [8, 12], // MidHip -> LHip
  [12, 13], // LHip -> LKnee
  [13, 14], // LKnee -> LAnkle
];

// OpenPose 经典 18 节点坐标
const DEFAULT_JOINTS: Joint[] = [
  { id: 0, name: 'Nose', x: 140, y: 35, color: '#e4e4e7' },
  { id: 1, name: 'Neck', x: 140, y: 55, color: '#d4d4d8' },
  { id: 2, name: 'RShoulder', x: 110, y: 60, color: '#a1a1aa' },
  { id: 3, name: 'RElbow', x: 95, y: 95, color: '#a1a1aa' },
  { id: 4, name: 'RWrist', x: 85, y: 130, color: '#a1a1aa' },
  { id: 5, name: 'LShoulder', x: 170, y: 60, color: '#a1a1aa' },
  { id: 6, name: 'LElbow', x: 185, y: 95, color: '#a1a1aa' },
  { id: 7, name: 'LWrist', x: 195, y: 130, color: '#a1a1aa' },
  { id: 8, name: 'MidHip', x: 140, y: 115, color: '#71717a' },
  { id: 9, name: 'RHip', x: 120, y: 120, color: '#71717a' },
  { id: 10, name: 'RKnee', x: 115, y: 155, color: '#71717a' },
  { id: 11, name: 'RAnkle', x: 115, y: 195, color: '#71717a' },
  { id: 12, name: 'LHip', x: 160, y: 120, color: '#71717a' },
  { id: 13, name: 'LKnee', x: 165, y: 155, color: '#71717a' },
  { id: 14, name: 'LAnkle', x: 165, y: 195, color: '#71717a' },
];

export const OpenPoseNode: React.FC<{ id: string; data: any; selected?: boolean }> = ({id, data, selected}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const source: Joint[] = data.joints || DEFAULT_JOINTS;
  const [jointDraft, setJointDraft] = useState<{source: Joint[]; value: Joint[]} | null>(null);
  const joints = jointDraft?.source === source ? jointDraft.value : source;
  const setJoints = (next: React.SetStateAction<Joint[]>) => setJointDraft({source, value: typeof next === 'function' ? next(joints) : next});
  const drag=useRef<{pointerId:number; jointId:number; joints:Joint[]} | null>(null);
  const [copied, setCopied] = useState(false);
  const {updateNodeData, removeNode} = useProjectStore();

  const drawPose = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#09090b'; // zinc-950
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 3;
    LIMB_CONNECTIONS.forEach(([startId, endId]) => {
      const start = joints.find((j) => j.id === startId);
      const end = joints.find((j) => j.id === endId);
      if (start && end) {
        ctx.strokeStyle = '#52525b'; // zinc-600
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    });

    joints.forEach((j) => {
      ctx.fillStyle = j.color;
      ctx.beginPath();
      ctx.arc(j.x, j.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#18181b';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }, [joints]);

  useEffect(() => {
    drawPose();
  }, [drawPose]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if(!e.isPrimary || e.button!==0)return;
    const canvas=e.currentTarget,point=canvasPoint(canvas,e.clientX,e.clientY);
    const clicked=joints.find(j=>Math.hypot(j.x-point.x,j.y-point.y)<=18);
    if(clicked){drag.current={pointerId:e.pointerId,jointId:clicked.id,joints};canvas.setPointerCapture(e.pointerId);}
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const active=drag.current;if(!active || active.pointerId!==e.pointerId)return;
    const canvas=e.currentTarget,point=canvasPoint(canvas,e.clientX,e.clientY);
    const next=active.joints.map(j=>j.id===active.jointId?{...j,x:Math.max(10,Math.min(canvas.width-10,point.x)),y:Math.max(10,Math.min(canvas.height-10,point.y))}:j);
    active.joints=next;setJoints(next);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const active=drag.current;if(!active || active.pointerId!==e.pointerId)return;
    drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    updateNodeData(id,{joints:active.joints});
  };

  const handleExportPose = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    updateNodeData(id, { posePreviewUrl: url });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const applyPreset = (type: 'standing' | 'umbrella_walk') => {
    if (type === 'standing') {
      setJoints(DEFAULT_JOINTS);
      updateNodeData(id, { joints: DEFAULT_JOINTS });
    } else if (type === 'umbrella_walk') {
      const walk: Joint[] = DEFAULT_JOINTS.map((j) => {
        if (j.id === 4) return { ...j, x: 70, y: 70 };
        if (j.id === 10) return { ...j, x: 100, y: 150 };
        if (j.id === 11) return { ...j, x: 90, y: 190 };
        if (j.id === 13) return { ...j, x: 180, y: 155 };
        if (j.id === 14) return { ...j, x: 185, y: 195 };
        return j;
      });
      setJoints(walk);
      updateNodeData(id, { joints: walk });
    }
  };

  return (
    <div
      className={`w-72 rounded-xl bg-zinc-900 border transition-all duration-150 overflow-hidden shadow-xl ${
        selected ? 'border-zinc-400 ring-1 ring-zinc-400' : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2.5 h-2.5 !bg-zinc-400 border-2 !border-zinc-950 shadow-sm"
      />

      <div className="bg-zinc-950 px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-200">OpenPose 姿态锁定</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExportPose}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded ide-btn-secondary"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Camera className="w-3 h-3 text-zinc-400" />}
            <span>{copied ? '已提取' : '提取姿态'}</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeNode(id);
            }}
            className="p-1 rounded hover:bg-rose-950/70 text-zinc-500 hover:text-rose-400 transition-colors"
            title="删除节点 (Del)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-2 flex flex-col items-center bg-zinc-950">
        <canvas
          ref={canvasRef}
          width={280}
          height={210}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
          aria-label="拖动姿态关节"
          className="nodrag nopan nowheel touch-none max-w-full h-auto border border-zinc-800 rounded-lg cursor-crosshair shadow-inner"
        />
      </div>

      <div className="p-2 bg-zinc-950/80 border-t border-zinc-800 flex items-center justify-between gap-1 text-[11px]">
        <span className="text-[10px] text-zinc-500">预设姿态:</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => applyPreset('standing')}
            className="px-2 py-0.5 rounded ide-btn-secondary text-[10px]"
          >
            自然站立
          </button>
          <button
            onClick={() => applyPreset('umbrella_walk')}
            className="px-2 py-0.5 rounded ide-btn-secondary text-[10px]"
          >
            撑伞迈步
          </button>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-2.5 h-2.5 !bg-zinc-400 border-2 !border-zinc-950 shadow-sm"
      />
    </div>
  );
};
