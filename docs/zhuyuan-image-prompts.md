# 烛渊 — 生图提示词与资产清单

最新进展：用户已提供舰体、炮塔和技能三张成图，并授权本地处理；四份运行时贴图已接入。下面保留前期提示词与失败记录，不代表当前仍缺美术。详细来源与验证见 `docs/zhuyuan-source-notes.md`。

前期模式：内置 image_gen；船体实际调用两次，均失败（503 / model_not_found）。武器和技能图标仅保留待生成提示词，未冒充调用成功。后续经用户授权用现有中转尝试 gpt-image-1，也返回无通道；没有成功产图。

## 舰体（首次实际提交）

Use case: stylized-concept. Create ONE production-ready original spaceship sprite for a 2D top-down space combat game, not a concept sheet. Subject: ZHU YUAN / Candle Abyss, an original exotic prism cruiser. Strict orthographic TOP DOWN plan view, perfectly vertical, bow pointing UP, stern DOWN, bilateral near-symmetry, absolutely no isometric or perspective foreshortening. Design: dramatic split crescent spearhead bow with two long armored prongs framing an open narrow central void; a small glowing cyan reactor-lens suspended between these prongs; solid central keel and broad armored stern with two strong engine nacelles, three short engine nozzles pointing down. The silhouette must feel like a predatory cathedral tuning fork, unmistakable and unlike any existing franchise ship. Ivory ceramic armor with dark gunmetal recessed mechanical internals, restrained antique-brass trims, fine cyan conduits, subtly weathered high-tech naval engineering. Thin cyan emissive strips, not a huge bloom. Exquisitely detailed hand-painted game sprite, crisp readable silhouette at reduced size, flat even overhead studio lighting, dense hard-surface details. Reserve a round large turret mounting recess on the center keel, halfway down, and four smaller mounting recesses symmetrically around it. No installed protruding guns, no external exhaust trails. The whole ship fits fully inside the frame with 8 percent transparent padding around all sides. Portrait 2:3 composition, ship approximately 65 percent as wide as tall. Genuinely transparent RGBA background: no stars, no black backdrop, no gradient, no ground shadow, no lettering, no labels, no frame, no watermark. Output exactly one isolated ship sprite.

## 舰体（第二次实际提交）

Generate one original 2D top-down spaceship game sprite on a truly transparent background. Orthographic overhead view, bow straight up. Original cruiser named Candle Abyss: ivory ceramic armor, black gunmetal machinery, fine antique gold trims, cyan energy conduits. Unmistakable split crescent tuning-fork bow with two slender armored prongs around an open void and a cyan reactor lens, solid central keel, broad aft body and paired stern engine pods. Crisp hand-painted hard-surface game art, readable detailed silhouette, even overhead light, no perspective. Centered full ship with generous clear transparent margins. No stars, backdrop, floor, text, labels, exhaust trails, watermark or collage. Single portrait sprite.

## 武器：缝星针（待生成）

Use case: stylized-concept. One original top-down orthographic 2D medium energy gun turret sprite, barrel pointing straight up, genuinely transparent RGBA background. A precision prism needle cannon: three narrow parallel gunmetal focusing rails around one cyan light channel, ivory ceramic circular turret base, fine brass trim. Same overhead flat lighting and crisp hand-painted naval engineering as the Candle Abyss ship. Compact base and long slender barrel, readable at 48 pixels. Entire weapon within transparent margins. No ground shadows, no muzzle flare, no text, no labels, no background, no watermark. Single game asset, not a presentation board.

## 技能：日蚀协议（待生成）

Use case: stylized-concept. One square tactical skill icon for a science-fiction space combat game. An obsidian eclipsed star encircled by a thin ivory-gold crescent, pierced vertically by three luminous cyan prism needles. Strong legible silhouette, restrained glow, high contrast against a deep navy square background, crisp painterly game UI finish, readable at 48 pixels. Centered geometry with safe margins. No text, lettering, labels, decorative border, watermark or collage.

## 文件目标（现已用用户提供的成图完成）

- public/game-assets/graphics/ships/web_zhuyuan/zhuyuan.png
- public/game-assets/graphics/weapons/web_zhuyuan/star_needle_turret.png
- public/game-assets/graphics/icons/hullsys/web_zhuyuan_eclipse.png

用户提供的素材已做透明底处理、运行时缩放和几何校准，并已更新资源清单。
