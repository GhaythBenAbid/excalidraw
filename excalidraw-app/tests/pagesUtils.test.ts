import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  PAGES_STORAGE_KEY,
  createPage,
  defaultPageName,
  ensurePagesState,
  getActivePage,
  getAllPagesFileIds,
  getPageElementCount,
  loadPagesState,
  persistPagesState,
  withPageScene,
} from "../pages/pagesUtils";

import type { PagesState } from "../pages/pagesUtils";

const rectangle = (id: string, isDeleted = false): ExcalidrawElement =>
  ({
    id,
    type: "rectangle",
    isDeleted,
  } as ExcalidrawElement);

const image = (id: string, fileId: string): ExcalidrawElement =>
  ({
    id,
    type: "image",
    fileId,
    isDeleted: false,
  } as ExcalidrawElement);

beforeEach(() => {
  localStorage.removeItem(PAGES_STORAGE_KEY);
});

describe("pagesUtils", () => {
  it("creates a page with a unique id and timestamps", () => {
    const a = createPage("Page 1");
    const b = createPage("Page 2");
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe("Page 1");
    expect(a.elements).toEqual([]);
    expect(a.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it("drops deleted elements when creating a page", () => {
    const page = createPage("P", [rectangle("a"), rectangle("b", true)]);
    expect(page.elements.map((el) => el.id)).toEqual(["a"]);
  });

  it("picks non-colliding default page names", () => {
    const pages = [createPage("Page 1"), createPage("Page 2")];
    expect(defaultPageName(pages)).toBe("Page 3");
    expect(defaultPageName([])).toBe("Page 1");
  });

  it("round-trips through localStorage", () => {
    const state: PagesState = {
      pages: [createPage("Page 1", [rectangle("a")])],
      activePageId: "",
    };
    state.activePageId = state.pages[0].id;
    expect(persistPagesState(state)).toBe(true);
    expect(loadPagesState()).toEqual(state);
  });

  it("returns null for missing or corrupt data", () => {
    expect(loadPagesState()).toBe(null);
    localStorage.setItem(PAGES_STORAGE_KEY, "not-json");
    expect(loadPagesState()).toBe(null);
    localStorage.setItem(PAGES_STORAGE_KEY, JSON.stringify({ pages: [] }));
    expect(loadPagesState()).toBe(null);
  });

  it("falls back to the first page for unknown activePageId", () => {
    const pages = [createPage("A"), createPage("B")];
    const state: PagesState = { pages, activePageId: "missing" };
    persistPagesState(state);
    const loaded = loadPagesState();
    expect(loaded?.activePageId).toBe(pages[0].id);
    expect(getActivePage(loaded!)).toEqual(pages[0]);
  });

  it("migrates legacy scene into Page 1 once", () => {
    const legacy = { elements: [rectangle("a")], appState: null };
    const first = ensurePagesState(legacy);
    expect(first.pages).toHaveLength(1);
    expect(first.pages[0].name).toBe("Page 1");
    expect(first.pages[0].elements.map((el) => el.id)).toEqual(["a"]);

    // second call loads the persisted state instead of re-migrating
    const second = ensurePagesState({ elements: [], appState: null });
    expect(second).toEqual(first);
  });

  it("updates only the target page scene", () => {
    const p1 = createPage("P1", [rectangle("a")]);
    const p2 = createPage("P2", [rectangle("b")]);
    const state: PagesState = { pages: [p1, p2], activePageId: p1.id };
    const next = withPageScene(state, p2.id, [rectangle("c")], {
      viewBackgroundColor: "#fff",
    } as any);
    expect(next.pages[0].elements.map((el) => el.id)).toEqual(["a"]);
    expect(next.pages[1].elements.map((el) => el.id)).toEqual(["c"]);
    expect(next.pages[1].appState).toMatchObject({
      viewBackgroundColor: "#fff",
    });
  });

  it("counts non-deleted elements and collects image file ids", () => {
    const page = createPage("P", [
      rectangle("a"),
      rectangle("b", true),
      image("c", "file-1"),
    ]);
    expect(getPageElementCount(page)).toBe(2);
    const other = createPage("Q", [image("d", "file-2")]);
    expect(getAllPagesFileIds([page, other]).sort()).toEqual([
      "file-1",
      "file-2",
    ]);
  });
});
