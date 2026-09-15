/**
 * Idempotent seed for demo reviews on the landing page + /reviews route.
 *
 * Run with:  node scripts/seed-reviews.mjs
 * (also wired as `prisma db seed` in package.json).
 *
 * Design notes:
 * - Uses upsert by the unique user `email` so re-running never duplicates users.
 * - Reviews are keyed to each seeded user via `findFirst → update/create`, so
 *   re-running updates ratings/content instead of stacking duplicates. This matches
 *   the one-review-per-user model used by `app/api/reviews/route.ts` POST.
 * - `image` is deliberately left null: next.config has no `remotePatterns`, so an
 *   external avatar URL would break `<Image>`. The card's initials fallback is used
 *   (already styled for light + dark).
 * - Name lengths are varied on purpose: short, medium, long-with-spaces, and a long
 *   no-space string — the last two exercise the truncate/min-w-0 overflow fix.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED = [
  {
    email: "demo.ava@marvedge.com",
    name: "Ava Reynolds",
    bio: "VP Marketing, Northwind",
    rating: 5,
    content:
      "Marvedge cut our demo turnaround from days to hours. The interactive walkthroughs are exactly what our sales team needed to close deals faster.",
  },
  {
    email: "demo.leo@marvedge.com",
    name: "Leo Moretti",
    bio: "Product Lead",
    rating: 5,
    content: "The cleanest way we've found to turn a product tour into a shareable, trackable link. Love the analytics.",
  },
  {
    email: "demo.maya@marvedge.com",
    name: "Maya Okafor",
    bio: "Solutions Engineer",
    rating: 4,
    content:
      "Solid tool. The editor is responsive and the exports look professional out of the box. A few small nits but the team ships fast.",
  },
  {
    email: "demo.eli@marvedge.com",
    name: "Eli Vasquez-Zimmermann",
    bio: "Head of Sales Enablement",
    rating: 5,
    content:
      "We replaced three separate tools with Marvedge. Onboarding ramped in a single afternoon and our reps actually use it.",
  },
  {
    email: "demo.zara@marvedge.com",
    name: "Zara Okafor-Jones-Anderson",
    bio: "Customer Success",
    rating: 4,
    content: "Great value for the price. Support replies fast and the roadmap keeps getting better.",
  },
  {
    email: "demo.nosh@marvedge.com",
    name: "NnamdiOkaforMbanefoUgochukwu",
    bio: "Founding Engineer",
    rating: 5,
    content: "Rock solid. Built our whole sales demo funnel on it and availability has been flawless.",
  },
];

async function main() {
  let upserted = 0;
  let updated = 0;

  for (const entry of SEED) {
    const user = await prisma.user.upsert({
      where: { email: entry.email },
      update: { name: entry.name, bio: entry.bio },
      create: {
        email: entry.email,
        name: entry.name,
        bio: entry.bio,
        // no password — not an auth'able account
      },
    });

    const existing = await prisma.review.findFirst({
      where: { userId: user.id },
    });

    if (existing) {
      await prisma.review.update({
        where: { id: existing.id },
        data: { rating: entry.rating, content: entry.content },
      });
      updated += 1;
    } else {
      await prisma.review.create({
        data: { userId: user.id, rating: entry.rating, content: entry.content },
      });
      upserted += 1;
    }
  }

  console.log(`Seed complete — reviews inserted: ${upserted}, updated: ${updated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
