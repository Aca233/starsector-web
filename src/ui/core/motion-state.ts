import { createContext, useContext } from 'react';

// Modal injects this into --ds-motion-exit-duration, keeping CSS and removal in sync.
export const UI_EXIT_MS = 180;
export const ExitContext = createContext(false);
export const useMotionExiting = () => useContext(ExitContext);
