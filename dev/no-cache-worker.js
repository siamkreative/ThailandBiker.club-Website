/**
 * Local-dev-only Worker wrapper — never deployed (see `.assetsignore`).
 *
 * The production `_headers` file marks `/assets/*` and `/images/*` as
 * `immutable` for a year. Those paths carry no fingerprint, so while editing
 * `assets/legal.css` or `assets/legal.js` the browser keeps serving its cached
 * copy and every change needs a manual hard refresh.
 *
 * This wrapper sits in front of the same static asset server `wrangler dev`
 * already uses (so clean URLs, the 404 page, and the security headers behave
 * exactly as in production) and rewrites the caching headers on the way out.
 *
 * Used by `wrangler.dev.jsonc`; production still runs the plain static-asset
 * Worker configured in `wrangler.jsonc`.
 */

export default {
  async fetch(request, env) {
    // Drop validators from the request so the asset server can never answer
    // with a 304 that sends the browser back to a stale cached body.
    const headers = new Headers(request.headers);
    headers.delete("If-None-Match");
    headers.delete("If-Modified-Since");

    const response = await env.ASSETS.fetch(new Request(request, { headers }));

    // ...and from the response, so nothing is cached or revalidated at all.
    const outHeaders = new Headers(response.headers);
    outHeaders.set("Cache-Control", "no-store, must-revalidate");
    outHeaders.delete("ETag");
    outHeaders.delete("Last-Modified");
    outHeaders.delete("Expires");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outHeaders,
    });
  },
};
