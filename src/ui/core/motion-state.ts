import { createContext, useContext } from 'react';

// Modal injects this into --ui-exit-duration, keeping CSS and removal in sync.
export const UI_EXIT_MS = 140;
export const ExitContext = createContext(false);
export const useMotionExiting = () => useContext(ExitContext);
