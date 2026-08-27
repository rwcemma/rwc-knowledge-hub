# BB Webflow — Full Moon Parasite Cleanse page: handoff #2

Supersedes the Cowork-era handoff (`bbwebflowhandoff.md`). Written from a **remote**
Claude Code session that could reach the Webflow and Shopify APIs but had **all**
general outbound HTTPS blocked by egress policy — so it never saw the rendered page.

**Pick this up in a LOCAL Claude Code session with Chrome access** (`claude --chrome`),
which can read the live page and console. That is the one capability every prior
session has lacked, and it is what this blocker now needs.

---

## Live IDs

| Thing | ID |
|---|---|
| Site | `6a7635942dbaea8e6172ec21` (`biohacking-bombshell-estore`) |
| Page | `Home` `/` — `6a7635962dbaea8e6172ec58` (only page) |
| Published at | `https://biohacking-bombshell-estore.webflow.io` (no custom domain) |
| Shopify | myshopify: **`dr-jaban-moore-store.myshopify.com`** (NOT synergized-supplements — see root cause) / primary: `synergizedsupps.com`, Advanced |
| Storefront API | `https://dr-jaban-moore-store.myshopify.com/api/2026-07/graphql.json` |

Site has a **paid Webflow Site Plan** (confirmed by Emma). Workspace is **not**
Enterprise, so page branching is unavailable — edit pages directly.

## Where the code lives (IMPORTANT — read before editing)

| Piece | Location |
|---|---|
| **All JavaScript** | **Site footer custom code** (Project Settings → Custom Code → Footer). `bb-store v13`. |
| **Layout CSS overrides** | **Site head custom code** — `.bb-hero` fold height, `.bb-cta` spacing, `#bb-store` auto-fit grid. Mirrored as `bb-store-head-code.html`. |
| Store markup + CSS | Embed `7c7f9b41-49f9-eda7-a3c5-f289f9bfec5c` — `#bb-store`, cart drawer, modal, all CSS. **No script.** |
| Hero container | Embed `d7a7c63a-ebc1-c926-210b-2c7da0e8115c` — `#bbp` + static `<a>` fallback cards + CSS. **No script.** |
| Hero eyebrow badge | Embed `95c7e548-b7da-2e0f-a368-8d2c7cb9f05a` |
| Education section | Embed `2148c621-673b-0a07-3ec6-1e86f60a7a63` |

### Why the JS is not in an embed

Scripts inside Webflow HTML Embeds behaved unreliably on this site across several
deploys. The final failure: the whole store section published **completely blank** — not
even the synchronous "Loading products…" placeholder — while the CSS from the same embed
applied correctly. Verified by reading the stored embed back byte-for-byte against a
locally `node --check`ed copy: **the stored code was correct and still did not run.**

Markup and CSS in embeds have always worked. So the script moved to site footer custom
code, which is emitted as a raw block before `</body>`, runs after all DOM exists, and
has been reliable.

**Do not move the JavaScript back into an embed.**

Note: the **page-level** freeform code endpoint returns `HTTP 406` on this site for any
content, even 40 bytes — it is not a size limit. **Site-level** footer code works. There
is only one page, so site-level is equivalent here.

### Resilience built into v7

Every earlier version had a single point of failure that took down everything else:

- Every DOM lookup is guarded; a missing element logs and skips instead of throwing.
- `renderGrid()` and `renderHero()` run inside separate `safe()` wrappers, so a failure
  in one cannot prevent the other. (In v6, `grid` being null threw *before* `renderHero()`
  was reached, which is why the hero silently stayed on its fallback.)
- `localStorage` access is wrapped in try/catch (private mode, blocked storage).
- `?bbdebug=1` paints **its own fixed panel** via `document.createElement`, so it does
  not depend on any page element. A blank page can never again mean "no information".

### Hero promo sticker (`.bb-off`)

A magenta circular sticker with a worm graphic sits on each **hero** card, top-right,
rotated ~12deg. It is drawn as inline SVG + CSS, **not** baked into the product images —
so the percentage can change without re-exporting artwork, and it stays crisp at any size.

- Text controlled by `var BADGE = '20%';` in the footer script. Set `BADGE = ''` to remove
  the sticker everywhere.
- Styles live in the hero embed CSS as `#bbp .bb-off`.
- `pointer-events:none`, so it never blocks a click on the card underneath.
- Deliberately **absent** from the static fallback cards: if the store is unreachable those
  link to synergizedsupps.com, which would not honour a BB discount.
- Shop-grid cards do not carry it, only the hero.

**⚠ The discount is not configured in Shopify.** As of this writing there is no 20%
discount on the store. Active codes: `DRJABAN25` (25%), several `PLATINUM*` practitioner
codes (10%), `DRB5` (5%). No automatic discount. The sticker is a marketing claim that
checkout will not honour until someone either creates a 20% discount or changes `BADGE`
to match an existing one. Prices shown on the page are always live from Shopify and are
NOT reduced by the sticker.

