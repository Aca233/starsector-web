"""Concentrated checks and review output for the offline module-layer bake."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import importlib.util
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/spear-of-adun-art/module-layers-v01'
spec=importlib.util.spec_from_file_location('module_layers',ROOT/'scripts/build-spear-of-adun-module-layers.py')
lib=importlib.util.module_from_spec(spec);spec.loader.exec_module(lib)


def main():
    build=json.loads((OUT/'layer-build.json').read_text(encoding='utf-8'))
    source=json.loads((ROOT/'output/spear-of-adun-art/modules-v01/module-master.json').read_text(encoding='utf-8'))
    anchors={r['id']:r['authoringImageAnchorPx'] for r in source['modules']}
    assert build['runtimeRegistered'] is False
    frames=build['frames'];assert frames==[0,42,90,375,750,1500,2250,3000],frames
    manifest=[];evidence=[];total_bytes=0;total_tests=0
    labels={0:'静止 / 核心环初相',42:'前部机构打开 / 0.70 秒',90:'前部机构归位 / 1.50 秒',375:'核心环 / 6.25 秒',750:'核心环 / 12.50 秒',1500:'核心环 / 25.00 秒',2250:'核心环 / 37.50 秒',3000:'循环闭合 / 50.00 秒'}
    for frame in frames:
        folder=OUT/f'frame-{frame:04d}'
        data=json.loads((folder/'layers.json').read_text(encoding='utf-8'))
        assert data['battleEntities']==5 and data['allSpritesHaveOwner'] and data['depthUsedOnlyOffline']
        assert not data['runtimeRegistered'] and not data['damageInterfacesAuthored']
        draws=data['draws'];assert 5<=len(draws)<=20
        assert [r['drawOrder'] for r in draws]==sorted(r['drawOrder'] for r in draws)
        assert len({r['id'] for r in draws})==len(draws)
        for row in draws:
            path=OUT/row['file'];im=lib.read(path)
            assert row['owner'] in anchors and list(im.size)==row['size']
            box=row['sourceBox'];ax,ay=anchors[row['owner']]
            assert row['offsetFromModuleAnchorPx']==[box[0]-ax,box[1]-ay]
            assert row['size']==[box[2]-box[0],box[3]-box[1]]
            assert 0<=box[0]<box[2]<=512 and 0<=box[1]<box[3]<=1024
            assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256']
            assert path.stat().st_size==row['bytes'];total_bytes+=row['bytes']
        assert len(data['subsetChecks'])==16
        for check in data['subsetChecks']:
            assert 'CORE' not in check['absent']
            m=check['comparedToDepthSortedUnoccludedBakes']
            assert m['rgbMeanAbs0to255']<.3,(frame,check)
            total_tests+=1
        for check in data['filteringChecks']:
            m=check['comparedToWholeModule']
            if check['transform']=='native':
                assert m['alphaMaxAbs0to255']<=1 and m['rgbMaxAbs0to255']<=1,(frame,check)
            else:
                assert m['rgbMeanAbs0to255']<.5,(frame,check)
            total_tests+=1
        m=data['references']['intact'];base=data['fiveLayerBaseline']
        assert m['rgbMeanAbs0to255']<.4,(frame,m)
        assert m['rgbMeanAbs0to255']<base['rgbMeanAbs0to255'],(frame,m,base)
        manifest.append({'frame':frame,'label':labels[frame],'draws':draws})
        evidence.append({'frame':frame,'draws':len(draws),'fiveLayerRgbMean':base['rgbMeanAbs0to255'],
                         'sublayerRgbMean':m['rgbMeanAbs0to255'],
                         'intactReference':m,'damagedReferences':{k:v for k,v in data['references'].items() if k!='intact'},
                         'worstSubsetRgbMean':max(c['comparedToDepthSortedUnoccludedBakes']['rgbMeanAbs0to255'] for c in data['subsetChecks']),
                         'worstFilteredOwnerRgbMean':max(c['comparedToWholeModule']['rgbMeanAbs0to255'] for c in data['filteringChecks'])})
    loop=lib.measure(lib.read(OUT/'frame-0000/composed.png'),lib.read(OUT/'frame-3000/composed.png'))
    # Closed loop is separately measured. It must not be silently cross-faded.
    assert loop['rgbMeanAbs0to255']<.1,loop
    moved=lib.measure(lib.read(OUT/'frame-0000/composed.png'),lib.read(OUT/'frame-0375/composed.png'))
    assert moved['pixelsRgbErrorOver16']>1000,moved
    assert total_bytes<5*1024*1024,total_bytes
    report={'schemaVersion':1,'scope':'OFFLINE_MODULE_SUBLAYER_BAKE',
            'runtimeRegistered':False,'battleEntities':5,'sampledFrames':frames,
            'subsetAndFilteringCases':total_tests,'spriteBytesAcrossEightPoses':total_bytes,
            'sourceImageSize':[512,1024],'loopClosure':loop,'ringPoseChanged':moved,
            'geometryOwnershipAndSublayerChecksPassed':True,'evidence':evidence,
            'NOTPassed':['Final damaged interface artwork','Removal-state relighting/contact shadows','Continuous animation frame atlas','Engine module collision and weapon control'],
            'renderingResiduals':'2D alpha filtering and cross-module antialiasing differ from one 3D raytraced render; not pixel-identical.'}
    lib.save_json(OUT/'verification.json',report)
    html=(ROOT/'scripts/adun-module-layer-review.template.html').read_text(encoding='utf-8')
    html=html.replace('__MANIFEST__',json.dumps({'frames':manifest},ensure_ascii=False).replace('<','\\u003c'))
    (OUT/'review.html').write_text(html,encoding='utf-8')
    # Track only the exported owner-addressed sprites and provenance, not EXR or
    # depth arrays as future runtime dependencies.
    layout={'schemaVersion':1,'stage':'DEPTH_RESOLVED_2D_SUBLAYERS_SAMPLED_NOT_RUNTIME',
            'battleEntities':5,'runtimeRegistered':False,'damageArtReady':False,
            'sourceImageSize':[512,1024],'sourceAuthoringAnchors':anchors,
            'sourceManifest':'output/spear-of-adun-art/module-layers-v01/layer-build.json',
            'evidenceSha256':hashlib.sha256((OUT/'verification.json').read_bytes()).hexdigest(),
            'frames':[{'frame':r['frame'],'manifest':f"output/spear-of-adun-art/module-layers-v01/frame-{r['frame']:04d}/layers.json",'drawItems':r['draws']} for r in evidence],
            'drawing':'Use owner presence filter, then ascending drawOrder; draw cropped sprite with offsetFromModuleAnchorPx. Switch all sublayers atomically on pose changes.',
            'remaining':report['NOTPassed']}
    lib.save_json(ROOT/'docs/spear-of-adun-module-layers-v06.json',layout)
    review_board()
    print(json.dumps({'PASS':True,'poses':len(frames),'cases':total_tests,'spriteBytes':total_bytes,'loopRgbMean':loop['rgbMeanAbs0to255'],
                      'worstIntactRgbMean':max(r['sublayerRgbMean'] for r in evidence),'runtimeRegistered':False},ensure_ascii=False))


def review_board():
    board=Image.new('RGB',(1440,1140),'#10151e');draw=ImageDraw.Draw(board)
    font='C:/Windows/Fonts/msyh.ttc'
    title=ImageFont.truetype(font,28);label=ImageFont.truetype(font,19);note=ImageFont.truetype(font,15)
    draw.text((28,20),'亚顿之矛 · 二维子层实际拼合',font=title,fill='#e3cf98')
    draw.text((28,62),'五个模块实体 / 深度仅用于离线烘焙 / 下列舰体由独立 PNG 拼合，不是整体模型截图',font=note,fill='#9eafc3')
    rows=[('frame-0000/composed.png','完整拼合 · 初始姿态'),('frame-0375/composed.png','核心环另一姿态 · 全层同步'),('frame-0000/composed-without-PORT.png','移除左翼 · 无残留补片'),('frame-0000/composed-without-AFT.png','移除尾段 · 露出底层结构')]
    for i,(file,text) in enumerate(rows):
        draw.text((i*360+15,110),text,font=label,fill='#dfc893')
        im=lib.read(OUT/file);im.thumbnail((350,875),Image.Resampling.LANCZOS)
        board.paste(im,(i*360+(360-im.width)//2,165),im)
    draw.text((28,1050),'已检查：8种姿态、16种附属模块显隐组合，以及独立子层在缩放/转向后的接缝。',font=note,fill='#9eafc3')
    draw.text((28,1080),'未完成：移除后的接触阴影、战损断面和游戏接入。舰体保持无新增炮头；不烘入武器占位。',font=note,fill='#cfac77')
    draw.text((28,1110),'源模型 Catholomew · CC BY-NC 4.0 / 本地制作研究',font=note,fill='#6d7e93')
    board.save(OUT/'review-board.png')


if __name__=='__main__':main()

