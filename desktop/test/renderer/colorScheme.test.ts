import { describe, expect, it } from "vitest";

import { followColorScheme } from "../../src/ui/shell/theme/colorScheme";

function fakeMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  return {
    matchMedia: (q: string) => {
      expect(q).toBe("(prefers-color-scheme: light)");
      return query as unknown as MediaQueryList;
    },
    set(matches: boolean) {
      query.matches = matches;
      listeners.forEach((listener) => listener());
    },
    listenerCount: () => listeners.size,
  };
}

describe("followColorScheme", () => {
  it("sets data-theme from prefers-color-scheme and follows changes", () => {
    const root = document.createElement("html");
    const media = fakeMedia(false);

    const stop = followColorScheme(root, media.matchMedia);
    expect(root.dataset.theme).toBe("dark");

    media.set(true);
    expect(root.dataset.theme).toBe("light");

    stop();
    expect(media.listenerCount()).toBe(0);
    media.set(false);
    expect(root.dataset.theme).toBe("light");
  });

  it("falls back to dark when matchMedia is unavailable", () => {
    const root = document.createElement("html");
    followColorScheme(root, undefined);
    expect(root.dataset.theme).toBe("dark");
  });
});
