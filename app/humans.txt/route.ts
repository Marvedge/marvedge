/**
 * humans.txt joins robots.txt, sitemap.xml and manifest.webmanifest as another
 * crawler-facing discovery file. Keep the body plain text and deterministic:
 * no request-derived values, no timestamps, no random data.
 */
export async function GET(): Promise<Response> {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://marvedge.com"
  ).replace(/\/+$/, "");

  const body = `/* TEAM */
Team: Marvedge
URL: ${baseUrl}

/* SITE */
Allow: /
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
