import { identifier, isRecord, requireThat, immutableJSON, canonicalJSON } from './Values.mjs';

/** Explicit composition. A later registration never silently overrides a provider. */
export class CampaignRuleRegistry {
  #providers = new Map();
  register(provider) {
    requireThat(isRecord(provider), 'INVALID_PROVIDER', 'Expected a rule provider');
    const id = identifier(provider.id, 'provider'); identifier(provider.version, 'provider version');
    requireThat(!id.includes(':'), 'INVALID_PROVIDER', 'Provider IDs cannot contain the extension namespace separator');
    identifier(provider.service, 'service');
    requireThat(provider.apiVersion === 1, 'RULE_API', 'Unsupported campaign rule API');
    requireThat(!this.#providers.has(id), 'DUPLICATE_PROVIDER', `Provider already registered: ${id}`);
    requireThat(Array.isArray(provider.capabilities) && new Set(provider.capabilities).size === provider.capabilities.length,
      'INVALID_PROVIDER', 'Provider capabilities must be unique');
    for (const capability of provider.capabilities) identifier(capability, 'capability');
    const methods = { ...(provider.methods ?? {}) }, commands = { ...(provider.commands ?? {}) };
    for (const [key, handler] of [...Object.entries(methods), ...Object.entries(commands)]) {
      identifier(key, 'handler'); requireThat(typeof handler === 'function', 'INVALID_PROVIDER', 'Expected a function');
    }
    const grants = provider.extensionWriteGrants === undefined ? [] : provider.extensionWriteGrants;
    requireThat(Array.isArray(grants) && grants.length <= 32, 'INVALID_PROVIDER', 'Extension grants must be a bounded list');
    const grantServices = new Set();
    for (const grant of grants) {
      requireThat(isRecord(grant) && Object.keys(grant).length === 3 && ['service', 'capabilities', 'commands'].every(k => Object.hasOwn(grant, k)), 'INVALID_PROVIDER', 'Invalid extension grant');
      identifier(grant.service); requireThat(!grantServices.has(grant.service), 'INVALID_PROVIDER', 'Duplicate extension grant service'); grantServices.add(grant.service);
      for (const key of ['capabilities', 'commands']) {
        requireThat(Array.isArray(grant[key]) && grant[key].length > 0 && grant[key].length <= 64 && new Set(grant[key]).size === grant[key].length, 'INVALID_PROVIDER', 'Extension grants require unique explicit commands and capabilities');
        grant[key].forEach(v => identifier(v));
      }
    }
    const metadata = immutableJSON({id, version:provider.version, service:provider.service, apiVersion:1,
      ...(grants.length ? {extensionWriteGrants:grants} : {}), capabilities:provider.capabilities, requires:provider.requires ?? {}, evidence:provider.evidence ?? []});
    for (const [service, capabilities] of Object.entries(metadata.requires)) {
      identifier(service); requireThat(Array.isArray(capabilities), 'INVALID_PROVIDER', 'Invalid service requirements');
      capabilities.forEach(c => identifier(c));
    }
    this.#providers.set(id, Object.freeze({ metadata, methods:Object.freeze(methods), commands:Object.freeze(commands) }));
    return this;
  }
  compile(profile) {
    requireThat(isRecord(profile), 'INVALID_RULESET', 'Expected a ruleset profile');
    identifier(profile.id); identifier(profile.version);
    requireThat(isRecord(profile.providers) && Object.keys(profile.providers).length > 0, 'INVALID_RULESET', 'No providers selected');
    const services = {}, commands = new Map(), commandProviders = new Map(), manifest = {};
    for (const [service, id] of Object.entries(profile.providers).sort(([a],[b]) => a.localeCompare(b))) {
      identifier(service); identifier(id);
      const provider = this.#providers.get(id);
      requireThat(provider && provider.metadata.service === service, 'MISSING_PROVIDER', `Unavailable ${service}: ${id}`);
      services[service] = provider.methods; manifest[service] = provider.metadata;
      for (const [type, handler] of Object.entries(provider.commands)) {
        requireThat(!commands.has(type), 'COMMAND_CONFLICT', `Multiple providers handle ${type}`);
        commands.set(type, handler); commandProviders.set(type, provider.metadata);
      }
    }
    for (const row of Object.values(manifest)) for (const [service, capabilities] of Object.entries(row.requires)) {
      requireThat(manifest[service] && capabilities.every(c => manifest[service].capabilities.includes(c)),
        'RULE_CAPABILITY', `${row.id} requires compatible ${service}`);
    }
    const lock = immutableJSON({apiVersion:1,id:profile.id,version:profile.version,
      originalReference:profile.originalReference ?? null, providers:manifest, settings:profile.settings ?? {}});
    return Object.freeze({lock, services:Object.freeze(services),
      validateWorld(world) {
        requireThat(canonicalJSON(world.rules) === canonicalJSON(lock), 'RULESET_MISMATCH', 'World validation needs the saved providers');
        for (const service of Object.values(services)) if (service.validateWorld) {
          const result = service.validateWorld(world);
          requireThat(!result || typeof result.then !== 'function', 'ASYNC_RULE', 'World validators must be synchronous');
        }
      },
      canWriteExtension(type, extensionId, actorKind) {
        const writer = commandProviders.get(type);
        if (!writer) return false;
        if (extensionId.startsWith(writer.id + ':')) return true;
        if (actorKind !== 'system') return false;
        const owner = Object.values(manifest).find(row => extensionId.startsWith(row.id + ':'));
        return Boolean(owner?.extensionWriteGrants?.some(grant => grant.service === writer.service && grant.commands.includes(type)
          && grant.capabilities.every(capability => writer.capabilities.includes(capability))));
      },
      acceptsLock: other => canonicalJSON(other) === canonicalJSON(lock),
      handler: type => commands.get(type), providerForCommand: type => commandProviders.get(type) });
  }
}
