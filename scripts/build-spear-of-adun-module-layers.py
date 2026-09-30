"""Prepare depth-resolved 2D sprite sublayers from real Blender module bakes.

This is asset extraction/packing, not generative repainting. Pixel ownership
never changes. Each draw item carries its battle-module owner. Removing an owner
removes ALL its overlays but preserves previously hidden pixels of other owners.
No Blender/depth buffer is required to draw the exported cropped PNGs.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/spear-of-adun-art/module-layers-v01'
MODULES=('PORT','STARBOARD','AFT','CORE','FORE')
SIZE=(512,1024)


def read(path):
    with Image.open(path) as image:
        assert image.mode=='RGBA' and image.format=='PNG',str(path)
        return image.copy()


def save_json(path,data):
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def native(image):
    return image.resize(SIZE,Image.Resampling.LANCZOS) if image.size!=SIZE else image.copy()


def measure(a,b):
    a=np.asarray(a).astype(np.float32);b=np.asarray(b).astype(np.float32)
    aa=a[:,:,3]/255;ba=b[:,:,3]/255
    delta=np.abs(a[:,:,:3]*aa[:,:,None]-b[:,:,:3]*ba[:,:,None])
    mask=(aa>0)|(ba>0);maximum=np.max(delta,axis=2);area=int(mask.sum())
    return {'foregroundPixels':area,'rgbMeanAbs0to255':float(delta.sum()/(3*area)),
        'rgbMaxAbs0to255':float(delta.max()),'pixelsRgbErrorOver8':int((maximum>8).sum()),
        'pixelsRgbErrorOver16':int((maximum>16).sum()),
        'alphaMeanAbs0to255':float(np.abs(a[:,:,3]-b[:,:,3]).sum()/area),
        'alphaMaxAbs0to255':float(np.abs(a[:,:,3]-b[:,:,3]).max())}


def fill_edge_depth(z,alpha):
    z=z.copy();valid=(z>0)&(z<1e5);missing=(alpha>0)&~valid
    # Depth passes are unfiltered; beauty alpha has antialiasing. Propagate only
    # neighboring real hit depths into that narrow alpha fringe, never into the
    # image silhouette or across the module's empty space.
    for _ in range(6):
        if not missing.any():break
        padded=np.pad(z,1,constant_values=np.inf)
        neighbors=np.minimum.reduce([padded[dy:dy+z.shape[0],dx:dx+z.shape[1]]
                                     for dy,dx in ((0,1),(2,1),(1,0),(1,2),(0,0),(0,2),(2,0),(2,2))])
        usable=missing&(neighbors>0)&(neighbors<1e5)
        z[usable]=neighbors[usable];valid|=usable;missing=(alpha>0)&~valid
    assert not missing.any(),f'{missing.sum()} alpha pixels lack real neighboring depth'
    return np.where(alpha>0,z,np.inf)


def rank_pixels(colors,depths):
    zs=np.stack([fill_edge_depth(z,c[:,:,3]) for z,c in zip(depths,colors)])
    # Every pixel has a strict back-to-front depth order. A preferred order keeps
    # most hulls in one base layer; only reverse overlaps need extra top layers.
    order=np.argsort(zs,axis=0,kind='stable')[::-1]
    ranks=np.full(zs.shape,-1,np.int16);previous=np.full(zs.shape[1:],-1,np.int16)
    for sorted_index in order:
        for module_index,color in enumerate(colors):
            mask=(sorted_index==module_index)&(color[:,:,3]>0)
            rank=np.maximum(previous+1,module_index)
            ranks[module_index][mask]=rank[mask];previous[mask]=rank[mask]
    return ranks,order


def composite(draws,images,absent=(),transform=None):
    result=Image.new('RGBA',SIZE)
    for row in draws:
        if row['owner'] in absent:continue
        tile=images[row['id']]
        canvas=Image.new('RGBA',SIZE);canvas.paste(tile,tuple(row['sourceBox'][:2]))
        if transform:canvas=transform(canvas)
        result=Image.alpha_composite(result,canvas)
    return result


def oracle(colors,order,absent):
    h,w=colors[0].shape[:2];rgba=np.zeros((h,w,4),np.float32)
    for indexes in order:
        for i,c in enumerate(colors):
            if MODULES[i] in absent:continue
            a=(c[:,:,3]/255)*((indexes==i)&(c[:,:,3]>0))
            rgba[:,:,:3]=c[:,:,:3]*a[:,:,None]+rgba[:,:,:3]*(1-a[:,:,None])
            rgba[:,:,3]=a+rgba[:,:,3]*(1-a)
    rgb=rgba[:,:,:3]/np.maximum(rgba[:,:,3:4],1e-20)
    result=np.dstack((rgb,rgba[:,:,3]*255)).clip(0,255).round().astype(np.uint8)
    return native(Image.fromarray(result))


def build_frame(frame,anchors,all_subsets=False,authoring_checks=True):
    folder=OUT/f'frame-{frame:04d}'
    meta=json.loads((folder/'bake.json').read_text(encoding='utf-8'))
    originals=[read(folder/f'{m}.png') for m in MODULES]
    colors=[np.asarray(im) for im in originals]
    depths=[np.load(folder/f'{m}-depth.npy') for m in MODULES]
    ranks,order=rank_pixels(colors,depths)
    export=folder/'sprites';export.mkdir(exist_ok=True)
    draws=[];images={}
    for i,module in enumerate(MODULES):
        color=colors[i];alpha=color[:,:,3]
        # Keep the approved native beauty/alpha authoritative. Rasterize physical
        # depth ownership at supersample resolution, then factor its coverage
        # into source-over alphas. Simply cutting/resizing RGBA strips loses
        # alpha at adjoining edges when a whole battle module is displayed alone.
        native_color=np.asarray(native(originals[i]));native_alpha=native_color[:,:,3].astype(np.float32)/255
        rank_values=np.unique(ranks[i][alpha>0])
        weights=[]
        for rank in rank_values:
            coverage=np.where(ranks[i]==rank,alpha.astype(np.float32)/255,0)
            weights.append(np.asarray(Image.fromarray(coverage).resize(SIZE,Image.Resampling.BOX)))
        weights=np.stack(weights);total=weights.sum(axis=0)
        # Beauty Lanczos filtering has a very narrow fringe outside box coverage.
        # Such fringe belongs to the base sheet, not an invented new surface.
        weights[0]=np.where((total==0)&(native_alpha>0),native_alpha,weights[0]);total=weights.sum(axis=0)
        weights*=np.divide(native_alpha,total,out=np.zeros_like(total),where=total>0)[None,:,:]
        interior=Image.fromarray(np.where(native_color[:,:,3]==255,255,0).astype(np.uint8))
        interior=np.asarray(interior.filter(ImageFilter.MinFilter(9)))==255
        above=np.zeros_like(native_alpha);alphas={}
        for index in range(len(rank_values)-1,-1,-1):
            denom=1-above
            layer_alpha=np.divide(weights[index],denom,out=np.zeros_like(denom),where=denom>1e-6).clip(0,1)
            # Same-owner opaque underpaint only; never borrow a neighbor's armor.
            layer_alpha=np.where(interior&(above>0),1,layer_alpha)
            alphas[index]=np.round(layer_alpha*255).astype(np.uint8)
            above=(above+weights[index]).clip(0,1)
        for index,rank in enumerate(rank_values):
            pixels=native_color.copy();pixels[:,:,3]=alphas[index]
            image=Image.fromarray(pixels);box=image.getchannel('A').getbbox()
            if not box:continue
            image=image.crop(box);name=f'{module}-z{int(rank)}';path=export/f'{name}.png';image.save(path)
            ax,ay=anchors[module]
            row={'id':name,'owner':module,'drawOrder':int(rank),'file':str(path.relative_to(OUT)).replace('\\','/'),
                 'sourceBox':list(box),'offsetFromModuleAnchorPx':[box[0]-ax,box[1]-ay],
                 'size':list(image.size),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
            draws.append(row);images[name]=image
    draws.sort(key=lambda r:(r['drawOrder'],MODULES.index(r['owner'])))
    combined=composite(draws,images);combined.save(folder/'composed.png')
    if not authoring_checks:
        result={'frame':frame,'draws':draws,'sourceSize':list(SIZE),'depthUsedOnlyOffline':True,'battleEntities':5}
        save_json(folder/'layers.json',result)
        return result
    reference=native(read(folder/'reference.png'))
    references={'intact':measure(combined,reference)}
    baseline=Image.new('RGBA',SIZE)
    for original in originals:baseline=Image.alpha_composite(baseline,native(original))
    baseline_metrics=measure(baseline,reference)
    subsets=[()] + [(m,) for m in MODULES if m!='CORE'] + [('PORT','AFT'),('PORT','STARBOARD','AFT')]
    if all_subsets:
        optional=[m for m in MODULES if m!='CORE']
        subsets=[tuple(optional[i] for i in range(4) if mask&(1<<i)) for mask in range(16)]
    subset_checks=[]
    for absent in subsets:
        rendered=composite(draws,images,absent)
        depth_sorted=oracle(colors,order,absent)
        subset_checks.append({'absent':list(absent),'comparedToDepthSortedUnoccludedBakes':measure(rendered,depth_sorted)})
        ref=folder/('without-'+'-'.join(absent)+'.png')
        if absent and ref.exists():
            rendered.save(folder/('composed-without-'+'-'.join(absent)+'.png'))
            references['without-'+'-'.join(absent)]=measure(rendered,native(read(ref)))
    filtering=[]
    transforms={'native':lambda x:x,'halfSize':lambda x:x.resize((256,512),Image.Resampling.BILINEAR).resize(SIZE,Image.Resampling.BILINEAR),
                'rotated17':lambda x:x.rotate(17,resample=Image.Resampling.BICUBIC),
                'quarterSize':lambda x:x.resize((128,256),Image.Resampling.BILINEAR).resize(SIZE,Image.Resampling.BILINEAR)}
    for module,original in zip(MODULES,originals):
        absent=set(MODULES)-{module}
        for mode,transform in transforms.items():
            result=composite(draws,images,absent,transform)
            filtering.append({'owner':module,'transform':mode,'comparedToWholeModule':measure(result,transform(native(original)))})
    evidence={'frame':frame,'draws':draws,'sourceSize':list(SIZE),'sourceBakeScale':meta['scale'],
              'battleEntities':5,'runtimeRegistered':False,'depthUsedOnlyOffline':True,
              'allSpritesHaveOwner':all(r['owner'] in MODULES for r in draws),
              'references':references,'fiveLayerBaseline':baseline_metrics,'subsetChecks':subset_checks,'filteringChecks':filtering,
              'foreignIndirectLightRetained':True,'damageInterfacesAuthored':False}
    save_json(folder/'layers.json',evidence)
    print(json.dumps({'frame':frame,'layers':len(draws),'bytes':sum(r['bytes'] for r in draws),'references':references},ensure_ascii=False),flush=True)
    return evidence


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--frames',default='0');parser.add_argument('--all-subsets',action='store_true')
    args=parser.parse_args()
    master=json.loads((ROOT/'output/spear-of-adun-art/modules-v01/module-master.json').read_text(encoding='utf-8'))
    anchors={r['id']:r['authoringImageAnchorPx'] for r in master['modules']}
    results=[build_frame(int(f),anchors,args.all_subsets) for f in args.frames.split(',')]
    save_json(OUT/'layer-build.json',{'schemaVersion':1,'sourceMasterSha256':hashlib.sha256((ROOT/'output/spear-of-adun-art/modules-v01/modular-master.blend').read_bytes()).hexdigest(),
       'battleModules':list(MODULES),'frames':[r['frame'] for r in results],'runtimeRegistered':False,
       'drawing':'Alpha-composite each present owner sprite in ascending drawOrder; cropped images share a source canvas and owner anchor. No realtime 3D or depth shader.',
       'limitations':['Sampled poses, not final frame sequence','Foreign indirect light baked into complete module beauty','No new damaged interface art','Unarmed hull: final weapons remain separate assets']})


if __name__=='__main__':main()
