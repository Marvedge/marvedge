import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { hubShareUrl } from "@/app/lib/share/qrTarget";
import ShareVideoPageClient from "@/app/share/[slug]/ShareVideoPageClient";
import { BRANCH_PLACEMENTS } from "@/app/lib/overlays/branch";
import { shareAspectRatio, shareBackgroundStyle } from "@/app/lib/demos/sharePresentation";
import { resolveShareOverlays, shareMediaUrl } from "@/app/share/[slug]/overlayContext";

type PageProps = {
  params: Promise<{ domain: string; slug: string }>;
};

export default async function BrandedSharePage({ params }: PageProps) {
  const { domain, slug } = await params;

  // Find settings to apply brand colors
  const settings = await prisma.hubSettings.findFirst({
    where: {
      OR: [{ subdomain: domain }, { customDomain: domain }],
    },
  });

  const demo = await prisma.demo.findFirst({
    where: {
      isPublic: true,
      OR: [{ publicLink: slug }, { id: slug }],
    },
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      exportedUrl: true,
      editing: true,
      ctas: {
        // Branch cards are Cta rows too (decision 6), and they are rendered by
        // the player's overlay — not as a button under the video. Excluding
        // them by placement is what stops a demo with branching configured
        // growing two extra buttons down here. `placement` is null on every CTA
        // that exists today, so the rendered output is unchanged for all of them
        // — and the OR is spelled out because SQL's `NOT IN` is NULL, not true,
        // for a null column.
        where: { OR: [{ placement: null }, { placement: { notIn: [...BRANCH_PLACEMENTS] } }] },
        select: { id: true, label: true, url: true, order: true },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!demo) {
    notFound();
  }

  const fallbackColor = settings?.accentColor || "#F3F0FC";

  // The QR has to carry the CUSTOMER's domain. This page is only ever reached
  // through the middleware.ts rewrite of https://<their-domain>/share/<slug>, so
  // the request host is that domain and NEXT_PUBLIC_APP_URL — which the share API
  // routes use, correctly, for creator-facing links minted on marvedge.com —
  // would be the wrong origin here. `slug` is echoed back rather than
  // demo.publicLink so the QR resolves to the same URL the visitor is reading.
  const shareQrUrl = hubShareUrl((await headers()).get("host"), slug);

  // The hub title is the second `{owner}` candidate in the consent sentence: on
  // a customer's own domain the viewer knows the brand on the page, not the name
  // on our user record.
  const overlayContext = await resolveShareOverlays(demo.id, { hubTitle: settings?.hubTitle });

  return (
    <ShareVideoPageClient
      title={demo.title}
      description={demo.description}
      videoUrl={shareMediaUrl(demo.exportedUrl || demo.videoUrl, overlayContext)}
      backgroundStyle={shareBackgroundStyle(demo.editing, {
        backgroundColor: fallbackColor || "#F3F0FC",
      })}
      aspectRatio={shareAspectRatio(demo.editing)}
      demoId={demo.id}
      ctas={demo.ctas}
      shareQrUrl={shareQrUrl}
      // The player's controls take the customer's brand colour here. Marvedge
      // purple on someone else's domain is our branding leaking onto their page.
      accentColor={settings?.brandColor}
      overlays={overlayContext?.overlays}
      ownerName={overlayContext?.ownerName}
      leadCaptured={overlayContext?.leadCaptured}
      mediaGated={overlayContext?.mediaGated}
      branchCards={overlayContext?.branchCards}
    />
  );
}
