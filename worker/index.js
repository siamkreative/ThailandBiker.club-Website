/**
 * Share-link Worker — renders the web fallback for app deep links.
 *
 * Links shared from the app look like `https://thailandbiker.club/<type>/<uuid>`
 * (type: places, trips, events, guides). With the app installed, Android App
 * Links / iOS Universal Links open the app before this ever runs (see
 * `.well-known/`). Otherwise this Worker answers with a small preview page:
 * Open Graph tags for link previews (LINE, WhatsApp, Facebook) plus store CTAs.
 *
 * `wrangler.jsonc` routes only those four path patterns here
 * (`assets.run_worker_first`); every other URL stays a plain static asset.
 *
 * Items are read from Supabase REST with the public anon key
 * (`SUPABASE_ANON_KEY` secret), so RLS still hides drafts and pending items.
 * Anything that isn't a valid, approved item — or any upstream error — falls
 * back to the site's normal 404 page.
 */

const SITE_URL = "https://thailandbiker.club";
const SUPABASE_URL = "https://pbclxswdjxpmrfachogs.supabase.co";

// ImageKit's origin is the public `places` bucket (same as the app's
// `lib/utils/image_url.dart`), so only those URLs can be rewritten.
const PLACES_BUCKET_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/places/`;
const IMAGEKIT_ENDPOINT = "https://ik.imagekit.io/siamkreative/thailandbikerclub/";
const OG_IMAGE_TRANSFORM = "w-1200,h-630,fo-auto,f-jpg,q-80";
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/og-cover.jpg`;

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.thailandbikerclub.app";

const SHARE_PATH = /^\/(places|trips|events|guides)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

// Same policy as `/*` in `_headers` (which doesn't apply to Worker-generated
// responses), plus the two image hosts the preview card loads from. Keep the
// two in sync.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `img-src 'self' data: https://ik.imagekit.io ${SUPABASE_URL}`,
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "frame-src https://tally.so",
    "connect-src 'self' https://submit-form.com https://cloudflareinsights.com",
    "form-action 'self' https://submit-form.com",
    "upgrade-insecure-requests",
  ].join("; "),
};

const TYPES = {
  places: {
    label: "Place",
    // The view adds the province name; `places` itself only has `province_id`.
    table: "places_with_categories",
    select: "name,description,photos,province_name_en",
    toItem: (row) => ({
      name: row.name,
      text: plainText(row.description),
      image: firstString(row.photos),
      where: row.province_name_en,
    }),
  },
  trips: {
    label: "Trip",
    table: "trips",
    select: "name,description,photos,trip_provinces(provinces(name_en))",
    toItem: (row) => ({
      name: row.name,
      text: plainText(row.description),
      image: firstString(row.photos),
      where: unique((row.trip_provinces || []).map((tp) => tp?.provinces?.name_en)).join(", "),
    }),
  },
  events: {
    label: "Event",
    table: "events",
    select: "name,description,photo,location,start_date,end_date",
    toItem: (row) => ({
      name: row.name,
      text: plainText(row.description),
      image: row.photo,
      where: row.location,
      when: formatDateRange(row.start_date, row.end_date),
    }),
  },
  guides: {
    label: "Guide",
    // Guides have no description/excerpt column; derive one from the markdown body.
    table: "guides",
    select: "title,content,featured_image",
    toItem: (row) => ({
      name: row.title,
      text: plainText(row.content),
      image: row.featured_image,
    }),
  },
};

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return env.ASSETS.fetch(request);
    }

    // Shared links pick up tracking params (`?fbclid=…`); they don't change the page.
    const url = new URL(request.url);
    const cacheKey = new Request(url.origin + url.pathname.toLowerCase());
    const cache = caches.default;

    let response = await cache.match(cacheKey);
    if (!response) {
      response = await handleShare(request, env);
      if (response.status === 200) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return request.method === "HEAD" ? new Response(null, response) : response;
  },
};

/**
 * Renders the preview page for a share path, or the static 404 page. No edge
 * caching here — the default export adds it, and the dev Worker skips it.
 */
