import { forwardRef, type HTMLAttributes } from 'react';
import './picker.css';

/** A native-button choice collection. Focus movement never commits a choice. */
export const Picker = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Picker({ onKeyDown, ...props }, ref) {
  return <div role="group" data-ui-picker {...props} ref={ref} onKeyDown={event => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLButtonElement>('button[data-picker-item]');
    const choices = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-picker-item]:not(:disabled)'))
      .filter(choice => choice.getClientRects().length && !choice.closest('[inert]'));
    const index = button ? choices.indexOf(button) : -1;
    if (index < 0 || !choices.length) return;
    event.preventDefault(); event.stopPropagation();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length;
    choices[next].focus();
  }} />;
});
