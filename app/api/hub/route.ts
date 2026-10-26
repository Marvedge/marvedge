import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { registerCustomDomain, deleteCustomDomain } from "@/app/lib/cloudflare";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (!session.user?.id && !session.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: session.user.id || undefined }, { email: session.user.email || undefined }],
      },
      include: { hubSettings: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If hub settings do not exist, create a default hub settings profile
    if (!user.hubSettings) {
      const defaultSubdomain = `user-${user.id.substring(0, 8)}`;
      const settings = await prisma.hubSettings.create({
        data: {
          userId: user.id,
          subdomain: defaultSubdomain,
          hubTitle: `${user.name || "My"} Product Hub`,
          hubDescription: "Browse all our product interactive tours.",
        },
      });
      return NextResponse.json({ success: true, settings });
    }

    return NextResponse.json({ success: true, settings: user.hubSettings });
  } catch (error) {
    console.error("GET /api/hub error:", error);
    return NextResponse.json({ error: "Failed to fetch hub settings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (!session.user?.id && !session.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: session.user.id || undefined }, { email: session.user.email || undefined }],
      },
      include: { hubSettings: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
      logoUrl,
      brandColor,
      textColor,
      accentColor,
      hubTitle,
      hubDescription,
      subdomain,
      customDomain,
    } = body;

    // The logo is rendered on public hub pages — only server-fetchable https
    // URLs are stored, never javascript:/data: or protocol-relative input.
    if (typeof logoUrl === "string" && logoUrl.trim()) {
      let parsedLogo: URL;
      try {
        parsedLogo = new URL(logoUrl.trim());
      } catch {
        return NextResponse.json({ error: "Logo URL must be a valid https URL" }, { status: 400 });
      }
      if (parsedLogo.protocol !== "https:") {
        return NextResponse.json({ error: "Logo URL must be a valid https URL" }, { status: 400 });
      }
    }

    // Hex colours land in inline styles on public pages — anything else is rejected.
    if (typeof brandColor === "string" && brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
      return NextResponse.json(
        { error: "Brand color must be a hex color like #7C5CFC" },
        { status: 400 }
      );
    }

    const cleanHubTitle = typeof hubTitle === "string" ? hubTitle.trim() : hubTitle;
    if (typeof cleanHubTitle === "string" && cleanHubTitle.length > 200) {
      return NextResponse.json(
        { error: "Hub title must be under 200 characters" },
        { status: 400 }
      );
    }

    // Enforce static unique ID suffix on subdomain
    const cleanPrefix = subdomain
      ? subdomain
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "")
      : "user";
    const finalSubdomain = `${cleanPrefix || "user"}-${user.id.substring(0, 8)}`;

    if (finalSubdomain !== user.hubSettings?.subdomain) {
      const existingSubdomain = await prisma.hubSettings.findUnique({
        where: { subdomain: finalSubdomain },
      });
      if (existingSubdomain) {
        return NextResponse.json({ error: "Subdomain is already in use" }, { status: 400 });
      }
    }

    // Validate custom domain uniqueness if changed
    const cleanCustomDomain = customDomain ? customDomain.trim().toLowerCase() : null;
    if (cleanCustomDomain && cleanCustomDomain !== user.hubSettings?.customDomain) {
      const existingCustomDomain = await prisma.hubSettings.findUnique({
        where: { customDomain: cleanCustomDomain },
      });
      if (existingCustomDomain) {
        return NextResponse.json({ error: "Custom domain is already in use" }, { status: 400 });
      }
    }

    let cloudflareId = user.hubSettings?.cloudflareId || null;
    let sslStatus = user.hubSettings?.sslStatus || "pending";
    let dnsVerification = user.hubSettings?.dnsVerification || null;

    // If custom domain is updated, trigger Cloudflare API integration
    if (cleanCustomDomain !== user.hubSettings?.customDomain) {
      // 1. Delete previous custom hostname from Cloudflare if it exists
      if (user.hubSettings?.cloudflareId) {
        await deleteCustomDomain(user.hubSettings.cloudflareId);
      }

      if (cleanCustomDomain) {
        // 2. Register new custom hostname
        const cfResult = await registerCustomDomain(cleanCustomDomain);
        if (cfResult.success) {
          cloudflareId = cfResult.id || null;
          sslStatus = cfResult.sslStatus || "pending";
          dnsVerification = cfResult.dnsVerification || null;
        } else {
          console.error("Cloudflare registration error during save:", cfResult.error);
          return NextResponse.json(
            { error: `Cloudflare configuration failed: ${cfResult.error}` },
            { status: 500 }
          );
        }
      } else {
        cloudflareId = null;
        sslStatus = "pending";
        dnsVerification = null;
      }
    }

    // Update settings
    const updatedSettings = await prisma.hubSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        logoUrl,
        brandColor: brandColor || "#7C5CFC",
        textColor: textColor || "#111827",
        accentColor: accentColor || "#F3F0FC",
        hubTitle: cleanHubTitle || `${user.name || "My"} Product Hub`,
        hubDescription: hubDescription || "",
        subdomain: finalSubdomain,
        customDomain: cleanCustomDomain,
        cloudflareId,
        sslStatus,
        dnsVerification: dnsVerification ? JSON.parse(JSON.stringify(dnsVerification)) : null,
      },
      update: {
        logoUrl,
        brandColor: brandColor || "#7C5CFC",
        textColor: textColor || "#111827",
        accentColor: accentColor || "#F3F0FC",
        hubTitle: cleanHubTitle || `${user.name || "My"} Product Hub`,
        hubDescription: hubDescription || "",
        subdomain: finalSubdomain,
        customDomain: cleanCustomDomain,
        cloudflareId,
        sslStatus,
        dnsVerification: dnsVerification ? JSON.parse(JSON.stringify(dnsVerification)) : null,
      },
    });

    return NextResponse.json({ success: true, settings: updatedSettings });
  } catch (error) {
    console.error("POST /api/hub error:", error);
    return NextResponse.json({ error: "Failed to save hub settings" }, { status: 500 });
  }
}
