import { describe, it, expect } from "vitest";
import { validatePost, validateUpload, samplePosts, type UploadPost } from "@/lib/upload-model";
const post: UploadPost = {
  id: "test",
  title: "Launch",
  caption: "Our launch",
  channels: ["LinkedIn"],
  status: "Planned",
  scheduledAt: "2026-10-16T12:00",
};
describe("Upload planning", () => {
  it("marks all initial content as illustrative", () => {
    expect(samplePosts.every((p) => p.sample)).toBe(true);
  });
  it("requires caption and channel", () => {
    expect(validatePost({ ...post, caption: "" })).toBe("Add a caption.");
    expect(validatePost({ ...post, channels: [] })).toBe("Choose at least one channel.");
  });
  it("requires future valid planned times but allows unscheduled drafts", () => {
    const now = new Date("2026-10-15T12:00:00");
    expect(validatePost({ ...post, scheduledAt: "2026-10-16T12:00" }, now)).toBeNull();
    expect(validatePost({ ...post, scheduledAt: "bad" }, now)).toBeTruthy();
    expect(validatePost({ ...post, status: "Draft", scheduledAt: "" }, now)).toBeNull();
  });
  it("restricts uploads to bounded media files", () => {
    expect(validateUpload({ type: "image/png", size: 100 })).toBeNull();
    expect(validateUpload({ type: "video/webm", size: 100 })).toBeNull();
    expect(validateUpload({ type: "text/plain", size: 100 })).toBeTruthy();
    expect(validateUpload({ type: "video/mp4", size: 251 * 1024 * 1024 })).toBeTruthy();
  });
});