### Fetching products — the `handle` filter trap

**`products(query:"handle:para-1-cellcore OR ...")` does NOT work on the Storefront API.**
`handle` is not a supported filter field there (supported: `product_type`, `tag`,
`tag_not`, `title`, `updated_at`, `variants.price`, `vendor`, ...). Shopify **silently
ignores** unknown filters and returns everything, so that query returned the first 20 of
the store's 327 products. Symptom in the debug strip:

```
loaded 20 products
grid rendered 20 cards
hero: no matching products, static fallback kept
```

The shop grid looked fine because add-to-cart and the modal work on any product — it was
quietly selling the wrong 20 items, and the hero correctly found no Para handles.

Note `handle:` **does** work in the **Admin** API, which is what masked this: Admin
queries run from the tooling kept returning exactly the right 4 products.

`bb-store v8` fetches deterministically, with two paths:

1. **Primary** — aliased `product(handle:)` using GraphQL *variables*, so no quoting is
   needed in the query string: `query($h0:String!...){p0:product(handle:$h0){...}}`.
2. **Fallback** — `nodes(ids:)` with hardcoded product ids, if the primary returns
   nothing or errors. Version-stable and immune to filter syntax entirely.

Verified product ids (Admin API):

| Handle | Product id |
|---|---|
| `para-1-cellcore` | `gid://shopify/Product/4573257007201` |
| `para-2-cellcore` | `gid://shopify/Product/4573257039969` |
| `para-3-cellcore` | `gid://shopify/Product/4573257105505` |
| `para-kit` | `gid://shopify/Product/6782540349537` |

Results are then filtered to `HANDLES` and sorted into `HANDLES` order, so even a
too-broad response can never render the wrong products again. The debug strip reports
which path was used and exactly which handles resolved.

### Card contract

All cards are rendered by the footer script. Cards carry `data-bb-handle="<handle>"`, and
the add button carries `data-bb-add="1"` — always with a value, never bare. One delegated
`click` listener on `document` routes everything: cart toggle/close, modal close,
`[data-bb-thumb]` image swap, `.rm` line removal, `[data-bb-add]` add-to-cart, and
otherwise opening the modal for the clicked card. Escape closes modal and cart.

To add products: add an empty container with an `id`, render into it from the footer
script, and add the handle to `HANDLES`. Never write `data-bb-*` into static embed markup.

## THE BLOCKER — ROOT CAUSE FOUND

**The embed was calling a myshopify domain that does not exist.**

| | |
|---|---|
| Embed called | `synergized-supplements.myshopify.com` |
| Actual myshopify domain | **`dr-jaban-moore-store.myshopify.com`** |

Verified via Admin API `shop { myshopifyDomain }`. The store was created as Dr. Jaban
Moore's store and later rebranded to Synergized Supplements; the `.myshopify.com`
subdomain is permanent and does **not** follow a rename, so the plausible-looking
guess in the first handoff was simply wrong. DNS failed, `fetch` threw, and because
the original embed had no `.catch()` the whole thing died silently — which is why
three sessions chased tokens and sales channels instead.

Fixed in `bb-store v3`: correct domain, and API version `2024-10` → `2026-07`
(2024-10 retired 2025-10-16; Shopify falls forward to the oldest accessible version,
so this was not the blocker, but it was fragile).

**Confirmed healthy via Admin API** — all four handles are `ACTIVE` and published to
Online Store, Buy Button, Headless, Synergized Supplements Headless, and Biohacking
Bombshell. The token originated in the Buy Button embed, and Buy Button carries all
four, so channel visibility should not be a problem.

### How to diagnose this embed (bb-store v2+)

The embed cannot fail silently any more. Read the shop section on load:

| What you see | What it means |
|---|---|
| **Completely blank** | The script never executed. Not a Shopify problem. |
| `Loading products…` and it stays | The fetch never settled. |
| *"fetch() threw…"* | Never reached Shopify — bad hostname, CORS, CSP, extension, offline. |
| *"HTTP 401/403…"* | Token wrong, revoked, or not permitted. |
| *"GraphQL errors…"* | Reached Shopify, query rejected. |
| *"No products found… token is VALID"* | Token fine; handles not visible to its channel. |
| Product cards | Working. |

Append **`?bbdebug=1`** for raw HTTP status, response body, and GraphQL errors on the
page. Without it, visitors see a neutral message.

### Ruled out along the way — do not re-investigate

- **Duplicate store embeds.** Two full copies (`7c7f9b41` real token, `9daa5c04`
  placeholder) shared `#bb-store` / `#bb-cart-toggle` / `#bb-cart-drawer` ids, so the
  failing copy wiped the working copy's grid. `9daa5c04` deleted. Real bug, not the cause.
