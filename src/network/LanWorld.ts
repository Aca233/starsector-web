import { aiLoadout, aiHullId } from "./ai-loadouts.mjs";
import { battleTeamLimit } from "../shared/battle-size.mjs";
import { deploymentCost } from "../engine/simulation/CombatDeployment";
import { sameTeam } from "../engine/simulation/CombatTeams";
import { CombatEngine } from "../engine/simulation/CombatEngine";
import { registerLanDesign } from "./LanDesign";
import { createDesign } from "../studio/DesignModel";
import { LAN_MAX_PLAYERS } from "./protocol";
import { Vector2 } from "../engine/math/Vector2";
import type { Ship } from "../engine/simulation/Ship";
import type { Match, Seat, Team } from "./protocol";

/** One roster path for every arrangement. Seat/host ownership is independent of team. */
export function createLanWorld(match: Match) {
  const players = match.players.map(player => ({...player, hull: player.design ? registerLanDesign(player.design, player.seat) : player.hull}));
  // Compile each actual loadout once; equal hulls with different equipment must never share a spec.
  const aiTemplates = new Map<string,string>();
  const aiHull = (hull: string) => {
    let template = aiTemplates.get(hull);
    if (!template) { template = registerLanDesign(aiLoadout(match.options,hull) ?? createDesign(aiHullId(match.options,hull)), LAN_MAX_PLAYERS + aiTemplates.size); aiTemplates.set(hull,template); }
    return template;
  };
  const roster: Array<{ hull: string; team: Team; seat?: Seat }> = [
    ...players.map(({ hull, team, seat }) => ({ hull, team, seat })),
    ...match.options.aiHulls.flatMap((hulls, team) =>
      hulls.map((hull) => ({ hull: aiHull(hull), team: team as Team })),
    ),
  ];
  const host = players.find(
    (player) => player.id === match.hostId && player.seat === 0,
  );
  if (
    !host ||
    new Set(match.players.map((player) => player.seat)).size !==
      match.players.length
  )
    throw Error("无效控制席位");
  const hostTeam = host.team;
  const opponent = roster.find((entry) => entry.team !== hostTeam);
  if (!opponent) throw Error("另一队没有舰船，无法开始战斗");
  // Stable numeric teams drive combat; the boolean remains host-relative presentation metadata.
  const engine = new CombatEngine(host.hull, opponent.hull, match.seed);
  const controlled = new Map<Seat, Ship>();
  engine.multiTeamBattle = true;
  const teams = [...new Set(roster.map(entry=>entry.team))].sort((a,b)=>a-b);
  const positions = match.options.aiHulls.map(()=>0);
  const counts = match.options.aiHulls.map(()=>0);
  for (const entry of roster) counts[entry.team]++;
  const teamIndices = new Map(teams.map((team,index)=>[team,index]));
  for (const entry of roster) {
    const ship =
      entry.seat === 0
        ? engine.playerShip
        : entry === opponent
          ? engine.enemyShip
          : engine.addShip(entry.hull, entry.team === hostTeam, new Vector2(), 0, entry.team);
    ship.teamId = entry.team;
    // Stable construction order gives matching IDs on host and every viewer.
    const index = positions[entry.team]++,
      columns = Math.ceil(Math.sqrt(counts[entry.team]));
    const lateral = ((index % columns) - (columns - 1) / 2) * 1000;
    const teamIndex = teamIndices.get(entry.team)!;
    const angle = Math.PI / 2 + teamIndex * Math.PI * 2 / teams.length;
    // Keep a useful separation between neighbouring fleets as team count grows.
    const radius = Math.max(1200, 1500 / Math.sin(Math.PI / teams.length)) + Math.floor(index / columns) * 1100;
    ship.pos.set(Math.cos(angle)*radius + Math.sin(angle)*lateral, Math.sin(angle)*radius - Math.cos(angle)*lateral);
    ship.prevPos.copy(ship.pos);
    ship.facingRad = angle + Math.PI;
    ship.prevFacingRad = ship.facingRad;
    if (entry.seat !== undefined) controlled.set(entry.seat, ship);
  }
  const limit=battleTeamLimit(match.options.battleSize,teams.length), initialLimit=Math.min(match.options.initialDeploymentLimit??limit,limit);
  const initial=new Set([...controlled.values()].map(ship=>ship.id));
  for(const team of teams){
    const ships=engine.allCapitalShips.filter(ship=>ship.teamId===team);
    if(!ships.some(ship=>initial.has(ship.id)))initial.add(ships[0].id);
    let used=ships.filter(ship=>initial.has(ship.id)).reduce((sum,ship)=>sum+deploymentCost(ship.spec),0);
    for(const ship of ships)if(!initial.has(ship.id)&&used+deploymentCost(ship.spec)<=initialLimit){initial.add(ship.id);used+=deploymentCost(ship.spec);}
  }
  engine.deployment.configure(engine.allCapitalShips,initial,limit,teams.filter(team=>!players.some(p=>p.team===team)));
  // Constructor-created decks preceded the team/formation assignment. Move them with their carrier.
  for (const craft of [...engine.fighters, ...engine.bombers]) if (craft.sourceCarrier) {
    craft.teamId = craft.sourceCarrier.teamId;
    craft.pos.copy(craft.sourceCarrier.pos); craft.prevPos.copy(craft.pos);
    craft.facingRad = craft.sourceCarrier.facingRad; craft.prevFacingRad = craft.facingRad;
  }
  for (const wing of [...engine.playerWings,...engine.enemyWings]) wing.teamId = engine.capitalShips.find(ship=>ship.id===wing.carrierId)?.teamId;
  for (const ship of engine.capitalShips)
    ship.currentTargetShip = engine.findHostile(ship) ?? null;
  return { engine, controlled };
}
/** Reorder the display world only; never duplicate a reinforcement in capitalShips. */
export function setLanPerspective(
  engine: CombatEngine,
  controlled: Map<Seat, Ship>,
  seat: Seat,
) {
  const ships = engine.allCapitalShips;
  const player = controlled.get(seat);
  if (!player) throw Error("当前玩家没有控制席位");
  const enemy = ships.find((ship) => !sameTeam(ship, player))!;
  engine.playerShip = player;
  engine.enemyShip = enemy;
  engine.reinforcements.splice(
    0,
    engine.reinforcements.length,
    ...ships.filter((ship) => ship !== player && ship !== enemy),
  );
  for (const ship of ships)
    ship.currentTargetShip = engine.findHostile(ship) ?? null;
}
