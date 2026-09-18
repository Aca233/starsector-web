# 多队战斗“有船不显示材质”修复（2026-09-17）

## 根因与复现

用户截图中的绿色中心十字、青色/黄色炮口短线和橙色引擎线对应
`WebGLTacticalOverlayPass.renderDebugMarkers` 的 Visual Lab 几何探针，
不是丢失贴图后的替代模型。

`LanBattle` 的默认图层误包含 `markers`。船体绘制遵守当前玩家队伍的
`isVisibleTo(teamId)`，调试探针却只排除死亡舰船，并始终绘制主敌舰/玩家舰。
因此主敌舰离开己方传感器覆盖后，船体正常隐藏，探针却继续泄露舰船位置及挂点，
多队分散部署尤其容易看到“只有彩色骨架、没有材质”。

使用真实 `createLanWorld`、`captureCombat` / `applyCombatSnapshot` 和 WebGL2
构建四队回归。修复前移走敌舰至视野外：船体绘制 **0** 次，但调试精灵仍绘制
**39** 次，中心 400×400 区域有 **1057** 个非背景亮像素。可见舰体的图片已解码，
GPU 无错误，因此此复现不是资源加载失败。

## 修改

- `src/network/LanBattle.tsx`：从正常多人战斗图层移除 `markers`，保留正式识别标记。
- `src/engine/render/webgl/passes/WebGLTacticalOverlayPass.ts`：即使 Visual Lab
  显式打开探针，也排除视野外、后备、死亡、停靠、已撤退舰船。
- 不扩大传感器视野，不开放敌方全图可见，也不改变贴图、战斗属性或存档。

## 回归

新增 `scripts/check-multiteam-render-visibility.mjs`。需要 Vite 开发服务器和可通过
`NODE_PATH` 解析的 Playwright，`COMBAT_TEST_URL` 默认 `http://127.0.0.1:5173`，
`BROWSER_PATH` 可选。运行：

```powershell
node scripts/check-multiteam-render-visibility.mjs
```

覆盖：

1. 四队实际战场快照投影后，房主和两种客机视角（含 team 32 溢出位图路径）
   均提交正确的舰体纹理，并产生可见 GPU 像素。
2. 敌舰离开传感器覆盖后，舰体、调试探针和非背景亮像素均为 0。
3. 敌舰重入视野后恢复舰体及显式开启的调试探针。
4. 死亡、停靠、撤退和后备舰船不留下调试探针。
5. 远处己方增援使用已预载纹理正常绘制。
6. 正式 LAN 战斗不默认启用调试图层。

脚本使用独立浏览器与测试页面，不加入真实房间，不读写玩家存档。

本次验证结果：新增多队回归 6 项全部通过（含浏览器异常列表为空及每次绘制后
`gl.getError() === NO_ERROR`），`npm run lint` 通过，`npm run build` 通过
（保留项目现有的大 chunk 提示）。额外运行旧的 `check-simulation-visibility.mjs`
时，原有 `/锤头/` 按钮选择器在新版舰型列表中匹配到 3 个按钮，触发 Playwright
strict-mode 错误，因此该旧 UI 脚本未完成；本次未改动该脚本或舰型选择界面。
