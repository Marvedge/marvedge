import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVideoDimensions } from "./dimensions";

describe("getVideoDimensions", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { window: unknown }).window = {};
    (globalThis as unknown as { document: unknown }).document = {
      querySelectorAll: vi.fn().mockReturnValue([]),
      createElement: vi.fn(),
    };
  });

  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
    (globalThis as unknown as { document: unknown }).document = originalDocument;
  });

  it("returns undefined when window is undefined (SSR environment)", async () => {
    (globalThis as unknown as { window: unknown }).window = undefined;
    const dims = await getVideoDimensions("https://example.com/video.mp4");
    expect(dims).toBeUndefined();
  });

  it("extracts dimensions from an active DOM video element", async () => {
    const mockVideo = {
      videoWidth: 1920,
      videoHeight: 1080,
      src: "blob:http://localhost:3000/video-1",
      currentSrc: "blob:http://localhost:3000/video-1",
    };

    vi.spyOn(document, "querySelectorAll").mockReturnValue([mockVideo] as never);

    const dims = await getVideoDimensions("blob:http://localhost:3000/video-1");
    expect(dims).toEqual({ width: 1920, height: 1080 });
  });

  it("rounds floating point dimensions to positive integers", async () => {
    const mockVideo = {
      videoWidth: 1919.8,
      videoHeight: 1079.9,
      src: "https://example.com/video.mp4",
      currentSrc: "https://example.com/video.mp4",
    };

    vi.spyOn(document, "querySelectorAll").mockReturnValue([mockVideo] as never);

    const dims = await getVideoDimensions("https://example.com/video.mp4");
    expect(dims).toEqual({ width: 1920, height: 1080 });
  });

  it("probes offscreen video element if DOM element is not ready", async () => {
    vi.spyOn(document, "querySelectorAll").mockReturnValue([] as never);

    const listeners: Record<string, EventListener> = {};
    const mockProbe = {
      videoWidth: 1280,
      videoHeight: 720,
      addEventListener: vi.fn((event: string, cb: EventListener) => {
        listeners[event] = cb;
      }),
      removeEventListener: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(() => {
        setTimeout(() => {
          if (listeners["loadedmetadata"]) {
            listeners["loadedmetadata"](new Event("loadedmetadata"));
          }
        }, 5);
      }),
    };

    vi.spyOn(document, "createElement").mockReturnValue(mockProbe as never);

    const dims = await getVideoDimensions("https://example.com/video-2.mp4");
    expect(dims).toEqual({ width: 1280, height: 720 });
  });

  it("returns undefined if probe video fires error event", async () => {
    vi.spyOn(document, "querySelectorAll").mockReturnValue([] as never);

    const listeners: Record<string, EventListener> = {};
    const mockProbe = {
      videoWidth: 0,
      videoHeight: 0,
      addEventListener: vi.fn((event: string, cb: EventListener) => {
        listeners[event] = cb;
      }),
      removeEventListener: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(() => {
        setTimeout(() => {
          if (listeners["error"]) {
            listeners["error"](new Event("error"));
          }
        }, 5);
      }),
    };

    vi.spyOn(document, "createElement").mockReturnValue(mockProbe as never);

    const dims = await getVideoDimensions("https://example.com/broken.mp4");
    expect(dims).toBeUndefined();
  });

  it("returns undefined if dimensions are non-positive or non-finite", async () => {
    const mockVideo = {
      videoWidth: 0,
      videoHeight: 0,
      src: "https://example.com/zero.mp4",
      currentSrc: "https://example.com/zero.mp4",
    };

    vi.spyOn(document, "querySelectorAll").mockReturnValue([mockVideo] as never);

    const listeners: Record<string, EventListener> = {};
    const mockProbe = {
      videoWidth: NaN,
      videoHeight: -100,
      addEventListener: vi.fn((event: string, cb: EventListener) => {
        listeners[event] = cb;
      }),
      removeEventListener: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(() => {
        setTimeout(() => {
          if (listeners["loadedmetadata"]) {
            listeners["loadedmetadata"](new Event("loadedmetadata"));
          }
        }, 5);
      }),
    };

    vi.spyOn(document, "createElement").mockReturnValue(mockProbe as never);

    const dims = await getVideoDimensions("https://example.com/zero.mp4");
    expect(dims).toBeUndefined();
  });

  it("returns undefined when no url is provided and no DOM video is present", async () => {
    vi.spyOn(document, "querySelectorAll").mockReturnValue([] as never);

    const dims = await getVideoDimensions(null);
    expect(dims).toBeUndefined();
  });
});
