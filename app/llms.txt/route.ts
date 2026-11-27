const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/contact-us",
  "/reviews",
  "/brandkit",
  "/auth/signin",
  "/auth/signup",
];

export function GET(): Response {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://marvedge.com"
  ).replace(/\/+$/, "");

  const lines = [
    "# llms.txt",
    "",
    "Public pages for language models and crawlers.",
    "",
    "## Crawler access",
    "User-agent: *",
    "Allow: /",
    "",
    "## Public pages",
    ...PUBLIC_PATHS.map((path) => `- ${baseUrl}${path}`),
    `- ${baseUrl}/sitemap.xml`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
