"""Headless Chromium pixel/URL verification for an isolated lossless-WebP build."""
import argparse, hashlib, json, mimetypes, threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser()
p.add_argument('--build',required=True);p.add_argument('--manifest',required=True);p.add_argument('--output',required=True)
p.add_argument('--diagnose',action='store_true')
a=p.parse_args()
project=Path(__file__).resolve().parents[1];build=Path(a.build).resolve();public=project/'public'
manifest=json.loads(Path(a.manifest).read_text(encoding='utf-8'))
if a.diagnose:
    manifest['images']=[r for i,r in enumerate(manifest['images']) if i<12 or '/fonts/' in r['source'] or r['colorPolicy']!='untagged-assume-srgb' or r['source'].endswith('.jpg')]
failures=[]
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        name=unquote(urlsplit(self.path).path)
        if name=='/__probe': body=b'<!doctype html><html><body></body></html>';mime='text/html'
        else:
            root=public if name.startswith('/__source/') else build
            relative=name[len('/__source/'):] if root==public else name.lstrip('/') or 'index.html'
            file=(root/relative).resolve()
            if not file.is_relative_to(root) or not file.is_file():
                failures.append(name);self.send_error(404);return
            body=file.read_bytes();mime=mimetypes.guess_type(str(file))[0] or 'application/octet-stream'
        self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)))
        self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');self.end_headers()
        try:self.wfile.write(body)
        except (BrokenPipeError,ConnectionResetError):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
report={'build':str(build),'convertedImages':len(manifest['images']),'pixelMismatches':[],'pageErrors':[]}
try:
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        try:
            page=browser.new_page(viewport={'width':1280,'height':800})
            base='http://127.0.0.1:'+str(server.server_port)
            page.goto(base+'/__probe')
            for at in range(0,len(manifest['images']),32):
                rows=manifest['images'][at:at+32]
                results=page.evaluate('''async rows => {
                  const result=[];
                  const gpuCanvas=document.createElement('canvas'),gl=gpuCanvas.getContext('webgl2',{premultipliedAlpha:false});
                  const gpuPixels=image=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('GPU texture incomplete');const data=new Uint8Array(image.naturalWidth*image.naturalHeight*4);gl.readPixels(0,0,image.naturalWidth,image.naturalHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.deleteFramebuffer(f);gl.deleteTexture(t);return data;};
                  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
                  const pixels=async url=>{const im=new Image();im.src=url;await im.decode();canvas.width=im.naturalWidth;canvas.height=im.naturalHeight;ctx.drawImage(im,0,0);return {w:canvas.width,h:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data,image:im};};
                  for(const row of rows){
                    const old=await pixels('/__source/'+row.source),now=await pixels('/'+row.destination);
                    let changed=0,maxDifference=0,alphaChanged=0,opaqueChanged=0,maxCompositeDifference=0;
                    if(old.w!==now.w||old.h!==now.h) throw Error('Size mismatch: '+row.source);
                    for(let i=0;i<old.data.length;i++){const d=Math.abs(old.data[i]-now.data[i]);if(d)changed++;if(d>maxDifference)maxDifference=d;}
                    for(let i=0;i<old.data.length;i+=4){if(old.data[i+3]!==now.data[i+3])alphaChanged++;for(let k=0;k<3;k++){if(old.data[i+3]===255&&old.data[i+k]!==now.data[i+k])opaqueChanged++;for(const bg of [0,255]){const a=Math.round((old.data[i+k]*old.data[i+3]+bg*(255-old.data[i+3]))/255),b=Math.round((now.data[i+k]*now.data[i+3]+bg*(255-now.data[i+3]))/255);maxCompositeDifference=Math.max(maxCompositeDifference,Math.abs(a-b));}}}
                    const ga=gpuPixels(old.image),gb=gpuPixels(now.image);let gpuChanged=0;for(let i=0;i<ga.length;i++)if(ga[i]!==gb[i])gpuChanged++;
                    if(changed||gpuChanged)result.push({source:row.source,changed,maxDifference,alphaChanged,opaqueChanged,maxCompositeDifference,gpuChanged,colorPolicy:row.colorPolicy});
                  }
                  canvas.width=canvas.height=1;gl.getExtension('WEBGL_lose_context')?.loseContext();return result;
                }''',rows)
                report['pixelMismatches'].extend(results)
            page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
            response=page.goto(base+'/index.html',wait_until='networkidle')
            page.wait_for_function('document.fonts.status === "loaded"')
            report['homeStatus']=response.status
            report['homeImages']=page.evaluate('''()=>Array.from(document.images).map(i=>({url:i.currentSrc,loaded:i.complete&&i.naturalWidth>0}))''')
            report['webpResourceRequests']=page.evaluate('''()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('.webp')).length''')
            report['homeText']=page.locator('body').inner_text()[:600]
            report['missingRequests']=failures
        finally:browser.close()
finally:server.shutdown();server.server_close();thread.join()
output=Path(a.output).resolve();output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ('homeImages','homeText','pixelMismatches')},ensure_ascii=False,indent=2))
print(json.dumps({'canvasRoundingImages':len(report['pixelMismatches']),'gpuChangedBytes':sum(r['gpuChanged'] for r in report['pixelMismatches']),'alphaChanged':sum(r['alphaChanged'] for r in report['pixelMismatches']),'opaqueChanged':sum(r['opaqueChanged'] for r in report['pixelMismatches']),'maxCompositeDifference':max((r['maxCompositeDifference'] for r in report['pixelMismatches']),default=0)},ensure_ascii=False))
# Canvas2D premultiplies PNG/WebP via different integer paths. Compare raw GPU
# texels exactly; tolerate only <=1 visible 8-bit step at partially transparent
# edges after compositing, never alpha changes or opaque/color-profile shifts.
if not a.diagnose:
    assert all(r['gpuChanged']==0 and r['alphaChanged']==0 and r['opaqueChanged']==0 and r['maxCompositeDifference']<=1 for r in report['pixelMismatches']),'Unexpected texture/color/alpha difference'
assert not report['pageErrors'],report['pageErrors']
assert not report['missingRequests'],report['missingRequests']
assert all(row['loaded'] for row in report['homeImages']),report['homeImages']
assert report['webpResourceRequests']>0,'Home page did not actually load WebP assets'
