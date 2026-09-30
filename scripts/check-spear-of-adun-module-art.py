"""Audit five-module authoring renders; no runtime assets are changed.

Uses Pillow only for measurement, alpha-composition tests, and a review-sheet
layout of existing Blender renders. It does not repaint or generate ship art.
"""
import hashlib
import itertools
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/spear-of-adun-art/modules-v01"
MODULES = ("CORE", "FORE", "PORT", "STARBOARD", "AFT")


def load(name):
    with Image.open(OUT / name) as image:
        assert image.format == "PNG" and image.mode == "RGBA", name
        return image.copy()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def rgb_on_black(image):
    return Image.alpha_composite(Image.new("RGBA", image.size, (0, 0, 0, 255)), image).convert("RGB")


def metrics(a, b):
    assert a.size == b.size
    diff = ImageChops.difference(rgb_on_black(a), rgb_on_black(b))
    alpha_diff = ImageChops.difference(a.getchannel("A"), b.getchannel("A"))
    union = ImageChops.lighter(a.getchannel("A"), b.getchannel("A"))
    foreground = sum(union.histogram()[1:])
    histogram = diff.histogram()
    channels = diff.split()
    max_channel = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
    over8 = sum(max_channel.histogram()[9:])
    return {
        "foregroundPixels": foreground,
        "rgbMeanAbsOverForeground0to255": sum((i % 256) * n for i, n in enumerate(histogram)) / (3 * foreground),
        "rgbMaxAbs0to255": max(e[1] for e in diff.getextrema()),
        "pixelsRgbErrorOver8": over8,
        "fractionRgbErrorOver8": over8 / foreground,
        "alphaMaxAbs0to255": alpha_diff.getextrema()[1],
        "alphaMeanAbs0to255": ImageStat.Stat(alpha_diff).mean[0],
    }


def composition_trial(parts, reference):
    best = None
    # This is only a rest-pose experiment. A good total order would not prove
    # animated occlusion or missing-module shadows are correct.
    for order in itertools.permutations(MODULES):
        merged = Image.new("RGBA", reference.size)
        for module in order:
            merged = Image.alpha_composite(merged, parts[module])
        result = metrics(merged, reference)
        if best is None or result["rgbMeanAbsOverForeground0to255"] < best["metrics"]["rgbMeanAbsOverForeground0to255"]:
            best = {"backToFront": list(order), "metrics": result}
    return {"ordersTested": 120, "frame": 0, "best": best,
            "productionReady": False,
            "reason": "尾部与核心、左右翼存在交错遮挡；五张完整图不能用一个总层序精确拼合。须拆视觉子层，不能把静止遮挡掩模当所有战损/动画的完整模块。"}


