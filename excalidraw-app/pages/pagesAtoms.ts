import { atom } from "../app-jotai";
import { importFromLocalStorage } from "../data/localStorage";

import { ensurePagesState } from "./pagesUtils";

import type { PagesState } from "./pagesUtils";

/**
 * Shared pages state, booted synchronously from localStorage (migrating the
 * legacy single scene into "Page 1" on first run). Read/write via the
 * app-level jotai store so both `App.tsx` (autosave) and the sidebar tab
 * (management UI) stay in sync.
 */
const bootPagesState = (): PagesState => {
  const legacy = importFromLocalStorage();
  return ensurePagesState({
    elements: legacy.elements,
    appState: legacy.appState,
  });
};

export const pagesStateAtom = atom<PagesState>(bootPagesState());