export async function handleShare(request, env) {
  const match = SHARE_PATH.exec(new URL(request.url).pathname);
  if (!match) return notFound(request, env);

  const type = match[1].toLowerCase();
  const id = match[2].toLowerCase();

  const item = await fetchItem(type, id, env);
  if (!item || !item.name) return notFound(request, env);

  return new Response(renderPage(type, id, item), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      ...SECURITY_HEADERS,
    },
  });
}

// The share paths don't exist as files, so the asset server answers with
// `404.html` and a 404 status (`not_found_handling: "404-page"`).
function notFound(request, env) {
  return env.ASSETS.fetch(request);
}

async function fetchItem(type, id, env) {
  const key = env.SUPABASE_ANON_KEY;
  if (!key) {
    console.error("SUPABASE_ANON_KEY is not set");
    return null;
  }

  const { table, select, toItem } = TYPES[type];
  // RLS already hides unapproved rows; the status filter is belt and braces.
  const api = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&status=eq.Approved&select=${encodeURIComponent(select)}&limit=1`;

  try {
    const res = await fetch(api, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`Supabase ${table} ${id}: HTTP ${res.status}`);
      return null;
    }
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? toItem(rows[0]) : null;
  } catch (err) {
    console.error(`Supabase ${table} ${id}: ${err}`);
    return null;
  }
}

function renderPage(type, id, item) {
  const { label } = TYPES[type];
  const canonical = `${SITE_URL}/${type}/${id}`;
  const description =
    truncate(item.text, 200) ||
    `${label} on ThailandBiker.club, the riding companion for motorcycle riders in Thailand.`;
  const meta = [item.where, item.when].filter(Boolean);

  const photo = httpsUrl(item.image);
  const ogImage = photo ? ogImageUrl(photo) : DEFAULT_OG_IMAGE;
  // Only the ImageKit rewrite and the default cover have a known size.
  const ogImageSized = ogImage !== photo;

  const playUrl =
    `${PLAY_STORE_URL}&referrer=` +
    encodeURIComponent(`utm_source=website&utm_medium=share_link&utm_campaign=play_launch&utm_content=${type}`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="theme-color" content="#1A1A1A">
<title>${esc(item.name)} — ThailandBiker.club</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${esc(canonical)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Sora:wght@500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/legal.css">

<!-- Open Graph -->
<meta property="og:type" content="${type === "guides" ? "article" : "website"}">
<meta property="og:title" content="${esc(item.name)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">${
    ogImageSized
      ? `
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">`
      : ""
  }
<meta property="og:site_name" content="ThailandBiker.club">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(item.name)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(ogImage)}">

<!-- Favicon -->
<link rel="icon" href="/favicon.ico" sizes="32x32 16x16" type="image/x-icon">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">

<style>${PAGE_CSS}</style>
</head>
<body>

<header class="nav" id="nav">
  <div class="container nav__inner">
    <a href="/" class="logo">
      <span class="logo__mark" aria-hidden="true">
        <img src="/logo.png" alt="" width="40" height="40">
      </span>
      <span class="logo__name"><b>ThailandBiker</b><span>.club</span></span>
    </a>
    <a href="${esc(playUrl)}" class="btn btn--primary" target="_blank" rel="noopener">Get the app</a>
  </div>
</header>

<main class="share">
  <div class="container">
    <article class="share-card">
      ${
        photo
          ? `<img class="share-card__photo" src="${esc(ogImage)}" alt="" width="1200" height="630">`
          : ""
      }
      <div class="share-card__body">
        <span class="page-header__eyebrow">${esc(label)}</span>
        <h1 class="share-card__title">${esc(item.name)}</h1>
        ${
          meta.length
            ? `<p class="share-card__meta">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</p>`
            : ""
        }
        ${item.text ? `<p class="share-card__text">${esc(truncate(item.text, 320))}</p>` : ""}
        <div class="share-card__ctas">
          <a href="${esc(canonical)}" class="btn btn--primary btn--lg">Open in the app</a>
          <a href="${esc(playUrl)}" class="btn btn--dark btn--lg" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.5 20.5l9.5-5.5-9.5-5.5v11zm.5-12.5l9 5.5 2.5-1.5-3-3-8.5-1zm9.5 6l3-1.7L21 13.7c.6.4.6 1.3 0 1.7l-2.5 1.5-3-1.7zM6 16l9-1 3 3-2.5 1.5L6 16z"/></svg>
            Get it on Google Play
          </a>
          <a href="/#download" class="btn btn--ghost btn--lg" data-waitlist>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.4-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.8-3.1-.8-1.6 0-3 .9-3.8 2.4-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.4 1.2 0 1.6-.7 3-.7 1.4 0 1.8.7 3 .7 1.2 0 2-1.1 2.8-2.3.9-1.3 1.2-2.6 1.3-2.6-.1 0-2.4-1-2.4-3.6zM14 5.4c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z"/></svg>
            Join the iOS waitlist
          </a>
        </div>
        <p class="share-card__hint">Don't have the app yet? It's free on Android, and iOS is coming soon.</p>
      </div>
    </article>
  </div>
