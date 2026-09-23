import type { CampaignCommand, CompiledRuleset, DeepReadonly, PlannedCommand, Principal, ReadonlyWorld } from '../Types.js';
export function validateCommand(command: unknown): DeepReadonly<CampaignCommand>;
export function authorizePrincipal(world: ReadonlyWorld, principal: unknown): DeepReadonly<Principal>;
export function planCampaignCommand(world: ReadonlyWorld, command: unknown, principal: Principal, ruleset: CompiledRuleset): PlannedCommand;
