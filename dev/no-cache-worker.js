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
 * Share links (`/places/<uuid>` etc.) go to the production share-link Worker
 * (`worker/index.js`), minus its edge cache, so previews can be tested locally.
 *
 * Used by `wrangler.dev.jsonc`; production runs `worker/index.js` directly
 * (see `wrangler.jsonc`).
 */

import { handleShare } from "../worker/index.js";

const SHARE_PREFIX = /^\/(places|trips|events|guides)\//;

export default {
  async fetch(request, env) {
    // Drop validators from the request so the asset server can never answer
    // with a 304 that sends the browser back to a stale cached body.
    const headers = new Headers(request.headers);
    headers.delete("If-None-Match");
    headers.delete("If-Modified-Since");

    const devRequest = new Request(request, { headers });
    const response = SHARE_PREFIX.test(new URL(request.url).pathname)
      ? await handleShare(devRequest, env)
      : await env.ASSETS.fetch(devRequest);

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
