/**
 * An explicit, contiguous schema history. Storage commits and domain validation
 * remain with the caller; migrations never write a file/database or mutate input.
 * copy must return a detached graph (structuredClone or a validated decoder).
 * Keeping that adapter explicit avoids copying an already-decoded large world twice.
 * @template T
 * @typedef {{from: number, to: number, migrate: (draft: T) => T}} MigrationStep
 */

/** @template T
 * @param {{family: string, currentVersion: number, copy: (input: unknown) => T, version: (value: T) => number, steps: readonly MigrationStep<T>[]}} definition
 */
export function createVersionedMigration(definition) {
  const {family, currentVersion, copy, version} = definition;
  if (!family || !Number.isSafeInteger(currentVersion) || currentVersion < 1)
    throw new Error('Invalid migration family or current version');
  /** @type {Map<number, Readonly<MigrationStep<T>>>} */
  const steps = new Map();
  for (const step of definition.steps) {
    if (!Number.isSafeInteger(step.from) || step.from < 1 || step.to !== step.from + 1
      || step.to > currentVersion || steps.has(step.from) || typeof step.migrate !== 'function')
      throw new Error(`Invalid or duplicate ${family} migration ${step.from} -> ${step.to}`);
    // Copy registration: later mutation of a descriptor cannot rewrite history.
    steps.set(step.from, Object.freeze({...step}));
  }
  const oldestVersion = steps.size ? Math.min(...steps.keys()) : currentVersion;
  for (let from = oldestVersion; from < currentVersion; from++) {
    if (!steps.has(from)) throw new Error(`Missing ${family} migration ${from} -> ${from + 1}`);
  }
  return Object.freeze({
    family, currentVersion, oldestVersion,
    steps: Object.freeze([...steps.values()].sort((a, b) => a.from - b.from).map(({from, to}) => Object.freeze({from, to}))),
    /** @param {unknown} input @returns {T} */
    migrate(input) {
      let draft = copy(input);
      const sourceVersion = version(draft);
      if (!Number.isSafeInteger(sourceVersion) || sourceVersion < oldestVersion || sourceVersion > currentVersion)
        throw new Error(`Unsupported ${family} version ${String(sourceVersion)}; original data retained`);
      for (let from = sourceVersion; from < currentVersion; from++) {
        const step = steps.get(from);
        // Registration is checked above; retain this guard if history loading changes.
        if (!step) throw new Error(`Missing ${family} migration ${from} -> ${from + 1}`);
        draft = step.migrate(draft);
        if (version(draft) !== step.to) throw new Error(`${family} migration ${from} did not produce version ${step.to}`);
      }
      return draft;
    },
  });
}