- **Wrong product query form.** Both already used `products(first:20, query:…)`.
- **Free-plan custom-code restriction.** Site has a paid Site Plan.
- **Embed character limit.** It is 50,000, not 10,000 — nothing was truncated.
- **Page branching mismatch.** Not Enterprise; `Home` is `isBranch: false`.
- **Edits/publish not landing.** Publish pipeline verified healthy throughout.
- **Stray custom code.** Site and page head/footer blocks empty; zero registered scripts.
- **Token / sales channel.** Products published to every relevant publication.

### Also fixed in v3

- Grid `repeat(3,1fr)` → `repeat(4,1fr)` + 2-up tablet breakpoint, so `para-kit` no
  longer wraps onto its own row.
- Floating cart toggle `top:18px` → `bottom:18px`, clearing the nav "Book a Call" button.
- `.catch()` on every fetch.

## Open requirements (not yet built)

- **"Meet Your Practitioner"** (`d110f857-…-68c0c3ccf482`) is hidden, not deleted.
  Restore with a BB practitioner or remove for good.

## Architecture — one script renders every card

There is exactly **one** `<script>` on the page: the shop embed, `bb-store v6`. It owns
the product fetch, the cart, the drawer, the modal, **and the rendering of every product
card on the page** — including the hero row in a different embed.

### Why the hero cards are rendered by JS, not written as static markup

This bit us twice. Cards written as static markup in a Webflow embed did not respond to
clicks, while the JS-generated shop cards worked — same document, same delegated
listener, same data. The only difference was where the markup came from, which points at
Webflow normalising the static embed HTML on publish (most likely dropping the valueless
`data-bb-add` attribute; the published DOM could not be inspected from the session to
confirm).

Rather than keep guessing, the class of bug was removed: **the hero row is now an empty
container that the script fills**, so every card has identical JS-generated markup — the
kind that demonstrably works.

- Hero embed = CSS + `<div id="bbp">` containing **static `<a>` fallback cards**.
- `renderHero()` replaces `#bbp`'s contents once products load.
- If the store is unreachable, `report()` leaves the static links in place, so the hero
  still shows products and links to Shopify. Progressive enhancement.

**Rules for adding products anywhere on the page:**
1. Add an empty container with an `id` (ids survive publish; bare `data-*` may not).
2. Render the cards from `bb-store` and add the handle to `HANDLES`.
3. Never write `data-bb-*` attributes into static Webflow embed markup.
4. Never add a second `<script>`, cart drawer, or modal.

Card contract (as generated by JS): `data-bb-handle="<handle>"` on the card,
`data-bb-add="1"` on the button — **always with a value, never bare**.

Click routing, one delegated listener on `document`: `[data-bb-add]` adds to cart ·
`.rm` removes a cart line · `[data-bb-thumb]` swaps the modal image · anything else
inside `[data-bb-handle]` opens the modal · clicks inside the modal are otherwise inert ·
Escape closes modal and cart.

### Product modal

Image with thumbnail switcher, title, price, the product's full `descriptionHtml`, and
Add to Cart (adds, closes the modal, opens the drawer).

**Descriptions render in full, on purpose.** CellCore copy carries California Prop 65
warnings and FDA-style `*` disclaimers. Do not excerpt, truncate or summarise them —
dropping a Prop 65 warning off a product listing is a compliance problem, not a design
choice. If a shorter blurb is wanted, add a metafield in Shopify instead of cutting this.

### Debugging

`?bbdebug=1` prints the raw HTTP status, response body and GraphQL errors on the page,
and logs to the console: products loaded, whether the hero rendered, each `addToCart`,
and specifically whether an add click found its `[data-bb-handle]` ancestor and a loaded
product. That last pair is what to check first if a button ever goes inert again.

## Hero layout decisions

- **Hero fold tightened** via site head CSS: `.bb-hero` forced to `min-height:0; height:auto`
  with 60px vertical padding (46px under 991px). The Webflow class had its own height; the
  override lives in head custom code so it stays editable through the Data API rather than
  needing the Designer.
- **"Shop the Full Moon Cleanse" button hidden** (`d110f857-…-68c0c3ccf471`, visibility
  false — not deleted, so it is reversible). Only "Learn Why Parasites Matter" remains,
  pushed down with `.bb-cta{margin-top:46px}`.
- **Para 4 added** to the hero stack and the featured grid. Hero is now 4 cards, sized down
  to 164px wide / 124px images so four fit without regrowing the fold.
- Featured grid uses `repeat(auto-fit,minmax(200px,1fr))` so it never leaves one card
  stranded on its own row regardless of product count.

### Product reference

| Handle | Product id | Price |
|---|---|---|
| `para-1-cellcore` | `gid://shopify/Product/4573257007201` | $46.95 |
| `para-2-cellcore` | `gid://shopify/Product/4573257039969` | $53.95 |
| `para-3-cellcore` | `gid://shopify/Product/4573257105505` | $53.95 |
| `para-4` | `gid://shopify/Product/6750255612001` | $62.95 |
| `para-kit` | `gid://shopify/Product/6782540349537` | — |

