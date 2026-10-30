export interface HumanBone {name:string;parent:number;head:[number,number,number];tail:[number,number,number]}
export interface HumanMeshData {bones:HumanBone[];positions:Float32Array;indices:Uint16Array;skinIndices:Uint16Array;skinWeights:Float32Array}
/** 只解析受限二进制网格，不执行脚本，不接受模型内的远程资源或纹理。 */
export function decodeHumanMesh(buffer:ArrayBuffer):HumanMeshData {
  if(buffer.byteLength<16||buffer.byteLength>2_000_000)throw Error('人体网格文件大小无效');
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  if(new TextDecoder().decode(bytes.subarray(0,8))!=='CFHM0001')throw Error('人体网格文件头无效');
  const length=view.getUint32(8,true);
  if(length<1||length>100_000||12+length>bytes.length)throw Error('人体网格元数据长度无效');
  const meta=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+length))),offset=Math.ceil((12+length)/4)*4;
  if(meta.version!==1||!Array.isArray(meta.bones)||meta.bones.length!==53)throw Error('人体骨架版本或数量无效');
  const range=(key:string,size:number)=>{const d=meta[key];if(!d||!Number.isSafeInteger(d.offset)||!Number.isSafeInteger(d.length)||d.offset<0||d.length<1||(offset+d.offset)%size!==0||offset+d.offset+d.length*size>bytes.length)throw Error('人体网格数组越界');return [offset+d.offset,d.length] as const;};
  const positions=new Float32Array(buffer,...range('positions',4)),indices=new Uint16Array(buffer,...range('indices',2)),skinIndices=new Uint16Array(buffer,...range('skinIndices',2)),skinWeights=new Float32Array(buffer,...range('skinWeights',4)),count=positions.length/3;
  if(!Number.isInteger(count)||count<1000||count>60_000||indices.length%3!==0||skinIndices.length!==count*4||skinWeights.length!==count*4)throw Error('人体网格顶点或蒙皮数量不匹配');
  if(positions.some(v=>!Number.isFinite(v)||Math.abs(v)>5)||indices.some(v=>v>=count)||skinIndices.some(v=>v>=53)||skinWeights.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('人体网格索引或权重无效');
  for(let i=0;i<skinWeights.length;i+=4)if(Math.abs(skinWeights[i]+skinWeights[i+1]+skinWeights[i+2]+skinWeights[i+3]-1)>.001)throw Error('人体蒙皮权重未归一化');
  const names=new Set<string>();
  for(const [index,b]of meta.bones.entries()){
    if(!b||typeof b.name!=='string'||names.has(b.name)||!Number.isInteger(b.parent)||b.parent< -1||b.parent>=index)throw Error('人体骨架层级无效');names.add(b.name);
    for(const point of [b.head,b.tail])if(!Array.isArray(point)||point.length!==3||point.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>5))throw Error('人体骨骼锚点无效');
  }
  return {bones:meta.bones,positions,indices,skinIndices,skinWeights};
}
