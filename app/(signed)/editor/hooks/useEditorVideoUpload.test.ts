import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetActiveVideoUploadPromiseForTest,
  uploadEditorVideoFile,
} from "./useEditorVideoUpload";
import * as cloudinaryUploadModule from "@/app/lib/cloudinaryUpload";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn().mockReturnValue("toast-id-123"),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("uploadEditorVideoFile (Explicit User Upload Flow)", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  let currentVideoUrl: string | null = null;
  let currentBlob: Blob | null = null;
  let currentTitle = "";
  let isUploading = false;

  const callbacks = {
    setVideoUrl: vi.fn((url: string | null) => {
      currentVideoUrl = url;
    }),
    setBlob: vi.fn((b: Blob | null) => {
      currentBlob = b;
    }),
    setTitle: vi.fn((t: string) => {
      currentTitle = t;
    }),
    setIsUploading: vi.fn((u: boolean) => {
      isUploading = u;
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveVideoUploadPromiseForTest();
    currentVideoUrl = null;
    currentBlob = null;
    currentTitle = "";
    isUploading = false;

    let objectIdCounter = 0;
    URL.createObjectURL = vi.fn(() => `blob:http://localhost:3000/temp-mock-${++objectIdCounter}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it("File → Temporary blob URL → Cloudinary upload → dynamic secure_url → canonical videoUrl → revoke temp blob", async () => {
    const dynamicSecureUrl = `https://res.cloudinary.com/test-cloud/video/upload/v12345/clip-${Date.now()}.mp4`;

    vi.spyOn(cloudinaryUploadModule, "isEditorCloudinaryUploadEnabled").mockReturnValue(true);
    vi.spyOn(cloudinaryUploadModule, "isCloudinaryUploadConfigured").mockReturnValue(true);
    const uploadSpy = vi
      .spyOn(cloudinaryUploadModule, "uploadVideoToCloudinary")
      .mockResolvedValue(dynamicSecureUrl);

    const file = new File(["dummy video"], "my-interview.mp4", { type: "video/mp4" });

    const returnedUrl = await uploadEditorVideoFile(file, callbacks);

    // 1. Cloudinary upload called with correct file
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploadSpy).toHaveBeenCalledWith({
      file,
      folder: "marvedge/editor_uploads",
      filename: "my-interview.mp4",
    });

    // 2. Dynamic secure_url is returned
    expect(returnedUrl).toBe(dynamicSecureUrl);

    // 3. Editor videoUrl promoted to canonical Cloudinary HTTPS URL
    expect(callbacks.setVideoUrl).toHaveBeenCalledWith(dynamicSecureUrl);
    expect(currentVideoUrl).toBe(dynamicSecureUrl);

    // 4. Temporary blob URL created and then revoked
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);

    // 5. Blob callbacks called with file and title
    expect(callbacks.setBlob).toHaveBeenCalledWith(file);
    expect(callbacks.setTitle).toHaveBeenCalledWith("my-interview");

    // 6. Toast success shown
    expect(toast.success).toHaveBeenCalledWith(
      "Video uploaded to Cloudinary successfully!",
      expect.objectContaining({ id: "toast-id-123" })
    );
  });

  it("surfaces upload failure clearly and does not leave broken video source", async () => {
    vi.spyOn(cloudinaryUploadModule, "isEditorCloudinaryUploadEnabled").mockReturnValue(true);
    vi.spyOn(cloudinaryUploadModule, "isCloudinaryUploadConfigured").mockReturnValue(true);
    vi.spyOn(cloudinaryUploadModule, "uploadVideoToCloudinary").mockRejectedValue(
      new Error("Network timeout")
    );

    const file = new File(["dummy video"], "failing.mp4", { type: "video/mp4" });

    const returnedUrl = await uploadEditorVideoFile(file, callbacks);

    // Returns null
    expect(returnedUrl).toBeNull();

    // Editor videoUrl reset to null (not leaving a stale or broken blob URL)
    expect(callbacks.setVideoUrl).toHaveBeenLastCalledWith(null);
    expect(currentVideoUrl).toBeNull();

    // Temporary blob URL was revoked
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);

    // Error toast surfaced clearly
    expect(toast.error).toHaveBeenCalledWith(
      "Upload failed: Network timeout",
      expect.objectContaining({ id: "toast-id-123" })
    );
  });

  it("rejects invalid video files before upload begins", async () => {
    vi.spyOn(cloudinaryUploadModule, "isEditorCloudinaryUploadEnabled").mockReturnValue(true);
    vi.spyOn(cloudinaryUploadModule, "isCloudinaryUploadConfigured").mockReturnValue(true);
    const uploadSpy = vi.spyOn(cloudinaryUploadModule, "uploadVideoToCloudinary");

    const file = new File(["dummy"], "audio-only.flv", { type: "video/x-flv" });

    const returnedUrl = await uploadEditorVideoFile(file, callbacks);

    expect(returnedUrl).toBeNull();
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("not supported"));
  });

  it("falls back to local blob URL when feature flag is disabled (legacy flow)", async () => {
    vi.spyOn(cloudinaryUploadModule, "isEditorCloudinaryUploadEnabled").mockReturnValue(false);
    const uploadSpy = vi.spyOn(cloudinaryUploadModule, "uploadVideoToCloudinary");

    const file = new File(["dummy"], "local-only.mp4", { type: "video/mp4" });

    const returnedUrl = await uploadEditorVideoFile(file, callbacks);

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(returnedUrl).toMatch(/^blob:/);
    expect(currentVideoUrl).toBe(returnedUrl);
    expect(toast.success).toHaveBeenCalledWith("Video loaded locally");
  });

  it("handles recorder callbacks, sets canonicalVideoUrl in useBlobStore, and tracks activeVideoUploadPromise", async () => {
    const dynamicSecureUrl = "https://res.cloudinary.com/test-cloud/video/upload/v999/recorder-clip.mp4";

    vi.spyOn(cloudinaryUploadModule, "isEditorCloudinaryUploadEnabled").mockReturnValue(true);
    vi.spyOn(cloudinaryUploadModule, "isCloudinaryUploadConfigured").mockReturnValue(true);

    let resolveUpload!: (url: string) => void;
    const uploadPromise = new Promise<string>((resolve) => {
      resolveUpload = resolve;
    });

    const uploadSpy = vi
      .spyOn(cloudinaryUploadModule, "uploadVideoToCloudinary")
      .mockReturnValue(uploadPromise);

    let recordedPreviewUrl: string | null = null;
    let recordedFileType: string | null = null;

    const recorderCallbacks = {
      setUploadedFileUrl: vi.fn((url: string | null) => {
        recordedPreviewUrl = url;
      }),
      setUploadedFileType: vi.fn((type: string | null) => {
        recordedFileType = type;
      }),
      setBlob: callbacks.setBlob,
      setTitle: callbacks.setTitle,
    };

    const file = new File(["dummy video data"], "interview.mp4", { type: "video/mp4" });

    // Start upload
    const pendingPromise = uploadEditorVideoFile(file, recorderCallbacks);

    // 1. Immediate preview is set
    expect(recorderCallbacks.setUploadedFileUrl).toHaveBeenCalledTimes(1);
    expect(recordedPreviewUrl).toMatch(/^blob:/);
    expect(recorderCallbacks.setUploadedFileType).toHaveBeenCalledWith("video/mp4");

    // 2. getActiveVideoUploadPromise returns the in-flight upload promise
    const active1 = (await import("./useEditorVideoUpload")).getActiveVideoUploadPromise();
    const active2 = (await import("./useEditorVideoUpload")).getActiveVideoUploadPromise();
    expect(active1).not.toBeNull();
    expect(active1).toBe(active2); // never initiates a second upload

    // Only one upload was initiated
    expect(uploadSpy).toHaveBeenCalledTimes(1);

    // Resolve the upload
    resolveUpload(dynamicSecureUrl);
    const finalUrl = await pendingPromise;

    expect(finalUrl).toBe(dynamicSecureUrl);
    expect(recorderCallbacks.setUploadedFileUrl).toHaveBeenLastCalledWith(dynamicSecureUrl);
    expect(recordedPreviewUrl).toBe(dynamicSecureUrl);

    // Active upload promise is cleared once completed
    expect((await import("./useEditorVideoUpload")).getActiveVideoUploadPromise()).toBeNull();
  });

  it("joins the in-flight upload instead of starting a second one on concurrent calls", async () => {
    const dynamicSecureUrl = "https://res.cloudinary.com/test-cloud/video/upload/v777/double-click.mp4";

    vi.spyOn(cloudinaryUploadModule, "isEditorCloudinaryUploadEnabled").mockReturnValue(true);
    vi.spyOn(cloudinaryUploadModule, "isCloudinaryUploadConfigured").mockReturnValue(true);

    let resolveUpload!: (url: string) => void;
    const gate = new Promise<string>((resolve) => {
      resolveUpload = resolve;
    });
    const uploadSpy = vi
      .spyOn(cloudinaryUploadModule, "uploadVideoToCloudinary")
      .mockReturnValue(gate);

    const file = new File(["dummy video"], "double-click.mp4", { type: "video/mp4" });

    // Two rapid calls while the first upload is still in flight
    const p1 = uploadEditorVideoFile(file, callbacks);
    const p2 = uploadEditorVideoFile(file, callbacks);

    // Only one network upload and one preview blob for both callers
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    // Both callers share the in-flight singleton
    const { getActiveVideoUploadPromise } = await import("./useEditorVideoUpload");
    expect(getActiveVideoUploadPromise()).not.toBeNull();

    resolveUpload(dynamicSecureUrl);
    await expect(p1).resolves.toBe(dynamicSecureUrl);
    await expect(p2).resolves.toBe(dynamicSecureUrl);

    // Singleton cleared after completion
    expect(getActiveVideoUploadPromise()).toBeNull();
  });

  it("starts a fresh upload once the previous one has completed", async () => {
    vi.spyOn(cloudinaryUploadModule, "isEditorCloudinaryUploadEnabled").mockReturnValue(true);
    vi.spyOn(cloudinaryUploadModule, "isCloudinaryUploadConfigured").mockReturnValue(true);
    const uploadSpy = vi
      .spyOn(cloudinaryUploadModule, "uploadVideoToCloudinary")
      .mockResolvedValueOnce("https://example.com/first.mp4")
      .mockResolvedValueOnce("https://example.com/second.mp4");

    const first = new File(["one"], "first.mp4", { type: "video/mp4" });
    const second = new File(["two"], "second.mp4", { type: "video/mp4" });

    await expect(uploadEditorVideoFile(first, callbacks)).resolves.toBe(
      "https://example.com/first.mp4"
    );
    await expect(uploadEditorVideoFile(second, callbacks)).resolves.toBe(
      "https://example.com/second.mp4"
    );
    expect(uploadSpy).toHaveBeenCalledTimes(2);
  });
});
