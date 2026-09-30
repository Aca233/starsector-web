import assert from 'node:assert/strict';
// Optional diagnostics ONLY. Bounded local arrays, no frame IPC or wire changes.
export function inputAdmissionProbePlugin(enabled){
 const replace=(code,needle,value)=>{assert.equal(code.split(needle).length-1,1,'input admission probe anchor: '+needle);return code.replace(needle,value);};
 const append=object=>`{const t=(globalThis as any).__inputAdmission;if(t){if(t.events.length<20000)t.events.push(${object});else t.overflow++;}}`;
 return {name:'input-admission-diagnosis',enforce:'pre',transform(code,id){
  if(!enabled)return;
  const file=id.replaceAll('\\','/').split('?')[0];
  if(file.endsWith('/src/network/LanBattle.tsx')){
   code='(globalThis as any).__inputAdmission={events:[],overflow:0};\n'+code;
   code=replace(code,'canSend: () => connection.canSendInput(),',`canSend: () => {const before=connection.socket?.bufferedAmount,allowed=connection.canSendInput(),after=connection.socket?.bufferedAmount;${append("{stage:'admission',at:performance.timeOrigin+performance.now(),seq,keys,before,after,allowed}")}return allowed;},`);
   code=replace(code,'takeBudget: () => inputBudget.take(now),',`takeBudget: () => {const allowed=inputBudget.take(now);${append("{stage:'budget',at:performance.timeOrigin+performance.now(),seq,keys,allowed}")}return allowed;},`);
   return replace(code,'send: input => !!input && send({ type: "input", input }),',`send: input => {const sent=!!input&&send({type:'input',input});${append("{stage:'input-send',at:performance.timeOrigin+performance.now(),seq,keys,coordinates:!!input,sent}")}return sent;},`);
  }
  if(file.endsWith('/src/network/protocol.ts'))return replace(code,'      this.socket.send(JSON.stringify(message));',`      const probeBefore=this.socket.bufferedAmount;
      this.socket.send(JSON.stringify(message));
      ${append("{stage:'wire-send',at:performance.timeOrigin+performance.now(),kind:(message as {type?:string})?.type,before:probeBefore,after:this.socket.bufferedAmount}")}`);
 }};
}
