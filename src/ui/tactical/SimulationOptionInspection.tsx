import { RefitInspection, type InspectionTarget } from '../../studio/RefitInspection';
import { RefitHoverTerm } from '../../studio/RefitHoverTerms';
import { LoadoutSection } from '../../studio/VariantInspection';
import type { OpenWeaponCodex } from '../../studio/useInspectionCodex';
import { prepareSimulationOption, type SimulationOption } from './SimulationRoster';

export function SimulationOptionInspection({ option, children, onOpenCodex, enabled }: {
  option: SimulationOption; children: InspectionTarget; onOpenCodex: OpenWeaponCodex; enabled: boolean;
}) {
  return <RefitInspection title={option.name + ' · ' + option.variantName} className="refit-loadout-inspection simulation-option-inspection"
    enabled={enabled} content={<SimulationOptionInformation option={option} onOpenCodex={onOpenCodex} />}>{children}</RefitInspection>;
}
function SimulationOptionInformation({ option, onOpenCodex }: { option: SimulationOption; onOpenCodex: OpenWeaponCodex }) {
  const resolved = prepareSimulationOption(option);
  return <>
    <p><RefitHoverTerm term="deploymentPoints">单艘部署点（DP）</RefitHoverTerm> {resolved.cost || '不可用'}</p>
    <p className="refit-inspection-note">只读方案资料。点击原方案行才选中 / 取消选择，再点“部署”才入场；查看装备不会增加部署数量。</p>
    {resolved.errors.length > 0 && <section className="refit-inspection-warnings"><h4>不可部署</h4><ul>{resolved.errors.map((error,index) => <li key={index}>{error}</li>)}</ul></section>}
    {resolved.design ? <LoadoutSection draft={resolved.design} spec={resolved.spec} onOpenCodex={onOpenCodex} />
      : <p className="equipment-state">未能读取完整装配，不将舰体默认数据冒充此方案。</p>}
    {resolved.warnings.length > 0 && <RefitInspection title="适配说明"
      content={<ul>{resolved.warnings.map((warning,index) => <li key={index}>{warning}</li>)}</ul>}>
      <button type="button" className="refit-inspection-item"><span>适配说明</span><small>{resolved.warnings.length} 项</small></button>
    </RefitInspection>}
  </>;
}
