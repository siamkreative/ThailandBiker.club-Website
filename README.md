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

Phone screenshots live in `images/` as matched pairs: `screen-*.jpg` (fallback) and `screen-*.webp` (served first via `<picture>`). Current set: `home`, `places`, `trips`, `events`, `guides`.

To refresh one, drop a full-resolution portrait screenshot in and regenerate both files:

```bash
name=screen-home   # one of: screen-{home,places,trips,events,guides}
sips -Z 540 -s formatOptions 82 your-screenshot.jpg --out images/$name.jpg
sips -s format webp -s formatOptions 80 images/$name.jpg --out images/$name.webp
```

`images/og-cover.jpg` is the social share image (1200×630).

## License

Copyright © 2026 ThailandBiker.club. All rights reserved.
