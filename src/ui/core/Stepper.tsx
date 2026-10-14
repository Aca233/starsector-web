/** No wrapper: the existing page grid continues to own the three controls. */
export function Stepper({ id, label, value, min = 0, max, onChange, buttonClassName = 'native-step', disabled = false }: {
  id: string; label: string; value: number; min?: number; max: number; onChange: (value: number) => void;
  buttonClassName?: string; disabled?: boolean;
}) {
  return <>
    <button type="button" className={buttonClassName} aria-label={'减少' + label} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>−</button>
    <input id={id} aria-label={label} type="number" min={min} max={max} value={value} disabled={disabled} onChange={event => onChange(event.target.valueAsNumber)} />
    <button type="button" className={buttonClassName} aria-label={'增加' + label} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button>
  </>;
}
