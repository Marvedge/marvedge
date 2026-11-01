import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
describe("Session trash", () => {
  it("restores project data and editor drafts", () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper: WorkspaceProvider });
    const draft = { ...result.current.getDraft("product-tour"), description: "Preserved edit" };
    act(() => result.current.setDraft("product-tour", draft));
    act(() => result.current.removeProject("product-tour"));
    expect(result.current.projects.some((p) => p.id === "product-tour")).toBe(false);
    expect(result.current.drafts["product-tour"]).toBeUndefined();
    act(() => result.current.restoreTrash("project", "product-tour"));
    expect(result.current.getDraft("product-tour").description).toBe("Preserved edit");
    expect(result.current.trash).toHaveLength(0);
  });
  it("restores planned posts as unscheduled drafts", () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper: WorkspaceProvider });
    act(() => result.current.trashPost("sample-tour"));
    act(() => result.current.restoreTrash("post", "sample-tour"));
    expect(result.current.uploadPosts.find((p) => p.id === "sample-tour")).toMatchObject({ status: "Draft", scheduledAt: "" });
  });
  it("protects attached media and supports empty trash", () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper: WorkspaceProvider });
    act(() => result.current.setUploadMedia([{ id: "file", name: "file.png", url: "https://example.test/file", kind: "image", size: 2048 }]));
    act(() => result.current.setUploadPosts((prev) => prev.map((p) => p.id === "sample-tour" ? { ...p, mediaId: "file" } : p)));
    act(() => result.current.trashMedia("file"));
    expect(result.current.uploadMedia).toHaveLength(1);
    act(() => result.current.trashPost("sample-tour"));
    act(() => result.current.trashMedia("file"));
    expect(result.current.trash).toHaveLength(2);
    act(() => result.current.deleteTrash());
    expect(result.current.trash).toHaveLength(0);
    expect(result.current.uploadMedia).toHaveLength(0);
  });
});