## Two shop sections

The shop area now has two grids, both fed by the same footer script and sharing one cart:

| Container | What it holds |
|---|---|
| `#bb-store` | **Featured Full Moon Cleanse** — Para 1-4 + the Kit, from `HANDLES`. |
| `#bb-all` | **"Shop the rest of the store"** — the rest of the catalogue, with search / brand filter / sort. |

- `#bb-all` deliberately **excludes** anything in `HANDLES`, so featured products are not
  duplicated below.
- Paging uses Storefront cursors (`products(first:50, after:$after)`); the `#bb-all-more`
  button loads the next page and hides itself when `hasNextPage` is false.
- Catalogue cards are fetched with **light fields only** (no `descriptionHtml`, no extra
  images). When a modal opens for one, `openModalByHandle()` fetches that single product's
  description on demand. This keeps paging ~300 products cheap while the modal still shows
  full copy. Featured products already carry descriptions, so they never re-fetch.
- Both grids use the same `.bbp` card markup and the same delegated click handling, so
  add-to-cart and the modal work identically in both.
- The promo sticker stays hero-only — catalogue cards do not carry it.

## Brand separation from Dr. Jaban

This Shopify store is shared with Dr. Jaban, and **Shopify defaults a product's `vendor`
to the shop name** when no brand is set. The shop was created as "Dr Jaban Moore - Store",
so 69 of 384 products carry `vendor: "Dr Jaban Moore - Store"` — and only about half of
those are actually Jaban-branded. The rest are generic stock that merely inherited the
default: resistance bands, kinesiology tape, drainage/gut bundles, wellness kits, gift card.

So two separate mechanisms, deliberately not one:

```js
var HIDE_WORDS   = ['jaban'];                                  // drop the product entirely
var VENDOR_ALIAS = { 'dr jaban moore - store': 'Other' };       // just relabel the brand
```

- `isHidden(p)` — matches `jaban` in **title or handle**, case-insensitive, and drops the
  product from the catalogue. Catches "Dr. Jaban's Full Moon Cleanse", the Month 1/2/3
  programs, the notebook, water bottle, courses, and the Jaban-handled gift card.
- `vendorOf(p)` — maps that default vendor to **"Other"**. Every place vendor is used
  (dropdown, brand filter, search, brand sort) goes through it, so `Dr Jaban Moore - Store`
  can never appear as a brand option while the generic products stay sellable.

Filtering by *vendor* instead would have deleted the bands, tape and bundles too. If that
is actually wanted, add `'dr jaban moore - store'` to a vendor-level hide list rather than
widening `HIDE_WORDS`.

`HIDE_WORDS` is a plain substring list, so more terms can be added without touching logic.

## Catalogue search, brand filter and sort

The toolbar above `#bb-all` binds to these ids (all in the store embed markup):

| Id | Control |
|---|---|
| `#bb-q` | Search box — matches product **title or vendor**, case-insensitive substring |
| `#bb-vendor` | Brand dropdown, built at runtime from the loaded products with per-brand counts |
| `#bb-sort` | Featured / Name A-Z / Name Z-A / Price low-high / Price high-low / Brand A-Z |
| `#bb-count` | "Showing 48 of 312 products" line |
| `#bb-all-more` | Reveals the next 48 **from memory** — no longer a network call |

**Why the whole catalogue loads up front.** `loadAllCatalog()` pages through every product
(50 per request, ~7 requests) with LIGHT fields only, then all filtering and sorting happens
in memory. Typing is instant with no debounce and no request per keystroke. The payload is
small because descriptions and extra images are excluded — those are still fetched per
product when a modal opens, via `openModalByHandle()`.

Rendering is chunked at `CHUNK = 48` so 300+ cards never hit the DOM at once. Changing a
filter resets to the first chunk.

The brand list is derived from the products actually returned, so it can never offer a brand
with no results. `vendor` had to be added to `ALL_PF` for this.

## Outstanding

- **"Made in Webflow" badge** — cannot be removed through the Data API. It needs a paid
  Site Plan (present) plus toggling Webflow branding off in **Project Settings → General**,
  then republishing. Hiding it with CSS is possible but may breach Webflow's terms, so it
  was not done.
- ~~Full store below the fold~~ — **built.** See "Two shop sections" below.
- **20% discount** — Emma is creating it in Shopify herself. The badge is live in the
  meantime.
- SEO/meta still empty; "Meet Your Practitioner" still hidden.

## Decisions already made

- **Checkout:** ship now on the **shared Synergized checkout**, accepting Dr. Jaban
  branding on the final pay step. Separate BB store deferred. Shopify blocks its checkout
  from being iframed, so the pay step always leaves the BB page — that is not fixable.
- **Store blocks:** exactly one, `7c7f9b41`.

## Working notes for whoever picks this up

