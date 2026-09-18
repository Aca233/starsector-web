import type { CombatEngine } from '../../engine/simulation/CombatEngine';
import { notificationOpacity } from '../../engine/simulation/CombatNotifications';
import './combat-notifications.css';

/** Local control feedback shares the top-left feed with authoritative loss events. */
export function CombatNotifications({ engine, controlNotice }: { engine: CombatEngine; controlNotice?: string }) {
  const messages = engine.shipLossNotifications
    .filter(message => notificationOpacity(message.time, engine.notificationTime) > 0)
    .slice(-5).reverse();
  return <div className="combat-notifications" role="log" aria-label="战斗通报" aria-live="polite" aria-relevant="additions">
    {controlNotice && <div className="combat-notification combat-control-notice" role="status" data-control-notice>{controlNotice}</div>}
    {messages.map(message => <div key={message.id} className="combat-notification"
      data-ship-id={message.id}
      style={{ opacity: notificationOpacity(message.time, engine.notificationTime) }}>
      <span className={message.teamId === engine.playerShip.teamId ? 'combat-notification-friendly' : 'combat-notification-hostile'}>
        {message.shipName}{message.hullName !== message.shipName && `（${message.hullName}）`}
      </span>{' '}<span>摧毁</span>
    </div>)}
  </div>;
}
