import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { isSavable, toSaved, draftToSaved } from "@/lib/project-store";

describe("project saving rules", () => {
  it("keeps sample projects local and saves real ones", () => {
    expect(isSavable("product-tour")).toBe(false);
    expect(isSavable("3f2b6c1e-8a4d-4c2e-9b1a-1234567890ab")).toBe(true);
  });
  it("never saves browser-only file links", () => {
    expect(toSaved({ id: "x", source: "blob:http://a/1" })).toEqual({ id: "x" });
    expect(toSaved({ id: "x", source: "https://site.com" })).toEqual({ id: "x", source: "https://site.com" });
    expect(draftToSaved({ events: [{ source: "blob:http://a/2", name: "Clip" }] })).toEqual({ events: [{ source: "", name: "Clip" }] });
  });
});
