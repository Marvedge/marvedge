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
    email: "demo.atma@marvedge.com",
    name: "Atma Par-Atma",
    bio: null,
    rating: 5,
    content: "good",
  },
  {
    email: "demo.rahul@marvedge.com",
    name: "Rahul",
    bio: null,
    rating: 5,
    content: "Nice one..",
  },
  {
    email: "demo.sarthak@marvedge.com",
    name: "Sarthak",
    bio: null,
    rating: 5,
    content: "fgfggf",
  },
  {
    email: "demo.eryrty@marvedge.com",
    name: "eryrty",
    bio: null,
    rating: 4,
    content: "eryrty",
  },
  {
    email: "demo.ashish@marvedge.com",
    name: "ASHISH KUMAR MISHRA",
    bio: null,
    rating: 5,
    content: "Yes. It is user friendly.",
  },
  {
    email: "demo.badal@marvedge.com",
    name: "Badal Shankhwar",
    bio: "Dedicated in Finance",
    rating: 4,
    content: "Dedicated in Finance",
  },
  {
    email: "demo.manushi@marvedge.com",
    name: "MANUSHI CHdaf",
    bio: null,
    rating: 5,
    content: "I AM BATMAN",
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
