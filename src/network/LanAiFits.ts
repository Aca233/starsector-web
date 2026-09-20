import { createDesign, evaluate, type Design } from '../studio/DesignModel';
import { nativeVariantsForHull } from '../studio/NativeVariantCatalog';
import { importNativeVariant } from '../studio/NativeVariantImport';
import type { LoadoutFlyoutOption } from '../ui/LoadoutFlyout';
import { validateLanDesign } from './LanDesign';
import type { AiEditTarget } from './LanAiEditor';

type Selection = NonNullable<AiEditTarget['returnSelection']>;
export interface AiFitOption { display: LoadoutFlyoutOption; selection: Selection | null }

function fitOption(id: string, name: string, source: string, load: () => { design: Design; warnings?: string[] }): AiFitOption {
  try {
    const { design, warnings } = load();
    const { op } = evaluate(design);
    let error = '';
    try { validateLanDesign(design); }
    catch (cause) { error = cause instanceof Error ? cause.message : '配装需要修正'; }
    return {
      selection: { design, source, nativeId: id, warnings },
      display: { id, name, detail: Object.values(design.weapons).filter(Boolean).length + ' 门武器 · 电容 ' + design.capacitors + ' · 耗散 ' + design.vents,
        cost: op.used + ' OP', error },
    };
  } catch (cause) {
    return { selection: null, display: { id, name, detail: '', cost: '', error: cause instanceof Error ? cause.message : '配装不可用' } };
  }
}

/** Saved fits are complete snapshots, not instructions to re-import a stock variant.
 * Match the exact hull (including skins), and keep saved/native identities separate. */
export function aiFitsForHull(hullId: string, savedDesigns: readonly Design[] = []): AiFitOption[] {
  const saved = savedDesigns.filter(design => design.hullId === hullId).map(design =>
    fitOption('saved:' + design.id, design.name + ' · 已保存', '已保存装配', () => ({ design: structuredClone(design) })));
  const native = nativeVariantsForHull(hullId);
  return [...saved, ...(native.length ? native : [null]).map(choice =>
    fitOption(choice ? 'native:' + choice.id : 'default:' + hullId, choice?.name ?? '舰体默认装配', choice ? '原版预设配装' : '舰体默认装配',
      () => choice ? importNativeVariant(choice.raw) : { design: createDesign(hullId), warnings: ['没有独立原版预设，使用舰体默认装配。'] }))];
}
