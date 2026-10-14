import { lazy, Suspense } from 'react';
import { contentRegistry } from '../engine/content/ContentRegistry';
import { PageState } from '../ui/core/PageState';
import { NativeButton } from '../ui/core/NativeControls';
import { VISUAL_SCENARIOS } from './VisualScenarioController';

const CombatView = lazy(() => import('../CombatView'));

/** Original lab scenes require their actual hulls; never substitute a different simulation. */
export default function VisualLabEntry() {
  const requested = new URLSearchParams(location.search).get('scene');
  const scene = VISUAL_SCENARIOS.find(value => value.id === requested) ?? VISUAL_SCENARIOS[0];
  if (!contentRegistry.getShip(scene.shipId)) return <PageState title="视觉实验暂不可用" error
    actions={<><NativeButton onClick={() => location.assign('?view=design')}>返回舰船设计</NativeButton><NativeButton onClick={() => location.assign('./')}>返回指挥中心</NativeButton></>}>
    <p>当前场景「{scene.title}」使用的舰体 <code>{scene.shipId}</code> 未加载。</p>
    <p>此实验依赖指定舰体。可以返回舰船设计，使用已加载的舰船进行模拟战斗。</p>
  </PageState>;
  return <Suspense fallback={<div className="native-loading" role="status">正在准备视觉实验…</div>}><CombatView /></Suspense>;
}
