import { useEffect, useRef, useState } from 'react';
import { NativeButton } from '../ui/NativeChrome';
import { Modal } from '../ui/core/UI';
import { readLibrary, data, evaluate, type Design } from '../studio/DesignModel';
import { validateLanDesign } from './LanDesign';

export function LanDesignPicker({disabled, onSelect, onEdit}: {disabled:boolean; onSelect:(design:Design)=>void; onEdit:()=>void}) {
  const [open,setOpen]=useState(false), [designs,setDesigns]=useState<Design[]>([]), [error,setError]=useState('');
  const file=useRef<HTMLInputElement>(null);
  const refresh=()=>{const result=readLibrary();setError(result.error??'');setDesigns(result.library.designs);};
  useEffect(()=>{if(!open)return; window.addEventListener('storage',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('focus',refresh);};},[open]);
  const choose=(input:unknown)=>{try{const design=validateLanDesign(input);onSelect(design);setOpen(false);}catch(e){setError(e instanceof Error?e.message:'配装不可用');}};
  return <>
    <NativeButton disabled={disabled} onClick={()=>{refresh();setOpen(true);}}>已存方案 / 导入</NativeButton>
    {open&&<Modal title="选择舰船设计" eyebrow="联机配装" onClose={()=>setOpen(false)} footer={<NativeButton onClick={()=>setOpen(false)}>返回房间</NativeButton>}>
      <div className="lan-design-tools">
        <NativeButton onClick={()=>{setOpen(false);onEdit();}}>直接选船与改装</NativeButton>
        <NativeButton onClick={refresh}>刷新本机方案</NativeButton>
        <NativeButton onClick={()=>file.current?.click()}>导入方案 JSON</NativeButton>
      </div>
      <p className="lan-menu-note">通常直接选船与改装即可，无需预先保存。这里仅用于读取已存方案或导入文件，不覆盖本地存档。不同 IP / 端口的方案库相互独立。</p>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={async event=>{
        const picked=event.target.files?.[0];event.target.value='';if(!picked)return;
        try{if(picked.size>2_000_000)throw Error('方案文件超过 2 MB');const value=JSON.parse(await picked.text());
          const list=Array.isArray(value.designs)?value.designs:[value];if(list.length>100)throw Error('方案数量过多');
          const imported=list.map(validateLanDesign);if(!imported.length)throw Error('文件中没有已保存方案');
          setDesigns(imported);setError('');
        }catch(e){setError(e instanceof Error?e.message:'无法读取方案');}
      }}/>
      {error&&<p className="lan-error" role="alert">{error}</p>}
      <div className="lan-design-list">
        {!designs.length&&<p>当前地址还没有已存方案。可直接选船与改装，无需先保存；也可导入已有方案。</p>}
        {designs.map((d,index)=>{
          let reason='',summary='';try{const valid=validateLanDesign(d), result=evaluate(valid);summary=(data.ships[d.hullId]?.name??d.hullId)+' · '+result.op.used+'/'+result.op.total+' OP · '+Object.values(d.weapons).filter(Boolean).length+' 门武器';}catch(e){reason=e instanceof Error?e.message:'方案不可用';}
          return <section className="lan-design-row" key={index}><div><strong>{d.name}</strong><p>{summary||d.hullId}</p>{reason&&<p className="lan-error">{reason}</p>}</div><NativeButton disabled={!!reason||disabled} onClick={()=>choose(d)}>使用此方案</NativeButton></section>;
        })}
      </div>
    </Modal>}
  </>;
}
