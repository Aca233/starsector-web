import { hullModDefinitions } from '../engine/extensions/HullMods';
import { modDescriptions } from './DesignModel';
function EffectText({ text }: { text: string }) {
  return <>{text.split(/(\d+(?:\.\d+)?%?)/g).map((part, i) => /^\d/.test(part) ? <mark key={i}>{part}</mark> : part)}</>;
}
export function ModInformation({ id }: { id: string }) {
  const definition = hullModDefinitions.get(id);
  return <>
    <p className="equipment-design">设计类型：{definition?.refit?.manufacturer || '未分类'}</p>
    <p><EffectText text={modDescriptions[id] ?? '当前仅保留原版元数据，效果尚未实现。'} /></p>
    {id === 'heavyarmor' && <section className="equipment-smod"><h4>S-插件 惩罚 · 原版参考</h4>
      <p>降低舰船 <mark>25%</mark> 的机动性。</p><small>仅原版固化为 S-插件时生效。Web 尚未接入固化；普通安装不施加此惩罚。</small></section>}
    {definition?.support?.scope === 'mixed' && <p className="equipment-state">{definition.support.summary}</p>}
    {definition?.support?.scope === 'campaign-only' ? <p className="equipment-state">仅战役 · 当前无战役模拟</p>
      : definition?.status === 'metadata-only' ? <p className="equipment-state">尚未实现 · 当前仅保留原版资料，未应用战斗效果</p> : null}
  </>;
}

