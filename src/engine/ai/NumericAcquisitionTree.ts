import { ACQUISITION_WIDTH as W, AcquisitionField as F, acquireNumericShip, acquisitionSegmentEntry, type AcquisitionInput, type AcquisitionHit, type AcquisitionMesh } from './WeaponAcquisitionKernel';
import { coordinateLength } from '../math/Vector2';
interface Node { minX:number;maxX:number;minY:number;maxY:number;minVx:number;maxVx:number;minVy:number;maxVy:number;radius:number;left:number;right:number;start:number;end:number }
export const fireRewriteWork={trees:0,queries:0,sourceRows:0,candidates:0,phaseReads:0,relationshipReads:0,nearestQueries:0,nearestLeafRows:0,nearestSolves:0};
export const numericBlockerWork = { planes: 0, trees: 0, queries: 0, nodes: 0, segments: 0, blocked: 0, fallbacks: 0 };
/** Pure conservative acquisition over the admitted numeric plane. Exact range,
 * role, arc and contact remain in the original numeric kernel. */
export class NumericAcquisitionTree {
  private readonly rows:number[]=[];
  private readonly nodes:Node[]=[];
  constructor(private readonly a:Float64Array,eligible:Uint8Array,private readonly extents?:Float64Array) {
    for(let row=0;row<eligible.length;row++)if(eligible[row])this.rows.push(row);
    if(this.rows.length)this.build(0,this.rows.length);fireRewriteWork.trees++;
  }
  private build(start:number,end:number):number {
    const index=this.nodes.length,n:Node={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minVx:Infinity,maxVx:-Infinity,minVy:Infinity,maxVy:-Infinity,radius:0,left:-1,right:-1,start,end};
    for(let i=start;i<end;i++){const b=this.rows[i]*W;n.minX=Math.min(n.minX,this.a[b+F.X]);n.maxX=Math.max(n.maxX,this.a[b+F.X]);n.minY=Math.min(n.minY,this.a[b+F.Y]);n.maxY=Math.max(n.maxY,this.a[b+F.Y]);n.minVx=Math.min(n.minVx,this.a[b+F.VX]);n.maxVx=Math.max(n.maxVx,this.a[b+F.VX]);n.minVy=Math.min(n.minVy,this.a[b+F.VY]);n.maxVy=Math.max(n.maxVy,this.a[b+F.VY]);n.radius=Math.max(n.radius,this.extents?.[this.rows[i]]??this.a[b+F.Extent]);}
    this.nodes.push(n);
    if(end-start>8){const axis=n.maxX-n.minX>=n.maxY-n.minY?F.X:F.Y,part=this.rows.slice(start,end).sort((x,y)=>this.a[x*W+axis]-this.a[y*W+axis]||x-y);
      for(let i=0;i<part.length;i++)this.rows[start+i]=part[i];const mid=(start+end)>>>1;n.left=this.build(start,mid);n.right=this.build(mid,end);}
    return index;
  }
  /** Any-hit native friendly corridor. No candidate arrays, sorting, Ship reads,
   * permission callbacks or mutation. Caller supplies the phase-owned rule plane. */
  blocked(own:number,members:Uint8Array,roots:Uint32Array,through:Uint8Array,voidShields:Uint8Array,
    meshes:readonly (AcquisitionMesh|undefined)[],passFighters:boolean,
    x:number,y:number,tx:number,ty:number,delay:number,time:number):boolean {
    numericBlockerWork.queries++;
    const o=own*W,vx=this.a[o+F.VX],vy=this.a[o+F.VY],finish=delay+time;
    const sx=x+vx*delay,sy=y+vy*delay,ex=sx+tx+vx*time,ey=sy+ty+vy*time;
    const valid=delay>=0&&time>=0&&Number.isFinite(finish)&&Number.isFinite(sx+sy+ex+ey);
    const minX=Math.min(sx,ex),maxX=Math.max(sx,ex),minY=Math.min(sy,ey),maxY=Math.max(sy,ey);
    const root=this.nodes[0];
    const boundScale=root?Math.max(Math.abs(root.minX),Math.abs(root.maxX),Math.abs(root.minY),Math.abs(root.maxY))+root.radius
      +Math.max(Math.abs(root.minVx),Math.abs(root.maxVx),Math.abs(root.minVy),Math.abs(root.maxVy))*finish:0;
    const pad=2e-6*Math.max(1,Math.abs(sx),Math.abs(sy),Math.abs(ex),Math.abs(ey),Math.abs(x),Math.abs(y),Math.abs(vx)*finish,Math.abs(vy)*finish,boundScale);
    const prune=valid&&Number.isFinite(pad);
    const stack=this.nodes.length?[0]:[];
    while(stack.length) {
      const n=this.nodes[stack.pop()!];numericBlockerWork.nodes++;
      if(prune) {
        const bx0=n.minX-n.radius+Math.min(n.minVx*delay,n.minVx*finish),by0=n.minY-n.radius+Math.min(n.minVy*delay,n.minVy*finish);
        const bx1=n.maxX+n.radius+Math.max(n.maxVx*delay,n.maxVx*finish),by1=n.maxY+n.radius+Math.max(n.maxVy*delay,n.maxVy*finish);
        if(Number.isFinite(bx0+by0+bx1+by1)&&(bx1<minX-pad||bx0>maxX+pad||by1<minY-pad||by0>maxY+pad))continue;
      }
      if(n.left>=0){stack.push(n.left,n.right);continue;}
      for(let i=n.start;i<n.end;i++) {
        const row=this.rows[i],b=row*W;
        if(!members[row]||row===own||roots[row]===roots[own]&&!through[row]||passFighters&&this.a[b+F.Size]===1)continue;
        if(prune) {
          const r=this.extents![row],ovx=this.a[b+F.VX],ovy=this.a[b+F.VY];
          const bx0=this.a[b+F.X]-r+Math.min(ovx*delay,ovx*finish),bx1=this.a[b+F.X]+r+Math.max(ovx*delay,ovx*finish);
          const by0=this.a[b+F.Y]-r+Math.min(ovy*delay,ovy*finish),by1=this.a[b+F.Y]+r+Math.max(ovy*delay,ovy*finish);
          if(Number.isFinite(bx0+by0+bx1+by1)&&(bx1<minX-pad||bx0>maxX+pad||by1<minY-pad||by0>maxY+pad))continue;
        }
        // Preserve the authoritative relative-motion operation order exactly.
        const rvx=vx-this.a[b+F.VX],rvy=vy-this.a[b+F.VY];
        const rx=x+rvx*delay,ry=y+rvy*delay;
        numericBlockerWork.segments++;
        if(acquisitionSegmentEntry(this.a,row,meshes[row],rx,ry,rx+tx+rvx*time,ry+ty+rvy*time,!!voidShields[row])!==null) {
          numericBlockerWork.blocked++;return true;
        }
      }
    }
    return false;
  }
  query(own:number,input:AcquisitionInput,source:Uint32Array,members:Uint8Array,orders:Int32Array):Uint32Array {
    fireRewriteWork.queries++;fireRewriteWork.sourceRows+=source.length;
    const o=own*W;
    const rows:number[]=[],stack=this.nodes.length?[0]:[];
    while(stack.length){const n=this.nodes[stack.pop()!],limit=input.range+n.radius,horizon=input.delay+(input.beam?0:limit/input.speed);
      const speed=Math.max(Math.abs(n.minVx-this.a[o+F.VX]),Math.abs(n.maxVx-this.a[o+F.VX]))+Math.max(Math.abs(n.minVy-this.a[o+F.VY]),Math.abs(n.maxVy-this.a[o+F.VY]));
      const reach=limit+speed*horizon,pad=2e-6*Math.max(1,Math.abs(input.x),Math.abs(input.y),Math.abs(n.minX),Math.abs(n.maxX),Math.abs(n.minY),Math.abs(n.maxY),Math.abs(reach));
      if(Number.isFinite(reach)&&reach>=0&&(input.x+reach+pad<n.minX||input.x-reach-pad>n.maxX||input.y+reach+pad<n.minY||input.y-reach-pad>n.maxY))continue;
      if(n.left>=0){stack.push(n.left,n.right);continue;}
      for(let i=n.start;i<n.end;i++){const row=this.rows[i];if(members[row])rows.push(row);}
    }
    rows.sort((x,y)=>orders[x]-orders[y]);fireRewriteWork.candidates+=rows.length;return Uint32Array.from(rows);
  }
  /** Native read-only pre-aim asks for one nearest legal target, not a sorted
   * candidate list. Source order is still authoritative for equal distances. */
  nearest(own:number,input:AcquisitionInput,members:Uint8Array,orders:Int32Array,
    meshes:readonly (AcquisitionMesh|undefined)[],eligible:Uint8Array,current:number|undefined):AcquisitionHit|null {
    fireRewriteWork.nearestQueries++;
    if(current!==undefined) {
      fireRewriteWork.nearestSolves++;
      const hit=acquireNumericShip(this.a,meshes,own,current,input,eligible);
      if(hit)return hit;
    }
    const o=own*W,stack=this.nodes.length?[0]:[];
    let best:AcquisitionHit|null=null,distance=Infinity,bestOrder=Infinity;
    while(stack.length) {
      const n=this.nodes[stack.pop()!];
      // L-infinity box distance is a lower bound for the exact scaled norm.
      // Keep equal-distance nodes and a relative pad for floating-point edges.
      const lower=Math.max(0,n.minX-input.x,input.x-n.maxX,n.minY-input.y,input.y-n.maxY);
      const distancePad=2e-6*Math.max(1,Math.abs(input.x),Math.abs(input.y),Math.abs(n.minX),Math.abs(n.maxX),Math.abs(n.minY),Math.abs(n.maxY),distance);
      if(lower>distance+distancePad)continue;
      const limit=input.range+n.radius,horizon=input.delay+(input.beam?0:limit/input.speed);
      const speed=Math.max(Math.abs(n.minVx-this.a[o+F.VX]),Math.abs(n.maxVx-this.a[o+F.VX]))+Math.max(Math.abs(n.minVy-this.a[o+F.VY]),Math.abs(n.maxVy-this.a[o+F.VY]));
      const reach=limit+speed*horizon,pad=2e-6*Math.max(1,Math.abs(input.x),Math.abs(input.y),Math.abs(n.minX),Math.abs(n.maxX),Math.abs(n.minY),Math.abs(n.maxY),Math.abs(reach));
      if(Number.isFinite(reach)&&reach>=0&&(input.x+reach+pad<n.minX||input.x-reach-pad>n.maxX||input.y+reach+pad<n.minY||input.y-reach-pad>n.maxY))continue;
      if(n.left>=0) {
        const left=this.nodes[n.left],right=this.nodes[n.right];
        const ld=Math.max(0,left.minX-input.x,input.x-left.maxX,left.minY-input.y,input.y-left.maxY);
        const rd=Math.max(0,right.minX-input.x,input.x-right.maxX,right.minY-input.y,input.y-right.maxY);
        if(ld<=rd)stack.push(n.right,n.left);else stack.push(n.left,n.right);
        continue;
      }
      for(let i=n.start;i<n.end;i++) {
        const row=this.rows[i];fireRewriteWork.nearestLeafRows++;
        if(!members[row])continue;
        const b=row*W,order=orders[row],d=coordinateLength(input.x-this.a[b+F.X],input.y-this.a[b+F.Y]);
        if(d>distance||d===distance&&(!best||order>=bestOrder))continue;
        fireRewriteWork.nearestSolves++;
        const hit=acquireNumericShip(this.a,meshes,own,row,input,eligible);
        if(hit){best=hit;distance=d;bestOrder=order;}
      }
    }
    return best;
  }

}