</main>

<footer class="footer">
  <div class="container">
    <div class="footer__top">
      <div class="footer__brand">
        <a href="/" class="logo">
          <span class="logo__mark" aria-hidden="true">
            <img src="/logo.png" alt="" width="40" height="40">
          </span>
          <span class="logo__name"><b>ThailandBiker</b><span>.club</span></span>
        </a>
        <p class="footer__tagline">Your ultimate riding companion. The directory of places, trips, events, and guides for motorcycle riders in Thailand.</p>
      </div>
      <div class="footer__links">
        <a href="/privacy-policy">Privacy Policy</a>
        <a href="/terms-of-use">Terms of Use</a>
        <a href="/delete-account">Delete Account</a>
        <a href="/support">Support</a>
      </div>
    </div>
    <div class="footer__bottom">
      <span class="footer__bottom-mark">© 2026 ThailandBiker.club</span>
      <span>Ride safe. Wear gear. ATGATT.</span>
    </div>
  </div>
</footer>

<!-- iOS waitlist modal (same Tally form as the homepage) -->
<div class="modal-overlay" id="waitlist-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="modal">
    <div class="modal__header">
      <div>
        <h2 class="modal__title" id="modal-title">Join the iOS waitlist</h2>
        <p class="modal__sub">The Android app is live now. Leave your email and we’ll tell you the moment the iOS version lands.</p>
      </div>
      <button class="modal__close" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="modal__body">
      <iframe src="https://tally.so/embed/pbR8YZ?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1" title="Waitlist form" loading="lazy"></iframe>
    </div>
  </div>
</div>

<script src="/assets/legal.js"></script>
<script>${PAGE_JS}</script>

