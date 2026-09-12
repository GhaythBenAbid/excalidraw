/**
 * Lets the sidebar tab flush the debounced canvas autosave (owned by
 * `App.tsx`) before switching/adding/deleting pages, so no strokes are lost.
 */

let flushFn: (() => void) | null = null;

export const registerPagesFlush = (fn: (() => void) | null) => {
  flushFn = fn;
};

export const flushPagesSave = () => {
  flushFn?.();
};
