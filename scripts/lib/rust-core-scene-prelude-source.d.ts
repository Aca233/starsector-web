declare module 'rust-actual-scene-prelude-stages' {
  export function actualSharedFlux(capital: readonly import('../../src/engine/simulation/Ship').Ship[]): void;
  export function actualDoomed(root: import('../../src/engine/simulation/Ship').Ship): boolean;
}
