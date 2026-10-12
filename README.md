# ThailandBiker.club — Website

Marketing website for the [ThailandBiker.club](https://thailandbiker.club) mobile app — a curated directory of places, trips, events, and guides for motorcycle riders in Thailand.

This repo contains **only the website**. The mobile app itself lives in a separate repo: [siamkreative/ThailandBiker.club](https://github.com/siamkreative/ThailandBiker.club).

## Pages

- `/` — Homepage (hero, features, screenshots, Play Store CTA + iOS waitlist modal)
- `/privacy-policy` — Privacy Policy
- `/terms-of-use` — Terms of Use
- `/delete-account` — Account & data deletion instructions
- `/support` — Support & contact
- `/places/<uuid>`, `/trips/<uuid>`, `/events/<uuid>`, `/guides/<uuid>` — share-link previews, rendered by the Worker (see [Share links](#share-links))
- `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association` — Android App Links / iOS Universal Links verification

## Stack

Plain HTML, CSS, and JavaScript — no build step, no dependencies.

Deployed on Cloudflare Workers static assets (`wrangler.jsonc`). Clean URLs (`/support`, `/delete-account`) resolve to the matching `.html` file.

One small Worker (`worker/index.js`, plain JS) renders the share-link previews.
`assets.run_worker_first` routes only `/places/*`, `/trips/*`, `/events/*` and
`/guides/*` to it; every other URL is served as a static file without invoking it.

## Share links

The app shares links like `https://thailandbiker.club/places/<uuid>` (also
`trips`, `events`, `guides`). With the app installed, Android App Links and iOS
Universal Links open the item in the app; the two verification files live in
`.well-known/`:

- `assetlinks.json` — package `com.thailandbikerclub.app`, with the SHA-256
  fingerprints of the Play app-signing key and the upload key (Play Console →
  Protected with Play, formerly App integrity). Add a debug key's fingerprint
  here only while testing locally.
- `apple-app-site-association` — app ID `PD47FLA8L8.com.thailandbikerclub.app`
  and the four path patterns. It has no file extension, so `_headers` sets its
  `Content-Type: application/json`, which Apple requires.

Without the app, the Worker answers instead. It validates the UUID, reads the
item from Supabase REST with the public anon key (approved items only), and
returns a preview page: Open Graph / Twitter tags for link previews in LINE,
WhatsApp and Facebook, a photo card, an "Open in the app" button, Google Play
and the iOS waitlist. Photos from the Supabase `places` bucket go through
ImageKit, resized to 1200×630 for `og:image`; other photos are used as they are,
and items without one fall back to `images/og-cover.jpg`. A bad UUID, a missing
or unapproved item, or any Supabase error returns the normal 404 page.

Preview pages are `noindex` for now and cached at the edge for 5 minutes, so an
edit in the app can take that long to show on the web. `_headers` doesn't apply
to Worker responses, so the Worker sets the security headers itself. Its CSP is
the site's CSP, with `img-src` extended to ImageKit and Supabase Storage. Keep
the two in sync.

### Secret

The Worker reads the Supabase anon key from the `SUPABASE_ANON_KEY` secret. The
key is public by design (the app ships it), but it stays out of the repo and the
HTML. Set it once per Cloudflare account (it's in the app repo at
`lib/config/supabase_config.dart`):

```bash
npx wrangler secret put SUPABASE_ANON_KEY
```

Without it, every share link returns the 404 page.

For local development, put it in `.dev.vars` (gitignored and kept out of the
asset upload by `.assetsignore`):

```bash
echo "SUPABASE_ANON_KEY=<anon key>" > .dev.vars
```

## Development

```bash
npx http-server -o                                  # quick static preview at http://localhost:8080
npx wrangler dev --config wrangler.dev.jsonc        # preview with the Cloudflare Workers runtime
npx wrangler dev                                    # exact production config (share-link Worker + edge cache)
```

To test share links, run either `wrangler dev` command (with `.dev.vars` in
place) and request a real ID. `http-server` can't render them.

```bash
curl -i http://localhost:8787/.well-known/apple-app-site-association   # 200, application/json
curl -s http://localhost:8787/places/<uuid> | grep -E 'og:|twitter:'     # preview tags
curl -i http://localhost:8787/places/not-a-uuid                         # 404 page
```

To find approved IDs, query Supabase REST, e.g.
`curl "https://pbclxswdjxpmrfachogs.supabase.co/rest/v1/trips?status=eq.Approved&select=id,name&limit=5" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"`.

`wrangler.dev.jsonc` serves the same assets as production but fronts them with a
dev-only Worker (`dev/no-cache-worker.js`) that replaces the `immutable` cache
headers from `_headers` with `no-store`. It hands share links to the production
Worker (`worker/index.js`), skipping its edge cache. Without it, `/assets/*` and `/images/*`
are cached for a year and CSS/JS edits only appear after a manual cache clear.
Add `--live-reload` to have open pages reload themselves on every save.

Deploys are unaffected: `wrangler deploy` uses `wrangler.jsonc`, which runs only
the share-link Worker. Keep the shared asset options in the two configs in sync.

`.assetsignore` keeps repo plumbing (`README.md`, `dev/`, `worker/`, the wrangler
configs, `.dev.vars`, `.conductor/`, dotfiles) out of the published asset bundle.
`.well-known/` is deliberately not ignored.

In [Conductor](https://conductor.build) workspaces, the Run button starts the same
preview on the workspace's assigned port (`.conductor/settings.toml`).

## Branding

The site shares its brand tokens with the app (`lib/config/app_theme.dart` and
`docs/features/BRANDING.md` in the app repo). Change them in both places or not at all:

- **Type**: Sora for headings and the wordmark, Inter for everything else (`--font-heading` in `index.html` and `assets/legal.css`).
- **Colour**: `--dark` `#1A1A1A` (nav, footer, browser `theme-color`), `--accent` `#FF6B35`, `--bg` `#F5F5F5`.
- **Wordmark**: `ThailandBiker` at weight 800 followed by a muted, weight-500 `.club`.
- **Logo**: `logo.png` is the app's `assets/icon/logo-transparent.png` downscaled to 160 px (`sips -Z 160`).

## App Screenshots

Phone screenshots live in `images/` as matched pairs: `screen-*.jpg` (fallback) and `screen-*.webp` (served first via `<picture>`). Current set: `places`, `trips`, `events`, `guides`, `favorites`.

Each screen also has a `screen-*-lg.webp` (600 px wide) shown in the click-to-enlarge lightbox on the homepage.

To refresh one, drop a full-resolution portrait screenshot in and regenerate all three files (needs `cwebp` — `brew install webp`):

```bash
name=screen-places   # one of: screen-{places,trips,events,guides,favorites}
sips -s format jpeg -s formatOptions 72 -Z 540 your-screenshot.png --out images/$name.jpg
cwebp -q 80 images/$name.jpg -o images/$name.webp
sips -s format jpeg -s formatOptions 80 --resampleWidth 600 your-screenshot.png --out /tmp/$name-lg.jpg
cwebp -q 82 /tmp/$name-lg.jpg -o images/$name-lg.webp
```

`images/og-cover.jpg` is the social share image (1200×630).

## License

Copyright © 2026 ThailandBiker.club. All rights reserved.
