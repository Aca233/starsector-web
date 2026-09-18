import { createContext } from 'react';
export const DwellContext = createContext<{ ownerId: string; depth: number; locked: boolean; native?: boolean; linked?: boolean } | null>(null);
