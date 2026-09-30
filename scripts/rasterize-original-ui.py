"""Rasterize newly authored UI vectors; never reads original image pixels."""
import asyncio, base64, hashlib, json, sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
ASSETS = (ROOT / 'public/game-assets').resolve()
GROUPS = {'ui', 'hud', 'warroom', 'cursors', 'icons', 'hullmods', 'factions'}
async def main():
    jobs = json.loads((ROOT/'artifacts/original-ui-20260926/vector-plan.json').read_text(encoding='utf-8-sig'))
    if len(sys.argv)>1: jobs=[j for j in jobs if (j['path'].startswith(sys.argv[1]) if sys.argv[1].endswith('/') else j['path']==sys.argv[1])]
    # Verify every destination before making any changes.
    for j in jobs:
        target = (ASSETS/j['path']).resolve()
        parts = Path(j['path']).parts
        if not target.is_relative_to(ASSETS) or len(parts)<3 or parts[0]!='graphics' or parts[1] not in GROUPS or 'web_' in j['path'] or target.suffix not in {'.png','.jpg'}:
            raise RuntimeError('Unsafe UI replacement destination')
    records=[]
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        for start in range(0,len(jobs),40):
            batch=jobs[start:start+40]
            images=await page.evaluate('''async jobs => {
              const output=[];
              for(const job of jobs){
                const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(job.svg);await image.decode();
                const canvas=document.createElement('canvas');canvas.width=job.width;canvas.height=job.height;
                const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);output.push(canvas.toDataURL(job.path.endsWith('.jpg')?'image/jpeg':'image/png').split(',')[1]);
              }return output;
            }''',batch)
            for job,data in zip(batch,images,strict=True):
                raw=base64.b64decode(data,validate=True)
                if raw[:8]!=b'\x89PNG\r\n\x1a\n' and raw[:2]!=b'\xff\xd8': raise RuntimeError('Invalid rendered PNG')
                (ASSETS/job['path']).write_bytes(raw)
                records.append({k:job[k] for k in ['path','width','height','source']}|{'sha256':hashlib.sha256(raw).hexdigest()})
        await browser.close()
    dest=ROOT/'public/ui-artwork-provenance.json'
    report=json.loads(dest.read_text(encoding='utf-8')) if dest.exists() else {'version':1,'date':'2026-09-26','records':[]}
    updated={r['path']:r for r in report['records']}
    updated.update({r['path']:r for r in records})
    report['records']=list(updated.values())
    dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Replaced {len(records)} UI textures with newly authored vectors; custom web_ artwork untouched.')
asyncio.run(main())
