import { Modal } from '../ui/core/UI';
import { NativeButton } from '../ui/NativeChrome';
import { teamName, type Match } from './protocol';
import type { BattleEnded, BattleReportShip, BattleShipStatus } from './battle-report.mjs';

const labels:Record<BattleShipStatus,string> = {deployed:'在场', retreating:'撤退中', retreated:'已撤离', reserve:'未出场', destroyed:'已损失'};
export function LanBattleReport({match, seat, result, error='', onReturn, returnLabel='返回房间'}:{
  match:Match;seat:number;result:BattleEnded|null;error?:string;onReturn:()=>void;returnLabel?:string;
}) {
  const ownTeam = match.players.find(player => player.seat === seat)?.team;
  const complete = result?.winner !== undefined;
  const report = complete ? result?.report : undefined;
  const title = !complete ? '对局已中断' : result.winner === 'draw' ? '战斗平局' : result.winner === ownTeam ? '战斗胜利' : '战斗失利';
  const grouped = new Map<number,BattleReportShip[]>();
  for (const ship of report?.ships ?? []) { const rows=grouped.get(ship.team) ?? []; rows.push(ship); grouped.set(ship.team,rows); }
  const teams = [...grouped.keys()].sort((a,b) => Number(b === ownTeam)-Number(a === ownTeam) || a-b);
  const time = Math.floor(report?.seconds ?? 0);
  return <Modal title={title} eyebrow="战斗报告" width={report?'wide':'small'} initialFocus="panel" className="lan-battle-report"
    onClose={onReturn} footer={<NativeButton onClick={onReturn}>{returnLabel}</NativeButton>}>
    <p className={!complete?'lan-error':'lan-report-reason'}>{result?.reason || error || '本局未正常完成，不判定胜负。'}</p>
    {!complete && <p>本局没有完整结算，不将中断时的舰体读数当作最终战果。返回后可以检查连接并重新准备。</p>}
    {complete && !report && <p>未收到完整战斗报告，无法显示舰队战果。</p>}
    {report && <>
      <p className="lan-report-meta">战斗时长 {Math.floor(time/60)}分{String(time%60).padStart(2,'0')}秒 · 编成 {report.ships.length}艘</p>
      <div className="lan-report-teams">{teams.map(team => {
        const ships = grouped.get(team)!;
        const count = (status:BattleShipStatus) => ships.filter(ship => ship.status === status).length;
        const lostDP = ships.filter(ship => ship.status === 'destroyed').reduce((sum,ship) => sum+ship.cost,0);
        const teamTitle = match.options.assignment === 'solo' ? match.players.find(player => player.team === team)?.name ?? teamName(team) : teamName(team);
        return <details className="lan-report-team" key={team} open={team === ownTeam}>
          <summary><strong>{teamTitle}{team === ownTeam?' · 本队':''}{result?.winner === team?' · 获胜':''}</strong>
            <span>在场 {count('deployed')+count('retreating')} · 损失 {count('destroyed')} · 撤离 {count('retreated')} · 待命 {count('reserve')} · 损失 {lostDP} DP</span></summary>
          <div className="lan-report-table-scroll"><table><caption>{teamTitle}舰船结算</caption><thead><tr><th scope="col">舰船 / 驾驶员</th><th scope="col">状态</th><th scope="col">部署点</th><th scope="col">剩余结构</th><th scope="col">战备</th></tr></thead>
            <tbody>{ships.map(ship => <tr key={ship.id} data-status={ship.status}>
              <th scope="row">{ship.name}<small>{ship.seat === null?'AI':match.players.find(player => player.seat === ship.seat)?.name ?? '玩家'}{ship.seat === seat?' · 你':''}</small></th>
              <td>{labels[ship.status]}</td><td>{ship.cost} DP</td><td>{Math.round(ship.hull)} / {Math.round(ship.hullMax)}<small>{Math.round(ship.hull/ship.hullMax*100)}%</small></td><td>{Math.round(ship.cr*100)}%</td>
            </tr>)}</tbody></table></div>
        </details>;
      })}</div>
      <p className="lan-report-note">统计包含主舰与后备舰，不包含舰载机；撤退中仍算在场。仅展示主机实际结算状态，不推算伤害、击杀或奖励。本局损伤不覆盖房间配装。</p>
    </>}
  </Modal>;
}
