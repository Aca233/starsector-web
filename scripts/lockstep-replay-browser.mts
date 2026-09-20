import {replay} from './lockstep-replay-fixture.mts';
self.onmessage=async(event:MessageEvent)=>{
 try{
  const checkpoints:any[]=[];
  const result=await replay(event.data,async(tick,bytes,summary)=>{
   const hash=await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>);
   checkpoints.push({tick,sha256:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join(''),...summary});
   if([0,60,300,600,1200].includes(tick))self.postMessage({type:'sample',tick,bytes},[bytes.buffer]);
  });
  self.postMessage({type:'done',...result,checkpoints});
 }catch(error){self.postMessage({type:'error',message:String(error)});}
};