- Webflow **element/style/component** tools ride a bridge to an **open Designer session**.
  If it's disconnected, they fail with a launch link. Keep the Designer tab foregrounded and
  active; it drops when backgrounded or idle. Page metadata, CMS, assets, scripts, and
  publish all go through the REST Data API and work without it.
- The Storefront access token is **publishable by design** — it already ships in the page
  HTML for anyone to read. It's redacted in this repo for git-history hygiene, not secrecy.

---

## v14 — section 1/2 restructure, sale pricing, copy pass (2026-08-25)

### The overlap fix
Section 1 and section 2 were both showing the same Para products as shoppable
cards, which read as duplicated. They now do different jobs:

| | Section 1 (`.bb-hero`) | Section 2 (`#bb-shop`) |
|---|---|---|
| Content | collage of Para 1-4 + BioToxin Binder | the same 6 products as cards |
| Shoppable | **no** — images + names only | yes, add-to-cart + modal |
| Discount sticker | one, on the panel corner | one per card |
| Buttons | *Shop the Sale* → `#bb-shop`, *Learn Why Parasites Matter* | — |

The collage container is `#bbp-strip` (was `#bbp`). Nothing inside it carries a
`data-bb-handle`, so the global click delegate ignores it entirely.

### Files
| Piece | Location | Mirror |
|---|---|---|
| All JavaScript | site **footer** custom code (`bb-store v14`) | `docs/bb-store-footer-code.html` |
| Layout CSS overrides | site **head** custom code | `docs/bb-store-head-code.html` |
| Shop markup + CSS | embed `7c7f9b41…` (`bb-store markup v14`) | `docs/bb-store-embed-markup.html` |
| Hero collage | embed `d7a7c63a…` (`hero collage v7`) | `docs/bb-hero-collage.html` |
| Education section | embed `2148c621…` | `docs/bb-education-embed.html` |
| Hero eyebrow | embed `95c7e548…` | — |

`docs/bb-hero-product-row.html` was the pre-v14 shoppable hero row; it is gone.

### The sale (v15)
Four constants at the top of the footer script are the single source of truth,
and they **must** match the Shopify discount exactly:

```js
var DISCOUNT   = 'PARASITE';
var SALE_PCT   = 0.20;
var SALE_START = '2026-08-31T20:45:45Z';
var SALE_END   = '2026-09-08T03:59:59Z';
```

`HANDLES` is the product list, and it mirrors the eight products on the Shopify
discount: Para 1-4, BioToxin Binder, Cellcore Full Moon Para Kit, Drainage
Jumpstart Duo, Parasite Cleanse Power Duo.

**The page only displays prices; Shopify is what charges the customer.** So the
script is deliberately date-aware, via `saleState()`:

| State | Prices | Sticker | Promo bar | Callouts |
|---|---|---|---|---|
| `before` | full price | shown | "Opens August 31" | code + open date |
| `live` | struck through + red | shown | "Use code PARASITE" | code + end date |
| `ended` | full price | hidden | hidden | hidden |

That is what stops the page advertising a struck-through price for a code the
checkout would reject. If the Shopify dates move, move `SALE_START`/`SALE_END`
with them — nothing else needs touching.

### Where the code appears
- `#bb-promo` — fixed bar across the top of **every page**, injected by the
  script. It measures its own height and offsets both `body` padding and the
  sticky `.bb-hdr` top, re-measured on resize.
- `#bb-collage-code` — chip on the hero collage panel (hero embed).
- `.bb-code` — chip on every sale card and in the product modal (drawn by `codeHtml()`).
- `#bb-cart-code` — status line in the cart drawer. Turns green once Shopify
  reports the code as `applicable` on the live cart.

The shopper never has to type it: `cartCreate` attaches `discountCodes`,
`cartDiscountCodesUpdate` re-attaches on every load (a cart begun before the
sale opened has no code), and `checkoutHref()` also appends `?discount=PARASITE`
to the checkout URL as a belt-and-braces fallback.

### Cross-link from the education section
"Drainage Duo" in the *Open drainage pathways first* card opens the **Drainage
Jumpstart Duo** modal. It is bound by **id** (`#bb-drainage-link`), not a
`data-*` attribute, because Webflow can normalise bare `data-*` attributes in
static embeds on publish. `href="#bb-shop"` is the fallback if the catalogue
has not loaded yet.

### Known caveat
The Drainage *Starter Bundle* (a different product, not linked from the page)
still has the literal vendor `Dr Jaban Moore - Store`, so `VENDOR_ALIAS`
relabels it to "Other" in the brand filter. Setting a real vendor on that
product in Shopify is the proper fix.

### Still open
- "Made in Webflow" badge — Project Settings → General, Emma's toggle.
- Page SEO title / description / Open Graph are all empty.
- `.bb-intro` ("Meet Your Practitioner", `#bb-about`) is still hidden. Its
  eyebrow is a Block, not a text element, so the Data API cannot set its text —
  "Shop the Protocols" → "Parasite Cleanse Favorites" needs the Designer.

