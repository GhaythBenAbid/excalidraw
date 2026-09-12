/**
 * Multi-page support for excalidraw-app (local-only).
 *
 * Each page holds its own scene (elements + relevant appState) and all pages
 * are persisted to localStorage under a single key so switching is instant
 * and everything autosaves locally. Binary files (images) keep living in the
 * shared IndexedDB file storage, keyed by fileId.
 */

import { clearAppStateForLocalStorage } from "@excalidraw/excalidraw/appState";

import { getNonDeletedElements } from "@excalidraw/element";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

export const PAGES_TAB = "pages";

export const PAGES_STORAGE_KEY = "excalidraw-pages-v1";

export interface PageData {
  id: string;
  name: string;
  elements: ExcalidrawElement[];
  appState: Partial<AppState> | null;
  createdAt: number;
  updatedAt: number;
}

export interface PagesState {
  pages: PageData[];
  activePageId: string;
}

export const generatePageId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

export const defaultPageName = (pages: PageData[]): string => {
  const taken = new Set(pages.map((page) => page.name));
  let index = pages.length + 1;
  let name = `Page ${index}`;
  while (taken.has(name)) {
    index += 1;
    name = `Page ${index}`;
  }
  return name;
};

export const sanitizeElementsForStorage = (
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] => {
  return [...getNonDeletedElements(elements)];
};

export const sanitizeAppStateForStorage = (
  appState: AppState | Partial<AppState> | null | undefined,
): Partial<AppState> | null => {
  if (!appState) {
    return null;
  }
  return clearAppStateForLocalStorage(appState);
};

export const createPage = (
  name: string,
  elements: readonly ExcalidrawElement[] = [],
  appState: AppState | Partial<AppState> | null = null,
): PageData => {
  const now = Date.now();
  return {
    id: generatePageId(),
    name,
    elements: sanitizeElementsForStorage(elements),
    appState: sanitizeAppStateForStorage(appState),
    createdAt: now,
    updatedAt: now,
  };
};

const isValidPage = (value: unknown): value is PageData => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const page = value as Record<string, unknown>;
  return (
    typeof page.id === "string" &&
    typeof page.name === "string" &&
    Array.isArray(page.elements) &&
    typeof page.createdAt === "number" &&
    typeof page.updatedAt === "number"
  );
};

export const loadPagesState = (): PagesState | null => {
  try {
    const raw = localStorage.getItem(PAGES_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PagesState>;
    if (!parsed || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
      return null;
    }
    const pages = parsed.pages.filter(isValidPage);
    if (pages.length === 0) {
      return null;
    }
    const activePageId =
      typeof parsed.activePageId === "string" &&
      pages.some((page) => page.id === parsed.activePageId)
        ? parsed.activePageId
        : pages[0].id;
    return { pages, activePageId };
  } catch (error) {
    console.error("Failed to load pages from localStorage", error);
    return null;
  }
};

/**
 * Persists pages. Returns `false` when the write failed (e.g. quota
 * exceeded) so callers can surface it, `true` otherwise.
 */
export const persistPagesState = (state: PagesState): boolean => {
  try {
    localStorage.setItem(PAGES_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("Failed to persist pages to localStorage", error);
    return false;
  }
};

export const isQuotaExceededError = (error: unknown): boolean => {
  return error instanceof DOMException && error.name === "QuotaExceededError";
};

/**
 * Loads persisted pages, or migrates the legacy single-scene localStorage
 * (`excalidraw` / `excalidraw-state` keys) into a single "Page 1".
 * Idempotent — safe to call from multiple places on boot.
 */
export const ensurePagesState = (legacyScene: {
  elements: ExcalidrawElement[];
  appState: Partial<AppState> | null;
}): PagesState => {
  const existing = loadPagesState();
  if (existing) {
    return existing;
  }
  const now = Date.now();
  const initialPage: PageData = {
    id: generatePageId(),
    name: "Page 1",
    elements: sanitizeElementsForStorage(legacyScene.elements || []),
    appState: sanitizeAppStateForStorage(legacyScene.appState),
    createdAt: now,
    updatedAt: now,
  };
  const state: PagesState = {
    pages: [initialPage],
    activePageId: initialPage.id,
  };
  persistPagesState(state);
  return state;
};

export const getActivePage = (state: PagesState): PageData => {
  return (
    state.pages.find((page) => page.id === state.activePageId) || state.pages[0]
  );
};

export const getPageElementCount = (page: PageData): number => {
  return page.elements.filter((element) => !element.isDeleted).length;
};

/** All image fileIds referenced by any page (to protect them from cleanup). */
export const getAllPagesFileIds = (pages: PageData[]): FileId[] => {
  const ids = new Set<FileId>();
  for (const page of pages) {
    for (const element of page.elements) {
      if (
        element.type === "image" &&
        "fileId" in element &&
        (element as { fileId?: FileId }).fileId
      ) {
        ids.add((element as { fileId: FileId }).fileId);
      }
    }
  }
  return Array.from(ids);
};

/** Returns a new state with the page's scene replaced (autosave path). */
export const withPageScene = (
  state: PagesState,
  pageId: string,
  elements: readonly ExcalidrawElement[],
  appState: AppState | Partial<AppState>,
): PagesState => {
  return {
    ...state,
    pages: state.pages.map((page) =>
      page.id === pageId
        ? {
            ...page,
            elements: sanitizeElementsForStorage(elements),
            appState: sanitizeAppStateForStorage(appState),
            updatedAt: Date.now(),
          }
        : page,
    ),
  };
};
