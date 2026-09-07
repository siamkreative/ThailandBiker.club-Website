# ThailandBiker.club — Website

Marketing website for the [ThailandBiker.club](https://thailandbiker.club) mobile app — a curated directory of places, trips, events, and guides for motorcycle riders in Thailand.

This repo contains **only the website**. The mobile app itself lives in a separate repo: [siamkreative/ThailandBiker.club](https://github.com/siamkreative/ThailandBiker.club).

## Pages

- `/` — Homepage (hero, features, screenshots, Play Store CTA + iOS waitlist modal)
- `/privacy-policy` — Privacy Policy
- `/terms-of-use` — Terms of Use
- `/delete-account` — Account & data deletion instructions
- `/support` — Support & contact

## Stack

Plain HTML, CSS, and JavaScript — no build step, no dependencies.

Deployed on Cloudflare Workers static assets (`wrangler.jsonc`). Clean URLs (`/support`, `/delete-account`) resolve to the matching `.html` file.

## Development

```bash
npx http-server -o        # quick static preview at http://localhost:8080
npx wrangler dev          # preview with the Cloudflare Workers runtime
```

In [Conductor](https://conductor.build) workspaces, the Run button starts the same `wrangler dev` preview on the workspace's assigned port (`.conductor/settings.toml`).

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
