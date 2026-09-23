import type { CampaignRuleProvider, CompiledRuleset, RulesetProfile } from '../Types.js';
export class CampaignRuleRegistry {
  register(provider: CampaignRuleProvider): this;
  compile(profile: RulesetProfile): CompiledRuleset;
}
