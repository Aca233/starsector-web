/** Native combat/class/C: non-fighter ship name + hull class + outcome, 15s hold/5s fade. */
export interface ShipLossNotification {
  id: string;
  shipName: string;
  hullName: string;
  teamId: number;
  time: number;
  // The current simulation has one terminal loss state, not native disabled/recoverable classification.
  status: 'destroyed';
}

export function notificationOpacity(time: number, now: number): number {
  const age = Math.max(0, now - time);
  return age <= 15 ? 1 : Math.max(0, 1 - (age - 15) / 5);
}
