import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeEditVideoNavigation } from "./useRecorderActions";
import { useBlobStore } from "@/app/store/blobStore";
import * as editorVideoUploadModule from "@/app/(signed)/editor/hooks/useEditorVideoUpload";

const mockRouter = {
  push: vi.fn(),
};

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("TASK-00044: useRecorderActions (executeEditVideoNavigation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBlobStore.getState().reset();
    editorVideoUploadModule._resetActiveVideoUploadPromiseForTest();
  });

  it("navigates to /editor when no canonicalVideoUrl exists and no upload is active", async () => {
    await executeEditVideoNavigation(mockRouter);
    expect(mockRouter.push).toHaveBeenCalledWith("/editor");
  });

  it("navigates to /editor?video=<encoded> when canonicalVideoUrl is already present", async () => {
    const dynamicCloudinaryUrl =
      "https://res.cloudinary.com/test-cloud/video/upload/v123/my-recording.mp4";
    useBlobStore.getState().setCanonicalVideoUrl(dynamicCloudinaryUrl);

    await executeEditVideoNavigation(mockRouter);

    expect(mockRouter.push).toHaveBeenCalledWith(
      `/editor?video=${encodeURIComponent(dynamicCloudinaryUrl)}`
    );
  });

  it("awaits active in-flight upload before navigating", async () => {
    const dynamicCloudinaryUrl =
      "https://res.cloudinary.com/test-cloud/video/upload/v456/in-flight.mp4";

    let resolveActiveUpload!: (url: string) => void;
    const activePromise = new Promise<string>((resolve) => {
      resolveActiveUpload = resolve;
    });

    vi.spyOn(editorVideoUploadModule, "getActiveVideoUploadPromise").mockReturnValue(activePromise);

    let finished = false;
    const navPromise = executeEditVideoNavigation(mockRouter).then(() => {
      finished = true;
    });

    // Navigation should not have happened yet while promise is pending
    expect(finished).toBe(false);
    expect(mockRouter.push).not.toHaveBeenCalled();

    // Resolve the upload
    useBlobStore.getState().setCanonicalVideoUrl(dynamicCloudinaryUrl);
    resolveActiveUpload(dynamicCloudinaryUrl);
    await navPromise;

    expect(finished).toBe(true);
    expect(mockRouter.push).toHaveBeenCalledWith(
      `/editor?video=${encodeURIComponent(dynamicCloudinaryUrl)}`
    );
  });
});