---

## v16 — catalogue exclusions (2026-08-25)

`isHidden()` in the footer script decides what never appears in
"Shop the rest of the store". Two rules, both in `isHidden`:

**1. Price is $0.** Placeholder SKUs, welcome-gift line items and client-only
lab kits are all priced at zero, and a $0 add-to-cart button is worse than
useless. Currently removes: Welcome Gift, Welcome Gift Black Friday, Starter Kit
(the bare `2251434` one), Mito Restore (`mito-atp`), Relyte sticks / Aegis Calm
strips / Redmond's toothpaste / Dr. Jess Consulting Welcome Gift, **Mosiac OAT
Test Kit** and **HTMA**. The last two were not on the removal list but are $0 —
if they should sell publicly, give them a real price in Shopify and they come
back automatically.

**2. `HIDE_WORDS` substring match** on title + handle, lowercased:
`jaban`, `resistance band`, `kinesiology`, `welcome gift`, `chasing health`,
`parasites 101`.

⚠️ **Handles are hyphenated, so any phrase containing a space only ever matches
the TITLE.** This is load bearing, not incidental: `chasing health` must not
match the handle `chasing-health-monthly-subscription-...`, which belongs to the
still-for-sale **Beginner Gallbladder Flush** ($203.85). Keep multi-word
phrases multi-word.

### Deliberately NOT hidden
- **Parasite Cleanse Starter Kit** ($123.90) — "starter kit" was on the removal
  list, but adding it as a hide word would take this real, on-topic parasite
  product with it. The $0 "Starter Kit" placeholder is removed by rule 1.
- Dr. Jaban's various Starter Kits are already removed by `jaban`.

Sale products (`HANDLES`) bypass `isHidden` entirely, so no rule here can
swallow one of them.

### Book a Call
Both "Book a Call" links — header (`...f467`) and footer (`...f572`) — point at
https://www.biohackingbombshell.com/breakthrough-sessions-j-page-165783

Each also carried a leftover custom attribute `href="#"` from the original
build. A custom `href` attribute can win over the Designer link setting in
published output, so both were removed. If a link ever looks set correctly in
the Designer but still goes nowhere on the live site, check its custom
attributes first.

---

## v17 — hidden product landing pages (2026-08-26)

Unlinked pages the quiz routes people to. Nothing on the site links to them; the
only way in is the URL.

| Page | Slug | Featured product | Webflow page id |
|---|---|---|---|
| Parasite Cleanse Power Duo | `/parasite-power-duo` | `parasite-cleanse-power-duo` | `6a8ef755097ed2415857b9f0` |

### How to add the next one
1. Duplicate the Home page in Webflow (`create_page` with `duplicateOf`). The
   duplicate keeps every element id — only the `component` half of each id
   changes to the new page id — so all the ids in this doc still apply.
