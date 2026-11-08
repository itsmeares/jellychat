// @vitest-environment jsdom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Dock } from "../ui/Dock";

vi.mock("../ui/Panel", () => ({ Panel: () => null }));
vi.mock("../ui/context", () => ({ useServices: () => ({ prefs: {} }) }));

it.each([false, true])("updates dock spacing after rotation (initial portrait: %s) and unsubscribes", (initialPortrait) => {
  const media = new EventTarget();
  const query = Object.assign(media, { matches: initialPortrait });
  const remove = vi.spyOn(query, "removeEventListener");
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  const container = document.createElement("div");
  const root = createRoot(container);
  const html = document.documentElement;
  const check = (portrait: boolean) => {
    expect(html.dataset.jcDock).toBe(portrait ? undefined : "right");
    expect(html.dataset.jcGlass).toBe(portrait ? undefined : "1");
    expect(html.style.getPropertyValue("--jc-dock")).toBe(portrait ? "" : "320px");
  };
  try {
    flushSync(() => root.render(createElement(Dock, { open: true, side: "right", width: 320, glass: true, onClose: () => {} })));
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 640px) and (orientation: portrait)");
    check(initialPortrait);
    for (const portrait of [!initialPortrait, initialPortrait]) {
      flushSync(() => {
        query.matches = portrait;
        query.dispatchEvent(new Event("change"));
      });
      check(portrait);
    }
  } finally {
    flushSync(() => root.unmount());
    vi.unstubAllGlobals();
  }
  expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  expect(html.dataset.jcDock).toBeUndefined();
  expect(html.dataset.jcGlass).toBeUndefined();
  expect(html.style.getPropertyValue("--jc-dock")).toBe("");
});
