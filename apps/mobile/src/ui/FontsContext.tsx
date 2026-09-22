// apps/mobile/src/ui/FontsContext.tsx
import { createContext, useContext, type ReactNode } from 'react';

const FontsContext = createContext(false);

export function FontsProvider({ serifLoaded, children }: { serifLoaded: boolean; children: ReactNode }) {
  return <FontsContext.Provider value={serifLoaded}>{children}</FontsContext.Provider>;
}

/** False when the bundled serif failed to load; callers fall back, never block. */
export function useSerifLoaded(): boolean {
  return useContext(FontsContext);
}