2. Swap four embeds on the duplicate:
   - hero eyebrow `95c7e548…` → the page's kicker line
   - collage `d7a7c63a…` → the feature block (`docs/bb-feature-*.html`)
   - education `2148c621…` → the page's teaching content (`docs/bb-learn-*.html`)
   - store `7c7f9b41…` → `docs/bb-store-embed-featurepage.html` (same as the
     home embed minus `#bb-store` and the embed's own catalogue heading)
3. Set H1 `…f46d`, subhead `…f46f`, buttons `…f471` / `…f473`, shop heading
   `…f488` / `…f48a`.
4. Add one line to `FEATURE` in the footer script mapping the slug to the
   Shopify handle. That is the only script change needed.

`ensureFeature()` renders `#bb-feature-buy` from that map. Products already in
`HANDLES` are reused from the existing fetch; anything else is fetched on demand.
The rendered card carries `data-bb-handle`, so add-to-cart and open-the-modal are
handled by the existing click delegate with no new wiring.

### In-copy product links
`COPY_LINKS` in the click delegate maps an element id to a product handle, so
teaching copy can link a product name straight to its modal:
`#bb-drainage-link` → Drainage Jumpstart Duo, `#bb-bowel-link` → Bowel Mover.
Bound by **id**, never a `data-*` attribute, because Webflow can normalise bare
`data-*` attributes in static embeds on publish. Each link keeps `href="#bb-shop"`
as a fallback for the moment before the catalogue loads.

### Two URLs still needed
The teaching section's "free drainage clinic" and "free parasite masterclass"
CTAs currently point at `https://www.biohackingbombshell.com/` as a safe interim
so nothing is a dead link. Swap in the real deep links in embed `2148c621…`.

### Not hidden from search engines
Webflow's noindex toggle is not exposed through the Data API, and page-level
custom code returns HTTP 406 on this site. The pages are unlinked, which keeps
them out of the nav, but a crawler that finds the URL can index them. To close
that off properly, add them to Project Settings → SEO → robots.txt:

```
User-agent: *
Disallow: /parasite-power-duo
```

---

## v18 — sale switched off (2026-08-26)

No discount is being offered. One switch controls all of it:

```js
var SALE_ON = false;   // footer script, top of the file
```

With it false: no promo bar, no % stickers, no code chips, no struck-through
prices, no discount code attached to the cart, and a plain checkout URL. The
static 20% sticker and code chip were removed from the hero collage embed, the
cart-drawer code line was removed from both store embeds, and the home page
eyebrow now reads "Full Moon Parasite Cleanse" instead of "Parasite Cleanse
Product Sale".

**One thing worth knowing:** the on-load `cartDiscountCodesUpdate` call now sends
an EMPTY code list when `SALE_ON` is false. That actively STRIPS a leftover code
from a returning shopper's saved cart, so a cart started during a previous sale
cannot quietly discount an order that is no longer discounted.

### Turning a sale back on
1. Set `SALE_ON = true` and fill in `DISCOUNT`, `SALE_PCT`, `SALE_START`,
   `SALE_END`, `BADGE` to match the Shopify discount exactly.
2. Re-add a `.bb-off` sticker to the hero collage embed if you want one there.
All the CSS for stickers, sale prices, code chips and the cart status line is
still in the embeds, dormant.

**Still in Shopify:** the `parasite` discount code (20%, scheduled Aug 31 - Sep 7)
has NOT been deleted, only un-advertised. Delete or disable it in Shopify if it
should not be redeemable by anyone who already has the code.

---

## v19 — duo page: product features + FAQ accordion (2026-08-26)

Embed `2148c621…` on the duo page now holds **two** sections:

- **`#bb-learn`** (blue, unchanged background) — the header, then one feature
  block per bottle: product shot on a white rounded panel beside its copy. Para 3
  is image-left; BioToxin Binder uses `.bb-ft.flip` for image-right. Both stack
  image-first under 860px.
- **`#bb-faq`** (light `#fdf7fa`) — four collapsible answers: *Why is it a duo? /
  What is the protocol? / What to do before you start / What if I'm sensitive?*
  The "why it's a duo" band, the protocol card, the drainage card and the
  sensitivity callout all moved in here.

**The accordion uses native `<details>`/`<summary>` — no JavaScript.** Given how
much trouble embed-hosted scripts caused on this site, that matters: the FAQ
cannot break even if the storefront script fails to load. The chevron is a CSS
border square rotated 45° that flips to -135° on `[open]`; the default disclosure
triangle is suppressed with `list-style:none` plus
`summary::-webkit-details-marker{display:none}`.

The hero's "Why I Recommend This" button still targets `#bb-learn`, so it lands
on the feature section. The FAQ's closing CTA targets `#bb-feature` to send
people back up to the buy card.

---

## v20 — sale scoped to the home page (2026-08-26)

The sale is back on, but it advertises on the **home page only**. Two flags in
the footer script, and they answer different questions on purpose:

```js
var SALE_ENABLED = true;      // is a discount actually running in Shopify?
var SALE_PAGES   = ['/'];     // which paths ADVERTISE it?
```

which resolve to:

| | Drives | Home `/` | `/parasite-power-duo` |
|---|---|---|---|
| `WINDOW` | the **cart** and the checkout URL | `before` | `before` |
| `STATE` | every **pixel** | `before` | `off` |

So the home page carries the promo bar, the 20% stickers, the code chips, the
sale pricing and the cart status line. The product landing page shows none of
it and prints full prices.

**Why the split matters.** The discount code is attached to the cart and the
checkout URL from `SALE_ENABLED`, *not* from the page. If it followed the page,
the on-load `cartDiscountCodesUpdate` would strip the code every time someone
visited the duo page and re-attach it on the home page — the discount would
flip-flop with navigation, and a shopper who landed from the quiz would be
charged more than one who came via the home page for the same product. The
Power Duo is one of the eight discounted products, so it gets the discount
either way. The page just does not shout about it.

### Adding another page to the sale
Add its path to `SALE_PAGES`. Nothing else. The promo bar is injected by the
script, so it needs no per-page markup; the collage chip and cart line are
markup that already hides itself when the page is not in the list.

### Current dates
Shopify has `parasite` **SCHEDULED**, Aug 31 3:45pm CT → Sep 7 11:00pm CT, so
today the home page reads "Opens August 31 · Code PARASITE" and prices stay at
full. It flips to struck-through pricing and "Ends September 7" on its own when
the window opens, and hides itself after it closes. No action needed on either
date.

---

## v21 — cart quantity stepper (2026-08-26)

Each cart line now has a **&minus; / count / +** control alongside Remove, backed by
the Storefront `cartLinesUpdate` mutation. Dropping to 0 removes the line.

Two details that matter:

- **`data-qty` on each button carries the TARGET quantity**, not the current one.
  The handler never reads a number back out of the DOM, so it cannot act on a
  stale value after a re-render.
- **`cartBusy` serialises cart mutations.** Without it, tapping + three times
  quickly fires three concurrent updates that each computed their target from
  the same starting quantity — last one to land wins, and the count ends up
  wrong. While a mutation is in flight the drawer gets `.busy`
  (`opacity:.55; pointer-events:none`), which is both the lock and the feedback.

Shopify caps the quantity at available stock and returns the corrected cart, so
the drawer re-renders to the real number rather than the one requested.

**The stepper CSS is injected by the script, not added to the store embeds.**
There are two copies of that embed (home + each product landing page) and they
would drift; injecting keeps one source.

---

## v22 — the Full Moon Para Kit landing page (2026-08-27)

Second hidden product page, same layout and design as `/parasite-power-duo`.
Nothing on the site links to it; the quiz is the only way in.

| Page | Slug | Featured product | Webflow page id |
|---|---|---|---|
| Parasite Cleanse Power Duo | `/parasite-power-duo` | `parasite-cleanse-power-duo` | `6a8ef755097ed2415857b9f0` |
| Full Moon Para Kit | `/full-moon-para-kit` | `para-kit` ($234.95) | `6a905bd4a1f642eb3652c1db` |

Built to the recipe in v17: duplicated the Home page, swapped the four embeds,
set the H1 / subhead / buttons / shop heading, and added one line to `FEATURE`
in the footer script. Two things the recipe does not spell out and that bit here:

- **The duplicate inherits the Home page's leftover `href` attribute** on the
  solid hero button (`…f471`, `href="#bb-shop"`). A custom attribute overrides
  the Designer link setting on publish, so it has to be removed with
  `remove_attribute` after `set_link`. Check `get_attributes` on both hero
  buttons on every new page.
- **The eyebrow embed on the Home page says "Parasite Cleanse Product Sale."**
  On a landing page it has to be reset to "Your Recommended Protocol", otherwise
  the page advertises a sale it deliberately stays quiet about.

### What is different from the duo page
The kit is **four** products, not two, so the blue `#bb-learn` section carries
four alternating `.bb-ft` / `.bb-ft.flip` blocks — Para 1, Para 2, Para 3,
BioToxin Binder — instead of two. Everything else (CSS, FAQ accordion markup,
`#bb-bowel-link` / `#bb-drainage-link` ids, closing CTA) is identical.

Source copy: the Tier 3 "Full Spectrum Approach Recommended" quiz-result email.
Unlike the Power Duo there was **no product/copy contradiction to resolve** —
the Shopify description's ingredient list (mimosa pudica, black walnut hull,
clove, holy basil, Carbon Technology) lines up with what the email describes.

