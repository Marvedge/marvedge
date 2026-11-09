import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  destroy: vi.fn(),
}));

vi.mock("@/app/lib/cloudinary", () => ({
  default: {
    uploader: {
      destroy: mocks.destroy,
    },
  },
}));

import { deleteCloudinaryVideoByUrl } from "./cloudinary-utils";

const CLOUD_NAME = "marvedge-prod";

describe("deleteCloudinaryVideoByUrl ownership checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.destroy.mockResolvedValue({ result: "ok" });
    process.env.CLOUDINARY_CLOUD_NAME = CLOUD_NAME;
  });

  afterEach(() => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
  });

  it("destroys an asset from our own cloud", async () => {
    await deleteCloudinaryVideoByUrl(
      `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/v1712345678/exports/recording.mp4`
    );

    expect(mocks.destroy).toHaveBeenCalledWith("exports/recording", {
      resource_type: "video",
      invalidate: true,
    });
  });

  it("does not destroy when the cloud name belongs to another tenant", async () => {
    await deleteCloudinaryVideoByUrl(
      "https://res.cloudinary.com/someone-else/video/upload/v1/exports/recording.mp4"
    );

    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it("does not destroy when the host is not exactly res.cloudinary.com", async () => {
    for (const url of [
      `https://res.cloudinary.com.evil.example/${CLOUD_NAME}/video/upload/v1/exports/recording.mp4`,
      `https://evil.example/${CLOUD_NAME}/video/upload/v1/exports/recording.mp4`,
      `https://res.cloudinary.com:8443/${CLOUD_NAME}/video/upload/v1/exports/recording.mp4`,
    ]) {
      await deleteCloudinaryVideoByUrl(url);
    }

    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it("does not destroy when the URL carries a query string or hash", async () => {
    await deleteCloudinaryVideoByUrl(
      `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/v1/exports/recording.mp4?x=1`
    );
    await deleteCloudinaryVideoByUrl(
      `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/v1/exports/recording.mp4#x`
    );

    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it("does not destroy when percent-encoding could smuggle path separators", async () => {
    for (const path of [
      `/${CLOUD_NAME}/video/upload/v1/exports%2Fother-tenant%2Frecording.mp4`,
      `/${CLOUD_NAME}/video/upload/v1/exports/%2e%2e/other-tenant/recording.mp4`,
      `/${CLOUD_NAME}/video/upload/v1/exports%5Cother-tenant%5Crecording.mp4`,
    ]) {
      await deleteCloudinaryVideoByUrl(`https://res.cloudinary.com${path}`);
    }

    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it("does not destroy a non-Cloudinary or malformed URL", async () => {
    await deleteCloudinaryVideoByUrl("https://example.com/exports/recording.mp4");
    await deleteCloudinaryVideoByUrl("not a url");
    await deleteCloudinaryVideoByUrl(null);
    await deleteCloudinaryVideoByUrl(undefined);

    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it("fails closed when CLOUDINARY_CLOUD_NAME is not configured", async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;

    await deleteCloudinaryVideoByUrl(
      `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/v1/exports/recording.mp4`
    );

    expect(mocks.destroy).not.toHaveBeenCalled();
  });
});
