import type { Ship } from './Ship';
import type { CombatStateCore } from './CombatStateCore';
import { contactBroadphaseRadius } from './systems/ShipCollisionSystem';

interface Entry { ship: Ship; x: number; y: number; radius: number; cells: string[] }
const CELL_SIZE = 512, MAX_CELLS = 64;
function cellsFor(x: number, y: number, radius: number): string[] | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return;
  const pad = 1e-7 * Math.max(1,radius,Math.abs(x),Math.abs(y));
  const left=Math.floor((x-radius-pad)/CELL_SIZE),right=Math.floor((x+radius+pad)/CELL_SIZE);
  const bottom=Math.floor((y-radius-pad)/CELL_SIZE),top=Math.floor((y+radius+pad)/CELL_SIZE);
  if (![left,right,bottom,top].every(Number.isSafeInteger) || (right-left+1)*(top-bottom+1)>MAX_CELLS) return;
  const cells: string[]=[];
  for (let cx=left;cx<=right;cx++) for (let cy=bottom;cy<=top;cy++) cells.push(`${cx},${cy}`);
  return cells;
}
/** Live broad phase, NOT a static contact list. Candidate visitation is identical
 * to the old i/j loop. After displacement, both assemblies move in the index
 * before querying the still-unvisited suffix, so newly introduced pairs survive. */
export class CoreCollisionIndex {
  private readonly entries: Entry[];
  private readonly grid=new Map<string,Set<number>>();
  private readonly unbounded=new Set<number>();
  private readonly assemblies=new Map<Ship,number[]>();
  readonly counts={possiblePairs:0,candidates:0,responses:0,refreshes:0};
  constructor(ships: readonly Ship[],private readonly core: CombatStateCore) {
    this.entries=ships.map(ship=>({ship,x:0,y:0,radius:0,cells:[]}));
    this.counts.possiblePairs=ships.length*(ships.length-1)/2;
    this.entries.forEach((entry,index)=> {
      const root=entry.ship.assemblyRoot,indices=this.assemblies.get(root)??[];
      indices.push(index);this.assemblies.set(root,indices);this.refresh(index);
    });
  }
  private refresh(index: number): void {
    const e=this.entries[index];
    for (const key of e.cells) {
      const bucket=this.grid.get(key);bucket?.delete(index);if (!bucket?.size)this.grid.delete(key);
    }
    this.unbounded.delete(index);
    const pose=this.core.pose(e.ship);
    e.x=pose?.[0]??e.ship.pos.x;e.y=pose?.[1]??e.ship.pos.y;e.radius=contactBroadphaseRadius(e.ship);
    const keys=cellsFor(e.x,e.y,e.radius);e.cells=keys??[];
    if (!keys) this.unbounded.add(index);
    else for(const key of keys) {
      const bucket=this.grid.get(key)??new Set<number>();bucket.add(index);this.grid.set(key,bucket);
    }
    this.counts.refreshes++;
  }
  private candidates(i: number,after: number): number[] {
    const e=this.entries[i],indices=new Set<number>();
    if(this.unbounded.has(i)) for(let j=after+1;j<this.entries.length;j++)indices.add(j);
    else {
      for(const key of e.cells) for(const j of this.grid.get(key)??[]) if(j>after)indices.add(j);
      for(const j of this.unbounded) if(j>after)indices.add(j);
    }
    // Identical outward pad to the existing narrow-phase entry. Nonfinite
    // values fall through; no false negatives for partial/offset shields.
    return [...indices].filter(j=> {
      const other=this.entries[j],radius=e.radius+other.radius;
      const pad=1e-7*Math.max(1,radius,Math.abs(e.x),Math.abs(e.y),Math.abs(other.x),Math.abs(other.y));
      return !(Math.abs(other.x-e.x)>radius+pad || Math.abs(other.y-e.y)>radius+pad);
    }).sort((a,b)=>a-b);
  }
  resolve(response:(first:Ship,second:Ship)=>boolean): void {
    for(let i=0;i<this.entries.length;i++) {
      let after=i,candidates=this.candidates(i,after);
      while(candidates.length) {
        let changed=false;
        for(const j of candidates) {
          after=j;this.counts.candidates++;
          const first=this.entries[i].ship,second=this.entries[j].ship;
          if(response(first,second)) {
            this.counts.responses++;
            const dirty=new Set([...(this.assemblies.get(first.assemblyRoot)??[]),...(this.assemblies.get(second.assemblyRoot)??[])]);
            for(const index of dirty)this.refresh(index);
            changed=true;break;
          }
        }
        candidates=changed?this.candidates(i,after):[];
      }
    }
  }
}
