import { immutableCopy } from './Immutable';
/** Explicit, duplicate-safe extension points. Registration never overwrites behavior. */
export class DefinitionRegistry<T extends { id: string }> {
  private readonly definitions = new Map<string, T>();
  private readonly versions = new Map<string, number>();
  constructor(private readonly kind: string, private readonly validate: (definition: T) => void = () => {}) {}
  register(definition: T, capabilityVersion = 1): void {
    if (typeof definition?.id !== 'string' || !definition.id.trim()) throw new Error(`${this.kind}: missing id`);
    if (this.definitions.has(definition.id)) throw new Error(`${this.kind}: duplicate ${definition.id}`);
    if (!Number.isSafeInteger(capabilityVersion) || capabilityVersion < 1) throw new Error(`${this.kind}: invalid capability version`);
    this.validate(definition);
    this.definitions.set(definition.id, immutableCopy(definition));
    this.versions.set(definition.id, capabilityVersion);
  }
  get(id: string): T | undefined { return this.definitions.get(id); }
  /** Explicit host contract version; source content cannot set or override this. */
  capabilityVersion(id: string): number | undefined { return this.versions.get(id); }
  require(id: string, owner = 'content'): T {
    const definition = this.get(id);
    if (!definition) throw new Error(`${owner}: unsupported ${this.kind} "${id}"; register its implementation before loading content`);
    return definition;
  }
  all(): readonly T[] { return [...this.definitions.values()]; }
}
