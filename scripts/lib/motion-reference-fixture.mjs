import { encodeBinaryState, encodeProjectedBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
const vector = (x, y) => ({ $vector: [x, y] });
export function motionFrame() {
  return { tick: 100, acknowledged: { 0: 12 }, ships: [{ state: { pos: vector(10.5, 11.25), life: 1.1 } }], ballast: 'reference-test'.repeat(800),
    layouts: [['pos', 'vel', 'life', 'maxLife', 'size', 'alpha', 'material'],
      ['pos', 'vel', 'rotation', 'angularVel', 'size', 'life'],
      ['id', 'pos', 'vel', 'life', 'maxLife', 'text'],
      ['particles', 'debris', 'floatingTexts', 'hitGlows', 'ignored', 'another'],
      ['id', 'pos', 'prevPos', 'vel', 'elapsedTime', 'flightTimeRemaining', 'armingTimeRemaining', 'sourceMoveSpeed', 'rangeRemaining', 'didDamage']],
    world: { fxSystem: { $record: 3, values: [
      [{ $record: 0, values: [vector(10.25, 20.75), vector(1.25, -3.5), 1.125, 2.125, 4, .125, 'SOURCE_SMOOTH'] }],
      { $records: 1, values: [[vector(20.25, -30.5), vector(-12.5, 5.75), 1.25, -.25, 4.125, 5.75]] },
      { $records: 2, values: [[1, vector(1.25, 2.5), vector(.25, -.75), 3.25, 8.5, 'unchanged text']] },
      { $records: 2, values: [[2, vector(3.25, 4.5), vector(.75, -1.25), 4.25, 9.5, 'unchanged glow']] }, [], { extension: 'unchanged' }], },
      projectiles: { $projectileColumns: [[4, [0, 3, 7, 9], [123, vector(6.25, -7.75), 25.125, false]]],
        values: [[0, vector(60.25, 70.5), vector(50.25, 60.5), .125, 8.125, .525, 1000.25],
          { $record: 4, values: [9, vector(80.25, 90.5), vector(70.25, 80.5), vector(2.25, -3.75), .225, 9.125, .425, 30.125, 1100.25, true] }] },
      unrelated: { pos: vector(99.5, 99.75), vel: vector(12.25, 12.75), life: 22.5 } } };
}
export const motionBytes = (value = motionFrame(), seq = 1) => encodeBinaryState('motion-test', seq, encodeProjectedBinaryFrame(value));
