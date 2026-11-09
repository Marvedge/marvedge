import { describe, expect, it } from "vitest";
import {
  hasExplicitVideoParam,
  shouldInitializeFromBlob,
} from "./useEditorSyncEffects";

describe("TASK-00044: Editor Source Precedence (useEditorSyncEffects)", () => {
  const dynamicCloudinaryUrl = `https://res.cloudinary.com/test-cloud/video/upload/v${Date.now()}/clip.mp4`;

  describe("hasExplicitVideoParam", () => {
    it("returns true when params has an explicit video URL", () => {
      const params = new URLSearchParams(`video=${encodeURIComponent(dynamicCloudinaryUrl)}`);
      expect(hasExplicitVideoParam(params)).toBe(true);
    });

    it("returns true when locationSearch has an explicit video URL", () => {
      const search = `?video=${encodeURIComponent(dynamicCloudinaryUrl)}`;
      expect(hasExplicitVideoParam(null, search)).toBe(true);
    });

    it("returns false when neither params nor locationSearch has a video URL", () => {
      const params = new URLSearchParams("demoId=123&title=test");
      expect(hasExplicitVideoParam(params, "?demoId=123")).toBe(false);
      expect(hasExplicitVideoParam(null, "")).toBe(false);
      expect(hasExplicitVideoParam(null, undefined)).toBe(false);
    });
  });

  describe("shouldInitializeFromBlob (Precedence Invariant)", () => {
    it("EXPLICIT VIDEO URL WINS: rejects cached blob when explicit video URL is present in params", () => {
      const params = new URLSearchParams(`video=${encodeURIComponent(dynamicCloudinaryUrl)}`);
      const shouldInit = shouldInitializeFromBlob({
        currentVideoUrl: null,
        hasBlob: true, // cached blob exists in blobStore
        params,
      });

      // Explicit URL must win: do NOT initialize from blob
      expect(shouldInit).toBe(false);
    });

    it("EXPLICIT VIDEO URL WINS: rejects cached blob on initial tick when params is null but locationSearch has video", () => {
      const shouldInit = shouldInitializeFromBlob({
        currentVideoUrl: null,
        hasBlob: true,
        params: null,
        locationSearch: `?video=${encodeURIComponent(dynamicCloudinaryUrl)}`,
      });

      // Even before params state is populated, window query param prevents blob override
      expect(shouldInit).toBe(false);
    });

    it("UPLOADED CLOUDINARY URL WINS: rejects cached blob when currentVideoUrl is already a Cloudinary HTTPS URL", () => {
      const shouldInit = shouldInitializeFromBlob({
        currentVideoUrl: dynamicCloudinaryUrl,
        hasBlob: true,
        params: null,
        locationSearch: "",
      });

      // Uploaded HTTPS URL must win: cached blob cannot overwrite it
      expect(shouldInit).toBe(false);
    });

    it("CACHED BLOB WINS: accepts cached blob when NO explicit video URL is provided", () => {
      const params = new URLSearchParams("demoId=123");
      const shouldInit = shouldInitializeFromBlob({
        currentVideoUrl: null,
        hasBlob: true,
        params,
        locationSearch: "?demoId=123",
      });

      // Normal recording / upload flow: cached blob initializes videoUrl
      expect(shouldInit).toBe(true);
    });

    it("CACHED BLOB WINS: accepts cached blob when params and search are empty (fresh editor after recording)", () => {
      const shouldInit = shouldInitializeFromBlob({
        currentVideoUrl: null,
        hasBlob: true,
        params: null,
        locationSearch: "",
      });

      expect(shouldInit).toBe(true);
    });

    it("does not initialize when hasBlob is false", () => {
      const shouldInit = shouldInitializeFromBlob({
        currentVideoUrl: null,
        hasBlob: false,
        params: null,
        locationSearch: "",
      });

      expect(shouldInit).toBe(false);
    });

    it("does not initialize when videoUrl is already set to any non-null string", () => {
      const shouldInit = shouldInitializeFromBlob({
        currentVideoUrl: dynamicCloudinaryUrl,
        hasBlob: true,
        params: null,
        locationSearch: "",
      });

      expect(shouldInit).toBe(false);
    });
  });
});
