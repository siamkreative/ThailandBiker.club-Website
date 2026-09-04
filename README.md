# ThailandBiker.club — Website

Marketing website for the [ThailandBiker.club](https://thailandbiker.club) mobile app — a curated directory of places, trips, events, and guides for motorcycle riders in Thailand.

## Pages

- `/` — Homepage (hero, features, screenshots, Play Store CTA + iOS waitlist modal)
- `/privacy-policy` — Privacy Policy
- `/terms-of-use` — Terms of Use
- `/delete-account` — Account & data deletion instructions
- `/support` — Support & contact

## Stack

Plain HTML, CSS, and JavaScript — no build step, no dependencies.

Deployed on Cloudflare Workers & Pages.

## Development

```bash
npx http-server -o
```

Opens the site at `http://localhost:8080`.

## App Screenshots

Optimised screenshots live in `images/`. If you need to update them, drop new JPGs in `images/` and run:

```bash
sips -Z 540 -s formatOptions 82 your-screenshot.jpg --out images/screen-name.jpg
```

## License

Copyright © 2026 ThailandBiker.club. All rights reserved.
