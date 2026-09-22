// Headless harness only. Observe, never change the renderer/texture policy.
export function installTextureProbe(TextureManager) {
 let active=false,startedAt=0,rows=new Map(),original=TextureManager.prototype.getCanvasTexture;
 const revisions=new WeakMap();
 TextureManager.prototype.getCanvasTexture=function(id,canvas,revision){
  let known=revisions.get(this);if(!known){known=new Map();revisions.set(this,known);}
  const changed=known.get(id)!==revision;known.set(id,revision);
  if(!active)return Reflect.apply(original,this,[id,canvas,revision]);
  const kind=id.split(':')[0];let row=rows.get(kind);if(!row){row={kind,calls:0,updates:0,bytes:0,ms:0,maxMs:0};rows.set(kind,row);}
  row.calls++;if(changed){row.updates++;row.bytes+=canvas.width*canvas.height*4;}
  const start=performance.now();try{return Reflect.apply(original,this,[id,canvas,revision]);}finally{const ms=performance.now()-start;row.ms+=ms;row.maxMs=Math.max(row.maxMs,ms);}
 };
 return {start(){rows.clear();startedAt=Date.now();active=true;},stop(){active=false;return {startedAt,finishedAt:Date.now(),rows:[...rows.values()]};}};
}