The FAQ answers carry the Tier 3 protocol as written: 30 days on, a week off,
**most cases at this tier need two rounds**; Para 1/2/3 on an empty stomach
20–30 min before food or 2 hours after; binder at breakfast and dinner, 30 min
away from Para 1; follow the dosing chart insert that ships in the box. The
"what if I'm sensitive" answer routes down to the Starter Duo or Power Duo with
an explicit instruction to transition into the full kit within a couple of
months — starting smaller is fine, staying there is not.

### Drainage prep is stated as non-optional here
On the duo page the two-week drainage prep is strongly recommended. At this tier
the email calls it non-negotiable, and the page says so: three anti-parasitics
running at once mobilises a lot, and without open pathways it recirculates.

### New files
- `docs/bb-feature-full-moon-para-kit.html` — feature block ("What's in the kit")
- `docs/bb-learn-full-moon-para-kit.html` — blue four-product section + FAQ

### Script change
One line, plus the version string:

```js
  var FEATURE = {
    '/parasite-power-duo': 'parasite-cleanse-power-duo',
    '/full-moon-para-kit': 'para-kit'
  };
```

`para-kit` is already in `HANDLES`, so `ensureFeature()` reuses the product from
the sale fetch rather than issuing a second request.

### The footer script cannot be read back
`data_scripts_tool` exposes `set_site_freeform_code` but **no matching getter**,
and the published site is not reachable from this environment. Every footer
upload is therefore write-only: the mirror in `docs/bb-store-footer-code.html` is
the only diffable copy, so it must be updated *before* the upload, never after.
Run `node --check` on it (minus the `<script>` wrapper) each time.

### Still open
- **robots.txt.** Both hidden pages are unlinked but indexable. Project Settings
  → SEO → robots.txt:
  ```
  User-agent: *
  Disallow: /parasite-power-duo
  Disallow: /full-moon-para-kit
  ```
- **Two URLs.** The free drainage clinic and the free parasite masterclass CTAs
  both point at `https://www.biohackingbombshell.com/` as a safe interim.
- **Remaining pages.** Starter Duo (no such Shopify product exists yet — it needs
  creating as a bundle, or the page features Para 1 + BioToxin Binder as two
  items) and the Drainage starter kit.
