// @vitest-environment jsdom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HeaderButton, useHeaderSlot } from "../ui/Triggers";

function Header() {
  return createElement(HeaderButton, { ...useHeaderSlot(true), unread: 0, open: false, onClick: () => {} });
}

it("styles the header button like the SyncPlay button and shows a Jellyfin-style tooltip", async () => {
  document.body.innerHTML = '<div id="bar"><button aria-controls="app-sync-play-menu" class="MuiButtonBase-root MuiIconButton-root css-abc Mui-focusVisible"></button></div>';
  const root = createRoot(document.createElement("div"));
  try {
    flushSync(() => root.render(createElement(Header)));
    const button = await vi.waitFor(() => {
      const found = document.querySelector<HTMLButtonElement>("#bar .jc-hbtn");
      if (!found) throw new Error("header button not rendered");
      return found;
    });
    vi.useFakeTimers();
    expect(button.className).toBe("MuiButtonBase-root MuiIconButton-root css-abc jc-hbtn");
    expect(button.title).toBe("");
    expect(button.parentElement?.nextElementSibling?.getAttribute("aria-controls")).toBe("app-sync-play-menu");

    flushSync(() => button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    flushSync(() => vi.advanceTimersByTime(100));
    expect(document.querySelector(".jc-tip.MuiTooltip-tooltip")?.textContent).toBe("JellyChat (C)");

    flushSync(() => button.click());
    expect(document.querySelector(".jc-tip")).toBeNull();
  } finally {
    flushSync(() => root.unmount());
    vi.useRealTimers();
    document.body.innerHTML = "";
  }
});
