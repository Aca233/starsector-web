import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

/** Retains native input events, labels and page-specific keyboard navigation. */
export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function SearchInput(props, ref) {
  return <input type="search" autoComplete="off" {...props} ref={ref} />;
});

export function EmptyState({ title, children, action, className = '' }: {
  title: string; children?: ReactNode; action?: ReactNode; className?: string;
}) {
  return <div className={className} role="status"><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>;
}
