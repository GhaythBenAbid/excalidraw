import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { Button } from "@excalidraw/excalidraw/components/Button";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import {
  PlusIcon,
  TrashIcon,
  checkIcon,
  copyIcon,
} from "@excalidraw/excalidraw/components/icons";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { isInitializedImageElement } from "@excalidraw/element";
import clsx from "clsx";
import { useState } from "react";

import type { FileId } from "@excalidraw/element/types";

import { isCollaboratingAtom } from "../collab/Collab";
import { LocalData } from "../data/LocalData";
import { useAtom, useAtomValue, appJotaiStore } from "../app-jotai";

import { pagesStateAtom } from "./pagesAtoms";
import { flushPagesSave } from "./pagesAutosave";
import {
  createPage,
  defaultPageName,
  getActivePage,
  getPageElementCount,
  persistPagesState,
  type PageData,
  type PagesState,
} from "./pagesUtils";

import "./PagesTab.scss";

export const PagesTab = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const [pagesState, setPagesState] = useAtom(pagesStateAtom);
  const isCollaborating = useAtomValue(isCollaboratingAtom);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const activePage = getActivePage(pagesState);

  const loadPageIntoCanvas = async (page: PageData) => {
    if (!excalidrawAPI) {
      return;
    }
    const currentFiles = excalidrawAPI.getFiles();
    const fileIds = (page.elements || []).reduce((acc, element) => {
      if (isInitializedImageElement(element) && !currentFiles[element.fileId]) {
        return acc.concat(element.fileId);
      }
      return acc;
    }, [] as FileId[]);

    if (fileIds.length) {
      const { loadedFiles } = await LocalData.fileStorage.getFiles(fileIds);
      if (loadedFiles.length) {
        excalidrawAPI.addFiles(loadedFiles);
      }
    }

    excalidrawAPI.updateScene({
      elements: restoreElements(page.elements || [], null, {
        repairBindings: true,
      }),
      appState: restoreAppState(page.appState, excalidrawAPI.getAppState()),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const switchToPage = (pageId: string) => {
    if (isCollaborating || pageId === pagesState.activePageId) {
      return;
    }
    // flush any pending autosave into the previous active page first
    flushPagesSave();
    const current = appJotaiStore.get(pagesStateAtom);
    const target = current.pages.find((page) => page.id === pageId);
    if (!target) {
      return;
    }
    const next: PagesState = { ...current, activePageId: pageId };
    // keep local atom in sync (persistAndSet also persists)
    setPagesState(next);
    persistPagesState(next);
    void loadPageIntoCanvas(target);
  };

  const addPage = () => {
    if (isCollaborating || !excalidrawAPI) {
      return;
    }
    flushPagesSave();
    const current = appJotaiStore.get(pagesStateAtom);
    const page = createPage(defaultPageName(current.pages));
    const next: PagesState = {
      pages: [...current.pages, page],
      activePageId: page.id,
    };
    setPagesState(next);
    persistPagesState(next);
    excalidrawAPI.updateScene({
      elements: [],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const deletePage = (pageId: string) => {
    if (isCollaborating) {
      return;
    }
    const current = appJotaiStore.get(pagesStateAtom);
    const target = current.pages.find((page) => page.id === pageId);
    if (!target) {
      return;
    }
    if (
      getPageElementCount(target) > 0 &&
      !window.confirm(`Delete "${target.name}"? This cannot be undone.`)
    ) {
      return;
    }
    flushPagesSave();
    const fresh = appJotaiStore.get(pagesStateAtom);
    const index = fresh.pages.findIndex((page) => page.id === pageId);
    let pages = fresh.pages.filter((page) => page.id !== pageId);
    if (pages.length === 0) {
      const replacement = createPage("Page 1");
      pages = [replacement];
    }
    let activePageId = fresh.activePageId;
    let pageToLoad: PageData | null = null;
    if (activePageId === pageId) {
      const neighbor = pages[Math.min(Math.max(index, 0), pages.length - 1)];
      activePageId = neighbor.id;
      pageToLoad = neighbor;
    }
    const next: PagesState = { pages, activePageId };
    setPagesState(next);
    persistPagesState(next);
    if (pageToLoad) {
      void loadPageIntoCanvas(pageToLoad);
    }
  };

  const startRenaming = (page: PageData) => {
    setEditingId(page.id);
    setDraftName(page.name);
  };

  const commitRename = (pageId: string) => {
    const name = draftName.trim();
    setEditingId(null);
    if (!name) {
      return;
    }
    const current = appJotaiStore.get(pagesStateAtom);
    const next: PagesState = {
      ...current,
      pages: current.pages.map((page) =>
        page.id === pageId ? { ...page, name, updatedAt: Date.now() } : page,
      ),
    };
    setPagesState(next);
    persistPagesState(next);
  };

  return (
    <div className="pages-tab">
      {isCollaborating && (
        <div className="pages-tab__notice">
          Pages are disabled while collaborating.
        </div>
      )}
      <div className="pages-tab__list">
        {pagesState.pages.map((page, index) => {
          const isActive = page.id === activePage.id;
          const elementCount = getPageElementCount(page);
          return (
            <div
              key={page.id}
              className={clsx("pages-tab__item", {
                "pages-tab__item--active": isActive,
              })}
              onClick={() => switchToPage(page.id)}
              title={isActive ? page.name : `Switch to ${page.name}`}
            >
              <span className="pages-tab__item-icon">{copyIcon}</span>
              {editingId === page.id ? (
                <span
                  className="pages-tab__item-edit"
                  onClick={(event) => event.stopPropagation()}
                >
                  <TextField
                    value={draftName}
                    selectOnRender
                    onChange={setDraftName}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        commitRename(page.id);
                      } else if (event.key === "Escape") {
                        setEditingId(null);
                      }
                      event.stopPropagation();
                    }}
                  />
                  <button
                    className="pages-tab__icon-button"
                    title="Save name"
                    onClick={() => commitRename(page.id)}
                  >
                    {checkIcon}
                  </button>
                </span>
              ) : (
                <span
                  className="pages-tab__item-name"
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    if (!isCollaborating) {
                      startRenaming(page);
                    }
                  }}
                  title="Double-click to rename"
                >
                  {index + 1}. {page.name}
                </span>
              )}
              <span className="pages-tab__item-count">{elementCount}</span>
              <button
                className="pages-tab__icon-button pages-tab__icon-button--danger"
                title={`Delete ${page.name}`}
                disabled={isCollaborating}
                onClick={(event) => {
                  event.stopPropagation();
                  deletePage(page.id);
                }}
              >
                {TrashIcon}
              </button>
            </div>
          );
        })}
      </div>
      <div className="pages-tab__footer">
        <Button
          onSelect={addPage}
          className="pages-tab__add"
          disabled={isCollaborating}
          title={
            isCollaborating
              ? "Pages are disabled while collaborating"
              : "Add a new page"
          }
        >
          <span className="pages-tab__add-icon">{PlusIcon}</span>
          New page
        </Button>
        <div className="pages-tab__hint">
          Double-click a page to rename. Everything autosaves locally.
        </div>
      </div>
    </div>
  );
};
