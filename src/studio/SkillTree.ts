/** Authored-only skill catalog. No custom skills have been authored yet. */
export interface Skill { "id": string; "name": string; "aptitude": string; "order": number; "tier": number; "requiredPoints": number; "extraSkillPoints": number; "quote": string; "author": string; "icon": string; "scope": string; "scopeLabel": string; "source": string }
export interface Aptitude { "id": string; "name": string; "color": string; "description": string; "icon": string }
const tree: { skills: Skill[]; aptitudes: Aptitude[] } = { skills: [], aptitudes: [] };
export default tree;
