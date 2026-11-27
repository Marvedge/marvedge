import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://marvedge.com"
  ).replace(/\/+$/, "");

  const lastModified = new Date("2026-01-01T00:00:00.000Z");

  const routes = [
    "/",
    "/pricing",
    "/contact-us",
    "/reviews",
    "/brandkit",
    "/auth/signin",
    "/auth/signup",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified,
  }));
}
