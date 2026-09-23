import type { ReadonlyWorld, CompiledRuleset } from '../../src/campaign/Types.js';
import type { CargoPreviewRequest, CargoPreviewQuote } from '../../src/campaign/client/Protocol.js';
export function quoteCargoPreview(world: ReadonlyWorld, playerId: string, input: CargoPreviewRequest, rules: CompiledRuleset): CargoPreviewQuote;
