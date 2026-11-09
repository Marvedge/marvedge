import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as dns } from "node:dns";

import { deliveryHostIsPublic } from "./deliveryCheck";

let lookupSpy: ReturnType<typeof vi.spyOn>;

describe("deliveryHostIsPublic", () => {
  beforeEach(() => {
    lookupSpy = vi.spyOn(dns, "lookup");
  });

  afterEach(() => {
    lookupSpy.mockRestore();
  });

  it("allows a host that resolves only to public addresses", async () => {
    lookupSpy.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ] as never);

    await expect(deliveryHostIsPublic("https://hooks.example.com/marvedge")).resolves.toBe(true);
  });

  it("blocks a host with any private answer", async () => {
    lookupSpy.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ] as never);

    await expect(deliveryHostIsPublic("https://hooks.example.com/marvedge")).resolves.toBe(false);
  });

  it("fails closed when DNS resolution errors", async () => {
    lookupSpy.mockRejectedValue(new Error("EAI_AGAIN"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await expect(deliveryHostIsPublic("https://hooks.example.com/marvedge")).resolves.toBe(
        false
      );
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("fails closed when DNS returns zero answers", async () => {
    lookupSpy.mockResolvedValue([] as never);

    await expect(deliveryHostIsPublic("https://hooks.example.com/marvedge")).resolves.toBe(false);
  });

  it("blocks a literal private host without resolving it", async () => {
    await expect(deliveryHostIsPublic("http://169.254.169.254/latest/meta-data")).resolves.toBe(
      false
    );
    expect(lookupSpy).not.toHaveBeenCalled();
  });

  it("blocks malformed URLs", async () => {
    await expect(deliveryHostIsPublic("not a url")).resolves.toBe(false);
    expect(lookupSpy).not.toHaveBeenCalled();
  });
});
