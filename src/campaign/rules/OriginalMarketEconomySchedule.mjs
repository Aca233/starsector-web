import { integer, requireThat, immutableJSON } from '../core/Values.mjs';
import { ORIGINAL_MARKET_ECONOMY as R, economyShape, economyFloat } from './OriginalMarketEconomy.mjs';
const f = Math.fround, iterations = R.settings.economyIterPerMonth, tasks = R.formulas.taskOrder;
export function initialOriginalEconomySchedule() { return immutableJSON({ schemaVersion: 1, phase: 'WAITING', elapsed: 1000, untilNext: 3, iterLeft: iterations, prevMonth: -1, taskIndex: null }); }
/** Ports scheduler decisions only. A real task runner must report completion; no global economy tasks are pretended to have run. */
export function restoreOriginalEconomySchedule(previous) {
  economyShape(previous, ['schemaVersion', 'phase', 'elapsed', 'untilNext', 'iterLeft', 'prevMonth', 'taskIndex'], 'economy schedule');
  requireThat(previous.schemaVersion === 1 && ['WAITING', 'DOING_TASKS'].includes(previous.phase), 'UNSUPPORTED_ECONOMY_SCHEDULE', 'Unknown schedule');
  economyFloat(previous.elapsed, 'elapsed days', 0); economyFloat(previous.untilNext, 'interval days', 0); integer(previous.iterLeft, 'iterations left');
  requireThat(previous.iterLeft <= iterations && (previous.prevMonth === -1 || Number.isInteger(previous.prevMonth) && previous.prevMonth >= 1 && previous.prevMonth <= 12), 'UNSUPPORTED_ECONOMY_SCHEDULE', 'Invalid iteration/month state');
  requireThat(previous.phase === 'WAITING' ? previous.taskIndex === null : Number.isInteger(previous.taskIndex) && previous.taskIndex >= 0 && previous.taskIndex < tasks.length, 'UNSUPPORTED_ECONOMY_SCHEDULE', 'Invalid task cursor');
  return immutableJSON(previous);
}
function advance(previous, frame, dispatch = null) {
  previous = restoreOriginalEconomySchedule(previous);
  economyShape(frame, ['amountDays', 'month', 'day', 'daysInMonth', 'completedTask'], 'native economy frame');
  economyFloat(frame.amountDays, 'frame game days', 0, 31); integer(frame.month, 'month', 1); integer(frame.daysInMonth, 'days in native civil month', 28); integer(frame.day, 'civil day', 1);
  requireThat(frame.month <= 12 && frame.daysInMonth <= 31 && frame.day <= frame.daysInMonth, 'UNSUPPORTED_ECONOMY_SCHEDULE', 'Provide the real Calendar civil date, not elapsed-day modulo 30');
  const state = structuredClone(previous), events = [];
  const emit = event => { events.push(event);return dispatch?.(immutableJSON(event), immutableJSON(state)); };
  state.elapsed = f(f(state.elapsed) + f(frame.amountDays));
  if (state.phase === 'WAITING' && frame.month !== state.prevMonth) {
    state.prevMonth = frame.month; state.iterLeft = iterations; state.untilNext = f(f(frame.daysInMonth - frame.day) / f(iterations)); state.elapsed = f(state.untilNext / 2);
    emit({ type: 'economy-tick', iteration: iterations - 1 });emit({ type: 'economy-month-end' });
  }
  if (state.phase === 'WAITING' && state.elapsed >= state.untilNext && state.iterLeft > 0) {
    state.iterLeft--; state.phase = 'DOING_TASKS'; state.elapsed = 0; state.taskIndex = 0;
    emit({ type: 'begin-economy-pass', withStockpileUpdate: state.iterLeft <= 0, iteration: iterations - state.iterLeft - 1 });
  }
  if (state.phase === 'DOING_TASKS') {
    const activeTask = tasks[state.taskIndex], reported = emit({ type: 'advance-task', task: activeTask });
    if (dispatch) requireThat(typeof reported === 'boolean', 'ECONOMY_TASK_ORDER', 'Task runtime must report actual synchronous completion');
    const completedTask = dispatch ? reported ? activeTask : null : frame.completedTask;
    if (completedTask !== null) {
      requireThat(completedTask === activeTask, 'ECONOMY_TASK_ORDER', 'Cannot skip or reorder native tasks'); state.taskIndex++;
      if (state.taskIndex === tasks.length) { if (state.iterLeft > 0) emit({ type: 'economy-tick', iteration: iterations - state.iterLeft - 1 }); state.phase = 'WAITING'; state.taskIndex = null; }
    }
  } else requireThat(frame.completedTask === null, 'ECONOMY_TASK_ORDER', 'No active native task to complete');
  return immutableJSON({ state, events });
}

/** Decision-only compatibility entry; completion must describe a task actually executed by its caller. */
export function advanceOriginalEconomySchedule(previous,frame){return advance(previous,frame);}
/** Execute native callbacks in order, rather than calculating completion before the task runs. */
export function advanceOriginalEconomyScheduleWithRuntime(previous,frame,runtime){
  economyShape(frame,['amountDays','month','day','daysInMonth'],'current native calendar frame');
  const methods=['setScheduleState','beginEconomyPass','advanceTask','reportSectorEconomyTick','reportManagedEconomyTick','reportSectorEconomyMonthEnd','reportManagedEconomyMonthEnd'];
  for(const method of methods)requireThat(typeof runtime?.[method]==='function','UNSUPPORTED_ECONOMY_SCHEDULE','Missing scheduled runtime '+method);
  const call=(method,...args)=>{const result=runtime[method](...args);requireThat(!result||typeof result.then!=='function','UNSUPPORTED_ECONOMY_SCHEDULE','Scheduled runtime must be synchronous: '+method);return result;};
  const result=advance(previous,{...frame,completedTask:null},(event,state)=>{
    call('setScheduleState',state);
    if(event.type==='begin-economy-pass')call('beginEconomyPass',event.withStockpileUpdate);
    else if(event.type==='advance-task')return call('advanceTask',event.task);
    else if(event.type==='economy-tick'){call('reportSectorEconomyTick',event.iteration);call('reportManagedEconomyTick',event.iteration);}
    else {call('reportSectorEconomyMonthEnd');call('reportManagedEconomyMonthEnd');}
  });
  call('setScheduleState',result.state);return result;
}