def main():
    master = json.loads((OUT / "module-master.json").read_text(encoding="utf-8"))
    geometry = json.loads((OUT / "verification.json").read_text(encoding="utf-8"))
    assert master["runtimeRegistered"] is False
    assert master["sourceFaces"] == master["partitionedSourceFaces"] == geometry["sourceFaceCount"] == geometry["targetFaceCount"]
    assert geometry["geometryPassed"] and geometry["mountOwnershipPassed"]
    assert geometry["modelReopened"] and geometry["sourceAttributesPreserved"] and geometry["sourceWeightsPreserved"]
    assert not geometry["mixedModuleBearings"]
    objects = {row["object"]: row for row in master["objects"]}
    assert len(objects) == len(master["objects"])
    assert all(row["owner"] in MODULES for row in objects.values())
    assert all(objects[name]["owner"] == "CORE" for name in ("Object_7", "Object_9", "Object_11", "Object_13"))
    anchors = {m["id"]: m["authoringImageAnchorPx"] for m in master["modules"]}
    assert set(anchors) == set(MODULES)
    mounts = master["mounts"]
    assert len({m["id"] for m in mounts}) == len(mounts) == 13
    for mount in mounts:
        assert objects[mount["supportObject"]]["owner"] == mount["owner"], mount["id"]
        x, y = mount["imageAnchorPx"]
        ax, ay = anchors[mount["owner"]]
        assert mount["moduleLocalForwardRightSourcePx"] == [ay - y, x - ax], mount["id"]
    sizes = {size: sum(m["size"] == size for m in mounts) for size in ("SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE")}
    assert sizes == {"SMALL": 6, "MEDIUM": 4, "LARGE": 2, "EXTRA_LARGE": 1}
    inventory = []
    names = ["before-split.png", "assembled.png", "assembled-frame-42.png", "assembled-frame-750.png", "exploded.png", "hull-unarmed.png"]
    names += [f"without-{m}.png" for m in MODULES if m != "CORE"]
    names += [f"{m}-{kind}.png" for m in MODULES for kind in ("complete", "visible")]
    names += [f"hull-{m}.png" for m in MODULES]
    for name in names:
        im = load(name)
        assert im.size == ((640, 1280) if name == "exploded.png" else (512, 1024)), name
        alpha = im.getchannel("A")
        bbox = alpha.getbbox()
        assert alpha.getextrema() == (0, 255) and bbox is not None, name
        assert bbox[0] > 0 and bbox[1] > 0 and bbox[2] < im.width and bbox[3] < im.height, name
        inventory.append({"file": name, "size": list(im.size), "alphaBounds": list(bbox), "sha256": digest(OUT / name)})
    difference = metrics(load("before-split.png"), load("assembled.png"))
    # Rendering tolerances, not a claim of bit-identical normals or lighting.
    assert difference["rgbMeanAbsOverForeground0to255"] < .1
    assert difference["fractionRgbErrorOver8"] < .0001
    assert difference["alphaMeanAbs0to255"] < .01
    trials = {
        "withExistingWeaponFitSamples": composition_trial({m: load(f"{m}-complete.png") for m in MODULES}, load("assembled.png")),
        "sourceHullOnly": composition_trial({m: load(f"hull-{m}.png") for m in MODULES}, load("hull-unarmed.png")),
    }
    report = {
        "schemaVersion": 1, "stage": "AUTHORING_REASSEMBLY_CHECKED_NOT_RUNTIME", "runtimeRegistered": False,
        "splitSceneAppearanceWithinTolerance": True, "beforeAfterSplit": difference,
        "mountCounts": sizes, "mountCoordinatesRoundTripPassed": True,
        "staticLayerTrials": trials, "images": inventory,
        "visualReview": {
            "checked": ["exploded.png", "without-PORT.png", "without-AFT.png", "hull-unarmed.png", "layer-diagnostic.png"],
            "findings": ["完整源轮廓得以保留；侧翼移除后中央尾部与另一侧仍存在。",
                         "移除尾段会暴露内侧连接边，不是已经制作的战损断面。",
                         "五个战斗模块不等于只能用五个绘制层；尾部交错遮挡仍需拆视觉子层。"],
        },
        "pending": ["interleaved visual sublayers", "damage interfaces", "animated layer composition", "runtime collision contours and pivots", "module controls and damage propagation"],
    }
    write_json(OUT / "image-verification.json", report)
    layout = {
        "schemaVersion": 1, "stage": report["stage"], "runtimeRegistered": False,
        "sourceImageSize": master["sourceImageSize"],
        "coordinateConvention": "Source pixels only: x right, y down. Module local = [anchorY - y, x - anchorX], i.e. forward/right. Not final world units or approved runtime pivots.",
        "modules": [{**row, "mountIds": [m["id"] for m in mounts if m["owner"] == row["id"]],
                     "sourceHullImage": f"output/spear-of-adun-art/modules-v01/hull-{row['id']}.png"} for row in master["modules"]],
        "mounts": mounts, "mountCounts": sizes, "ringOwner": "CORE",
        "sourceFaces": master["sourceFaces"], "partitionedSourceFaces": master["partitionedSourceFaces"],
        "evidence": [{"path": str((OUT / name).relative_to(ROOT)).replace("\\", "/"), "sha256": digest(OUT / name)}
                     for name in ("module-master.json", "module-face-map.json", "verification.json", "image-verification.json")],
        "singleLayerPerModuleReady": False, "damageArtReady": False, "pending": report["pending"],
    }
    write_json(ROOT / "docs/spear-of-adun-module-layout-v06.json", layout)
    review_sheet()
    print(json.dumps({"geometry": "passed existing reopened-model checks", "mounts": len(mounts), "images": len(inventory),
                      "beforeAfterSplit": difference, "singleLayerPerModuleReady": False,
                      "runtimeRegistered": False}, ensure_ascii=False))


def review_sheet():
    # Layout only; all ship pixels come from existing Blender renders.
    width, height = 1440, 1120
    board = Image.new("RGB", (width, height), "#10151e")
    draw = ImageDraw.Draw(board)
    font_path = Path("C:/Windows/Fonts/msyh.ttc")
    title = ImageFont.truetype(str(font_path), 28)
    label = ImageFont.truetype(str(font_path), 20)
    small = ImageFont.truetype(str(font_path), 16)
    draw.text((28, 18), "亚顿之矛 · 五段模型分件", font=title, fill="#e3cf98")
    draw.text((28, 60), "实际模型渲染 / 中央环归核心 / 制作审阅，尚未接入战斗", font=small, fill="#a6b5c7")
    panels = [("hull-unarmed.png", "完整源舰体", 0, 384, 960),
              ("exploded.png", "几何分离 · 五段归属", 390, 480, 960),
              ("without-PORT.png", "移除左翼（几何显隐）", 892, 232, 466),
              ("without-AFT.png", "移除尾段（几何显隐）", 1176, 232, 466)]
    for name, text, x, w, h in panels:
        draw.text((x + 16, 106), text, font=label if w > 300 else small, fill="#d2dce8")
        image = load(name)
        image.thumbnail((w, h), Image.Resampling.LANCZOS)
        board.paste(image, (x + (w - image.width) // 2, 143), image)
    draw.text((908, 645), "分件：核心 / 舰艏 / 左翼 / 右翼 / 尾段", font=small, fill="#d2dce8")
    draw.text((908, 684), "保留原生装甲搭接，不按矩形硬裁。", font=small, fill="#a6b5c7")
    draw.text((908, 721), "断面美术与交错遮挡子层尚待制作。", font=small, fill="#d3ac79")
    draw.text((908, 758), "右侧为结构审阅，不是游戏战损效果。", font=small, fill="#a6b5c7")
    draw.text((28, 1082), "源模型 Catholomew · CC BY-NC 4.0 / 本地制作研究；不构成完整游戏 IP 发布授权", font=small, fill="#718195")
    board.save(OUT / "module-review-sheet.png")


if __name__ == "__main__":
    main()
