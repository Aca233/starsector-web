import type { DeploymentRow, DeploymentState } from '../engine/simulation/CombatDeployment';
import type { Ship as SimulationShip } from '../engine/simulation/Ship';

type Ship=Pick<SimulationShip,'id'|'teamId'|'isDead'|'hullHp'|'isRetreated'|'retreating'>;
/** Viewer membership only. No engine owner, spawn, deployment or retreat command. */
export class LanDisplayDeployment {
  readonly limit: number;
  private readonly entries: Map<string, { ship: Ship; row: DeploymentRow }>;
  constructor(state: DeploymentState, ships: readonly Ship[]) {
    this.limit = state.limit;
    const known = new Map(ships.map(ship => [ship.id, ship]));
    this.entries = new Map(state.rows.map(row => {
      const ship = known.get(row.id);
      if (!ship) throw new Error('Missing display deployment ship');
      return [row.id, { ship, row: { ...row } }];
    }));
  }
  get enabled(): boolean { return this.entries.size > 0; }
  isReserve(id: string): boolean { return this.entries.get(id)?.row.status === 'reserve'; }
  snapshot(): DeploymentState {
    return { limit: this.limit, rows: [...this.entries.values()].map(({ ship, row }) => ({ ...row,
      status: ship.isDead || ship.hullHp <= 0 ? 'destroyed' : ship.isRetreated ? 'retreated'
        : row.status === 'reserve' ? 'reserve' : ship.retreating ? 'retreating' : 'deployed',
    })) };
  }
  used(team: number): number {
    return this.snapshot().rows.filter(row => row.teamId === team && (row.status === 'deployed' || row.status === 'retreating'))
      .reduce((sum, row) => sum + row.cost, 0);
  }
  applySnapshot(state: DeploymentState): void {
    if (!state || state.limit !== this.limit || state.rows.length !== this.entries.size
      || new Set(state.rows.map(row => row.id)).size !== state.rows.length) throw Error('无效部署快照');
    for (const row of state.rows) {
      const entry = this.entries.get(row.id);
      if (!entry || row.teamId !== entry.ship.teamId || row.cost !== entry.row.cost
        || !['reserve', 'deployed', 'retreating', 'retreated', 'destroyed'].includes(row.status)) throw Error('部署快照名单不匹配');
    }
    // Commit only after validating the whole roster, matching the legacy receiver.
    for (const row of state.rows) this.entries.get(row.id)!.row = { ...row };
  }
}
