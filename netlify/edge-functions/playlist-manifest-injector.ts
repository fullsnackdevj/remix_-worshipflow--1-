/**
 * Netlify Edge Function: playlist-manifest-injector
 *
 * Runs at the CDN edge BEFORE the HTML reaches the browser.
 * Replaces the generic <link rel="manifest" href="/manifest.json" />
 * with a slug-specific one → /api/playlist-manifest/:slug
 *
 * This is the only reliable way to fix the iOS Safari "Add to Home Screen"
 * issue — JavaScript useEffect() runs too late; iOS reads the manifest tag
 * from the raw HTML synchronously at page load time.
 */
export default async (request: Request, context: any) => {
  const url = new URL(request.url);

  // Extract slug from /p/:slug (strip leading /p/)
  const slug = url.pathname.replace(/^\/p\//, "").split("/")[0];
  if (!slug) return context.next();

  // Fetch the original index.html from Netlify's CDN
  const response = await context.next();

  // Only transform HTML responses
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();

  // Replace the static manifest link with the slug-specific API endpoint
  const modified = html.replace(
    /<link rel="manifest" href="\/manifest\.json"\s*\/>/,
    `<link rel="manifest" href="/api/playlist-manifest/${slug}" />`
  );

  return new Response(modified, {
    status: response.status,
    headers: response.headers,
  });
};

export const config = { path: "/p/*" };
