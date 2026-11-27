const manifest = {
  name: "Marvedge",
  short_name: "Marvedge",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#F1ECFF",
  icons: [
    {
      src: "/Icon.png",
      sizes: "192x192",
      type: "image/png",
    },
  ],
};

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
