import type { StageReadView } from '../src/engine/ai/batch/StageProtocol';
import type { AIStageView } from '../src/engine/ai/batch/AIInputs';
import type { FireReadInputs } from '../src/engine/ai/batch/FireProtocol';

// Compile-only assertions: a query may read the shared columns but cannot take
// authority objects, mutate storage, refresh observations or close the owner.
declare const stage: StageReadView;
declare const ai: AIStageView;
declare const fire: FireReadInputs;
const scalar: number = stage.bodies.x[0];
const target: number | undefined = stage.rowById.get('target');
void scalar; void target;
// @ts-expect-error query views do not expose authority objects
void stage.ships;
// @ts-expect-error query views do not expose object identity maps
void stage.rowOf;
// @ts-expect-error queries cannot refresh or close authority leases
stage.close();
// @ts-expect-error numeric columns are read-only
stage.bodies.x[0] = 1;
// @ts-expect-error queries cannot replace producer columns
stage.bodies.x = new Float64Array();
// @ts-expect-error no typed array mutators escape to a query
stage.bodies.x.fill(1);
// @ts-expect-error scalar identity maps are read-only
stage.rowById.set('target', 0);
// @ts-expect-error projectile exclusions are read-only
stage.damagedRows.get(0)?.add(0);
// @ts-expect-error AI supplemental columns are read-only
ai.ai.specSpeed[0] = 1;
// @ts-expect-error AI semantic strings are read-only
ai.ai.ids.push('other');
// @ts-expect-error fire supplemental columns are read-only
fire.weapons[0].cycle = 1;
// @ts-expect-error supplemental numeric cell writes are not allowed
fire.armor[0].cells[0] = 1;
// @ts-expect-error publication roster cache is bridge-only
void fire.scopeByRoster;