<!-- Cloudflare Web Analytics -->
<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "57241e47487c4518b58ab0d5c2f9e51f"}'></script>
<!-- End Cloudflare Web Analytics -->
</body>
</html>
`;
}

// Card, extra buttons and the waitlist modal. Chrome (nav, footer, `.btn`,
// eyebrow) comes from `/assets/legal.css`; the modal mirrors `index.html`.
const PAGE_CSS = `
  .share { background: var(--bg); padding: clamp(32px, 6vw, 72px) 0 clamp(48px, 8vw, 96px); }
  .share-card {
    max-width: 640px; margin: 0 auto;
    background: var(--surface); border: 1px solid var(--hairline);
    border-radius: 16px; box-shadow: var(--shadow-md); overflow: hidden;
  }
  .share-card__photo { display: block; width: 100%; height: auto; aspect-ratio: 1200 / 630; object-fit: cover; background: var(--hairline); }
  .share-card__body { padding: clamp(24px, 4vw, 36px); }
  .share-card .page-header__eyebrow { margin-bottom: 14px; }
  .share-card__title {
    font-size: clamp(26px, 4vw, 34px); line-height: 1.15; letter-spacing: -0.02em;
    font-weight: 800; color: var(--dark); margin: 0 0 10px; text-wrap: balance;
  }
  .share-card__meta { display: flex; flex-direction: column; gap: 4px; margin: 0 0 16px; font-size: 14px; font-weight: 600; color: var(--text-muted); }
  .share-card__meta span { display: flex; align-items: baseline; gap: 8px; }
  .share-card__meta span::before { content: ""; flex-shrink: 0; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); transform: translateY(-2px); }
  .share-card__text { margin: 0 0 24px; color: var(--text-soft); font-size: 15.5px; text-wrap: pretty; }
  .share-card__ctas { display: flex; flex-wrap: wrap; gap: 10px; }
  .share-card__hint { margin: 16px 0 0; font-size: 13px; color: var(--text-muted); }
  .btn--lg { height: 46px; padding: 0 20px; font-size: 14.5px; }
  .btn--dark { background: var(--dark); color: #fff; }
  .btn--dark:hover { background: var(--dark-2); transform: translateY(-1px); text-decoration: none; }
  .btn--ghost { background: transparent; color: var(--dark); border: 1px solid var(--hairline-strong); }
  .btn--ghost:hover { background: var(--bg); text-decoration: none; }
  @media (max-width: 560px) { .share-card__ctas .btn { flex: 1 1 100%; } }

  .modal-overlay {
    display: none; position: fixed; inset: 0; z-index: 1000;
    background: rgba(0,0,0,0.55); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    align-items: center; justify-content: center; padding: 20px;
  }
  .modal-overlay.is-open { display: flex; }
  .modal { background: var(--surface); border-radius: 16px; width: 100%; max-width: 640px; box-shadow: var(--shadow-lg); overflow: hidden; }
  .modal__header { padding: 28px 28px 0; position: relative; text-align: center; }
  .modal__title { font-size: 32px; font-weight: 800; color: var(--dark); letter-spacing: -0.02em; margin: 0 0 6px; }
  .modal__sub { font-size: 14.5px; color: var(--text-muted); margin: 0; line-height: 1.5; }
  .modal__close {
    position: absolute; top: 28px; right: 28px; width: 32px; height: 32px;
    border-radius: 8px; border: 1px solid var(--hairline); background: transparent;
    display: grid; place-items: center; color: var(--text-muted);
  }
  .modal__close:hover { background: var(--bg); color: var(--dark); }
  .modal__close svg { width: 16px; height: 16px; }
  .modal__body { padding: 20px 28px 28px; }
  .modal__body iframe { width: 100%; border: none; min-height: 440px; display: block; }
  @media (max-width: 640px) {
    .modal { border-radius: 12px; }
    .modal__header { padding: 22px 20px 0; }
    .modal__body { padding: 16px 20px 20px; }
  }
`;

const PAGE_JS = `
(function () {
  var overlay = document.getElementById('waitlist-overlay');
  var lastFocused = null;
  function open(e) {
    e.preventDefault();
    lastFocused = document.activeElement;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.modal__close').focus();
  }
  function close() {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }
  document.querySelectorAll('[data-waitlist]').forEach(function (el) { el.addEventListener('click', open); });
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('is-open')) close(); });
})();
`;

// ---- helpers ---------------------------------------------------------------

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function firstString(list) {
  return Array.isArray(list) && typeof list[0] === "string" ? list[0] : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function httpsUrl(value) {
  return typeof value === "string" && value.startsWith("https://") ? value : null;
}

function ogImageUrl(photo) {
  if (!photo.startsWith(PLACES_BUCKET_PREFIX)) return photo;
  return `${IMAGEKIT_ENDPOINT}${photo.slice(PLACES_BUCKET_PREFIX.length)}?tr=${OG_IMAGE_TRANSFORM}`;
}

/** Flattens the light markdown used in descriptions and guide bodies to one line of text. */
function plainText(value) {
  if (typeof value !== "string") return "";
  return value
    .split("\n")
    // Headings, tables and rules don't read well in a one-line summary.
    .filter((line) => !/^\s*(#|\||-{3,}|\*{3,})/.test(line))
    .map((line) => {
      const item = /^\s*(>\s*)?([-*+]|\d+\.)\s+/.exec(line);
      const text = line.replace(/^\s*(>\s*)?([-*+]\s+|\d+\.\s+)?/, "").trim();
      // List items become sentences, so they don't run into each other.
      return item && text && !/[.!?:]$/.test(text) ? `${text}.` : text;
    })
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|\*|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, max) {
  if (!text || text.length <= max) return text || "";
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, "") + "…";
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Bangkok",
});

function formatDateRange(start, end) {
  const from = start ? new Date(start) : null;
  if (!from || Number.isNaN(from.getTime())) return null;
  const to = end ? new Date(end) : null;
  if (!to || Number.isNaN(to.getTime()) || DATE_FORMAT.format(from) === DATE_FORMAT.format(to)) {
    return DATE_FORMAT.format(from);
  }
  return DATE_FORMAT.formatRange(from, to);
}
