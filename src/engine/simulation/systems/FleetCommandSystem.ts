import { Vector2 } from '../../math/Vector2';
import { RadioMessage, TacticalOrder } from '../CombatTypes';
import { sound } from '../../audio/SoundManager';
import { SimulationRandom } from '../SimulationRandom';

export interface CommandFXCallbacks {
  addFloatingText: (pos: Vector2, text: string, color: [number, number, number], size: number, duration: number) => void;
  getPlayerPos: () => Vector2;
  getPlayerShipId: () => string;
}

export class FleetCommandSystem {
  public commandPoints = 5;
  private recoveryElapsed = 0;
  public selectedUnitId: string | null = null;
  public orders: Map<string, TacticalOrder> = new Map();
  public radioMessages: RadioMessage[] = [];
  public isTacticalMap = false;

  constructor(private readonly visualRandom = new SimulationRandom(0xc04d4e44)) {}

  public clear() {
    this.commandPoints = 5;
    this.recoveryElapsed = 0;
    this.selectedUnitId = null;
    this.orders.clear();
    this.radioMessages = [];
    this.isTacticalMap = false;
  }

  /** settings.json: baseSecondsPerCommandPoint=120; initial points are not a cap. */
  public advance(dt: number, rateFlat = 0) {
    this.recoveryElapsed += Math.max(0, dt) * Math.max(0, 1 + rateFlat);
    const recovered = Math.floor(this.recoveryElapsed / 120);
    if (recovered) { this.commandPoints += recovered; this.recoveryElapsed -= recovered * 120; }
  }

  public toggleTacticalMap() {
    this.isTacticalMap = !this.isTacticalMap;
    if (this.isTacticalMap) {
      sound.play('map_open', 0.85);
    } else {
      sound.play('map_close', 0.85);
    }
  }

  public addRadioMessage(
    sender: string,
    senderFaction: 'PLAYER' | 'ENEMY' | 'HQ',
    text: string,
    color: [number, number, number] = [100, 200, 255],
    combatTime = 0
  ) {
    this.radioMessages.push({
      id: this.visualRandom.nextNumericId(),
      sender,
      senderFaction,
      text,
      time: combatTime,
      color
    });
    if (this.radioMessages.length > 8) {
      this.radioMessages.shift();
    }
    sound.play('comm_radio', 0.65);
  }

  public selectUnit(unitId: string | null, fx: CommandFXCallbacks) {
    if (this.selectedUnitId === unitId) return;
    this.selectedUnitId = unitId;
    if (unitId === null) {
      sound.play('command_deselect', 0.7);
    } else {
      sound.play('map_open', 0.8);
      const title = unitId === fx.getPlayerShipId()
        ? 'FLAGSHIP SELECTED'
        : unitId.includes('ftr')
        ? 'BROADSWORD WING SELECTED'
        : unitId.includes('bmr')
        ? 'DAGGER FLIGHT SELECTED'
        : 'UNIT SELECTED';
      fx.addFloatingText(fx.getPlayerPos(), title, [80, 220, 255], 15, 1.5);
    }
  }

  public issueOrder(unitId: string, order: TacticalOrder, fx: CommandFXCallbacks, combatTime = 0): boolean {
    if (this.commandPoints <= 0) {
      sound.play('command_out_of_cp', 0.9);
      fx.addFloatingText(fx.getPlayerPos(), '! OUT OF COMMAND POINTS !', [255, 60, 60], 18, 2.0);
      return false;
    }

    // 扣除 1 CP
    this.commandPoints--;
    this.orders.set(unitId, order);

    if (order.type === 'ASSAULT') {
      sound.play('command_engage', 0.85);
      this.addRadioMessage('战术指挥', 'PLAYER', unitId === 'fleet' ? '全舰解除原有任务，自主选择敌舰进攻。' : '该舰解除原有任务，自主选择敌舰进攻。', [160, 230, 140], combatTime);
    } else if (order.type === 'DEFEND' || order.type === 'ESCORT' || order.type === 'AVOID') {
      sound.play('command_waypoint', 0.85);
      this.addRadioMessage('战术指挥', 'PLAYER', order.type === 'DEFEND' ? '保持指定防守位置。' : order.type === 'ESCORT' ? '护航舰已派出。' : '与指定敌舰拉开距离。', [120, 220, 255], combatTime);
    } else if (order.type === 'ENGAGE') {
      sound.play('command_engage', 0.85);
      fx.addFloatingText(fx.getPlayerPos(), 'DIRECT ENGAGE ORDER ISSUED', [255, 100, 100], 15, 1.6);
      this.addRadioMessage('战术指挥', 'PLAYER', '已向编队下达集火强袭指令！', [255, 120, 120], combatTime);
    } else if (order.type === 'WAYPOINT') {
      sound.play('command_waypoint', 0.85);
      fx.addFloatingText(order.targetPos || fx.getPlayerPos(), 'WAYPOINT DESIGNATED', [100, 220, 255], 14, 1.6);
      this.addRadioMessage('领航火控', 'PLAYER', '战术航路点已标定，机动单元按标点机动。', [120, 220, 255], combatTime);
    }
    return true;
  }

  public cancelOrder(unitId: string, fx: CommandFXCallbacks, combatTime = 0) {
    if (this.orders.has(unitId)) {
      this.orders.delete(unitId);
      sound.play('command_refund', 0.8);
      fx.addFloatingText(fx.getPlayerPos(), 'ORDER CANCELLED', [160, 230, 140], 14, 1.5);
      this.addRadioMessage('战术指挥', 'PLAYER', '已取消指定战术部署命令。', [160, 230, 140], combatTime);
    }
  }
}
