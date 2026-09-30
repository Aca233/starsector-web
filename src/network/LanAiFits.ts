import { createDesign, evaluate, type Design } from '../studio/DesignModel';
import { nativeVariantsForHull } from '../studio/NativeVariantCatalog';
import { extensionVariantsForHull } from '../studio/ExtensionVariantCatalog';
import type { ShipSpec } from '../engine/content/ShipSpec';
import { importNativeVariant } from '../studio/NativeVariantImport';
import type { LoadoutFlyoutOption } from '../ui/LoadoutFlyout';
import { validateLanDesign } from './LanDesign';
import type { AiEditTarget } from './LanAiEditor';

type Selection = NonNullable<AiEditTarget['returnSelection']>;
export interface AiFitOption { display: LoadoutFlyoutOption; selection: Selection | null }

function fittedWeaponCount(spec: ShipSpec): number {
  return spec.weaponSlots.filter(slot => slot.defaultWeaponId).length
    + (spec.modules ?? []).reduce((count, module) => count + fittedWeaponCount(module.spec), 0);
}

/** Metadata only: counting choices must not compile presets or create drafts. */
export function aiFitCountForHull(hullId: string, savedCount = 0): number {
  return 1 + nativeVariantsForHull(hullId).length + extensionVariantsForHull(hullId).length + savedCount;
}

function fitOption(id: string, name: string, source: string, load: () => { design: Design; warnings?: string[] }): AiFitOption {
  try {
    const { design, warnings } = load();
    const { op, spec } = evaluate(design);
    let error = '';
    try { validateLanDesign(design); }
    catch (cause) { error = cause instanceof Error ? cause.message : '配装需要修正'; }
    return {
      selection: { design, source, nativeId: id, warnings },
      display: { id, name, detail: fittedWeaponCount(spec) + ' 门武器' + (spec.modules?.length ? '（含子模块）' : '') + ' · 电容 ' + design.capacitors + ' · 耗散 ' + design.vents,
        cost: op.used + ' OP', error },
    };
  } catch (cause) {
    return { selection: null, display: { id, name, detail: '', cost: '', error: cause instanceof Error ? cause.message : '配装不可用' } };
  }
}

/** Listing is read-only: blank hulls, opt-in presets and saved snapshots stay separate.
 * Match the exact hull (including skins); applying a choice still requires an explicit action. */
export function aiFitsForHull(hullId: string, savedDesigns: readonly Design[] = []): AiFitOption[] {
  const saved = savedDesigns.filter(design => design.hullId === hullId).map(design =>
    fitOption('saved:' + design.id, design.name + ' · 已保存', '已保存装配', () => ({ design: structuredClone(design) })));
  const blank = fitOption('default:' + hullId, '空白舰体（保留内置）', '空白舰体（保留内置）',
    () => ({ design: createDesign(hullId), warnings: ['新舰体不预装可换装备；可手动选择预设、改装或选择保存方案。'] }));
  const native = nativeVariantsForHull(hullId).map(choice =>
    fitOption('native:' + choice.id, choice.name, '原版预设配装', () => importNativeVariant(choice.raw)));
  const extensions = extensionVariantsForHull(hullId).map(choice =>
    fitOption('extension:' + choice.id, choice.name, 'Web扩展预设配装',
      () => ({ design: choice.create(), warnings: [...(choice.warnings ?? ['Web扩展配装；选择并添加后才用于 AI 舰船，不改变当前玩家配装。'])] })));
  return [...saved, blank, ...native, ...extensions];
}
