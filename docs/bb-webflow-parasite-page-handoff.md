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

---

## v23 — the Drainage Jumpstart Duo page, and no more script edits per page (2026-08-27)

Third hidden product page, and the last one that will need a footer-script change.

| Page | Slug | Featured product | Webflow page id |
|---|---|---|---|
| Parasite Cleanse Power Duo | `/parasite-power-duo` | `parasite-cleanse-power-duo` ($188.85) | `6a8ef755097ed2415857b9f0` |
| Full Moon Para Kit | `/full-moon-para-kit` | `para-kit` ($234.95) | `6a905bd4a1f642eb3652c1db` |
| Drainage Jumpstart Duo | `/drainage-duo` | `drainage-jumpstart-duo` ($141.90) | `6a906230259f8b264cee8582` |

### The page names its own product now
Each feature embed carries a hidden marker naming its Shopify handle:

```html
<span id="bb-handle-drainage-jumpstart-duo" hidden></span>
```

`featuredHandle()` reads `document.querySelector('[id^="bb-handle-"]')` first and
falls back to the `FEATURE` slug map only if no marker is present. An **element
id** is used rather than a `data-*` attribute for the same reason as
`#bb-bowel-link`: Webflow can normalise bare `data-*` attributes in a static
embed on publish, but it leaves ids alone.

**So building page four is now a pure copy job** — duplicate the Home page, swap
the four embeds, set the H1 / subhead / buttons, put the right handle in the
marker. No footer upload, no `FEATURE` entry, no publish-the-whole-script risk.
The map is kept only as the fallback for the two pages built before the marker.

### Copy source and the FDA disclaimer
Copy came from the CellCore product description Emma supplied. Because the blue
section restates CellCore **structure/function claims** (the ones carrying `*`),
the section ends with the disclaimer those claims legally travel with:

> \* These statements have not been evaluated by the Food and Drug
> Administration. This product is not intended to diagnose, treat, cure or
> prevent any disease.

Styled by `#bb-learn .disc`, which exists only in this page's embed. Any future
page that restates a manufacturer's `*` claims needs the same footnote.

### Where this page deliberately differs
- **No `#bb-drainage-link`.** On the parasite pages that link routes people to
  the Drainage Duo. Here the Drainage Duo *is* the page, so only
  `#bb-bowel-link` (Bowel Mover) appears.
- **FAQ three is "How do I know my drainage is actually open?"** rather than
  "What to do before you start" — on a drainage page, this *is* the before.
  It gives four concrete checkpoints so a reader can self-assess.
- **The protocol answer stays at the level Emma gave.** Two weeks before a
  cleanse, keep it running through, binder 30 minutes clear of food and other
  supplements, follow each bottle's own label. No invented per-bottle dosing —
  if Emma has specific numbers for this duo, they drop into that `<ul>`.

### New files
- `docs/bb-feature-drainage-duo.html` — feature block, carries the handle marker
- `docs/bb-learn-drainage-duo.html` — blue two-product section + FAQ + disclaimer

### Shopify: this product has one image, and it looks wrong
`drainage-jumpstart-duo` has a single media item, `UvaUrsi_4.png`. The feature
card and the shop grid both pull `featuredImage` straight from Shopify, so
whatever that file is, it is what shows. Worth replacing with a photo of the two
bottles in Shopify — nothing in this repo can fix it.

### Still open
- **robots.txt** — all three pages are unlinked but indexable:
  ```
  User-agent: *
  Disallow: /parasite-power-duo
  Disallow: /full-moon-para-kit
  Disallow: /drainage-duo
  ```
- **Two URLs** — free drainage clinic and free parasite masterclass still point
  at `https://www.biohackingbombshell.com/`.
- **Page four, Starter Duo** — no such Shopify product exists. It needs creating
  as a bundle first, or the page features Para 1 + BioToxin Binder as two items.

---

## v24 — the Parasite Starter Duo page (2026-08-27)

Fourth and final hidden product page. **Built with no footer-script change** —
the first one to run purely on the `bb-handle-` marker introduced in v23.

| Page | Slug | Featured product | Webflow page id |
|---|---|---|---|
| Parasite Cleanse Power Duo | `/parasite-power-duo` | `parasite-cleanse-power-duo` ($130.90) | `6a8ef755097ed2415857b9f0` |
| Full Moon Para Kit | `/full-moon-para-kit` | `para-kit` ($234.95) | `6a905bd4a1f642eb3652c1db` |
| Drainage Jumpstart Duo | `/drainage-duo` | `drainage-jumpstart-duo` ($141.90) | `6a906230259f8b264cee8582` |
| Parasite Starter Duo | `/parasite-starter-duo` | `parasite-cleanse-starter-kit` ($123.90) | `6a90648071b928216fcc048c` |

### Correction: the product exists, under a different name
v17 recorded that no "Parasite Starter Duo" product existed in Shopify. That was
wrong. It is listed as **"Parasite Cleanse Starter Kit"**, handle
`parasite-cleanse-starter-kit`, and the arithmetic confirms it is the same two
bottles: Para 1 ($46.95) + BioToxin Binder ($76.95) = **$123.90** exactly, and
the Shopify description covers only those two products.

The buy card renders the Shopify title, so it reads **"Parasite Cleanse Starter
Kit"** while the page headline says "Parasite Starter Duo". The feature panel
names the discrepancy in a bullet so nobody thinks they landed on the wrong
product. Renaming the Shopify product would remove the mismatch — Emma's call,
since the name may be doing work elsewhere.

This is also the first featured product **outside `HANDLES`**, which exercises
the on-demand branch of `ensureFeature()`: not in the sale fetch, so it issues
its own `product(handle:)` query. It works, and it means a landing page can
feature anything in the catalogue.

Note it is *not* caught by `isHidden()` — `HIDE_WORDS` deliberately omits
`'starter kit'` precisely to protect this product. Do not add that phrase.

### Copy source and the through-line
The Sensitivity Override email. The whole page is written against one risk: that
a reader routed here reads "gentlest option" as "lesser option", doesn't buy, and
comes back later to something that will hurt them.

So the second FAQ is **"Am I missing out by not starting with something
stronger?"** and answers it flatly — this is the correct starting point, not a
downgrade, and a stronger formula in a reactive body mobilises faster than
drainage can keep up with. Gentle and completed beats aggressive and abandoned.
The blue section's headline carries the same claim.

The FDA disclaimer footnote (`#bb-learn .disc`, added in v23) is here too — the
BioToxin Binder block restates CellCore structure/function claims.

### New files
- `docs/bb-feature-parasite-starter-duo.html`
- `docs/bb-learn-parasite-starter-duo.html`

### Building a fifth page, if it ever comes
1. `create_page` with `duplicateOf: "6a7635962dbaea8e6172ec58"` (Home) + SEO.
2. Swap four embeds: eyebrow `95c7e548…` (→ "Your Recommended Protocol", NOT the
   home page's sale line), feature `d7a7c63a…`, learn+FAQ `2148c621…`, store
   `7c7f9b41…` (feature-page variant).
3. Put the Shopify handle in the feature embed's marker span.
4. Set H1 `…f46d`, subhead `…f46f`, buttons `…f471` → `#bb-learn` / `…f473` →
   `#bb-shop`, shop heading `…f488` / `…f48a`.
5. **`remove_attribute` `href` on `…f471`** — the Home duplicate carries a
   leftover `href="#bb-shop"` that overrides the Designer link on publish.
6. Publish. No footer upload.

### Still open
- **robots.txt** — all four pages are unlinked but indexable:
  ```
  User-agent: *
  Disallow: /parasite-power-duo
  Disallow: /full-moon-para-kit
  Disallow: /drainage-duo
  Disallow: /parasite-starter-duo
  ```
- **Two URLs** — free drainage clinic and free parasite masterclass still point
  at `https://www.biohackingbombshell.com/`. They appear on all four pages now.
- **Two Shopify images** — `drainage-jumpstart-duo` has only `UvaUrsi_4.png` and
  `parasite-cleanse-starter-kit` only `UvaUrsi_3.png`. Both bundles show that
  image on their buy card and in the shop grid, because both come straight from
  `featuredImage`. Nothing in this repo can fix it.

---

## v25 — sale wording, and the grid list split from the sale list (2026-08-31)

Four home-page changes. The last one needed a structural change to keep the page
honest.

### 1. Promo bar copy
"Full Moon Parasite Sale" → **"Parasite Cleanse Product Sale"**, in both the live
and the pre-open variants. The bar now reads:

> 20% OFF the Parasite Cleanse Product Sale · Use code **PARASITE** at checkout · Ends September 7

### 2. "Use code PARASITE at checkout for 20% off"
Two places produce that phrasing and both were updated: `codeHtml()` (the chip on
the product modal and the feature card) and the `short` string in
`fillCallouts()` (the chip on the hero collage panel). The promo bar keeps its own
wording, which already leads with "20% OFF" — appending "for 20% off" would say it
twice in one line.

### 3. No code chip on the shop-grid cards
`card()` no longer calls `codeHtml()`. The 20% sticker stays; the code itself is
stated once, by the bar. `.bb-code` CSS is still used by the modal and the
feature card, so it stays in the embeds.

### 4. FEATURED vs SALE — the important one
The grid gains the Parasite Starter Duo and moves the Drainage Jumpstart Duo to
the end. But **the Starter Duo is not in the Shopify discount.** Verified:

```
codeDiscountNodeByCode(code:"parasite") → 8 products
  BioToxin Binder, Para 1, Para 2, Para 3, Para 4,
  Cellcore Full Moon Para Kit, Drainage Jumpstart Duo, Parasite Cleanse Power Duo
```

`parasite-cleanse-starter-kit` is not among them. One list could no longer serve
both jobs, so `HANDLES` was split:

```js
var FEATURED = [ ...9 handles, grid order... ];  // what the grid shows
var SALE     = [ ...8 handles... ];              // what PARASITE actually covers
```

`isSale()` now reads `SALE`; everything else (the handle query, the `IDS`
fallback, the catalogue de-dupe, the render order) reads `FEATURED`. The
"All N sale items below are 20% off" callout counts `SALE.length`, so it says 8,
not 9.

**Net effect:** the Starter Duo sits in the grid at full price with no sticker and
no code chip, while the other eight show struck-through pricing. That is correct,
not a bug — the checkout would reject a 20% discount on it.

If Emma adds the Starter Kit to the Shopify discount, the fix is one line: add
`'parasite-cleanse-starter-kit'` to `SALE`. **Do not add it before the Shopify
discount actually covers it.**

### Grid order now
Para 1 · Para 2 · Para 3 · Para 4 · BioToxin Binder · Full Moon Para Kit ·
Parasite Cleanse Starter Kit · Parasite Cleanse Power Duo · Drainage Jumpstart Duo

`IDS` is in the same order — it is the fallback path, and a mismatch there would
silently render the wrong set.

---

## v26 — the sale runs on every page (2026-08-31)

The four quiz landing pages now advertise the sale exactly as the home page
does: promo bar, 20% stickers, struck-through pricing, code chips.

```js
var SALE_PAGES = ['/', '/parasite-power-duo', '/full-moon-para-kit',
                  '/drainage-duo', '/parasite-starter-duo'];
```

That is the whole change to the display logic. `SALE_ON` was already the only
switch — everything downstream (`STATE`, `priceHtml`, `badgeHtml`, `codeHtml`,
`mountPromo`, `fillCallouts`) reads it, so no other display code moved.

### `/parasite-starter-duo` is the one to watch
Its featured product, `parasite-cleanse-starter-kit`, is **not in the Shopify
discount** (see v25). With the sale now advertised on that page, the promo bar
appears above a product card that correctly shows **$123.90 with no sticker and
no struck-through price**, while the discounted products below it in "shop the
rest of the store" do show the sale treatment.

That is honest but not ideal — the bar advertises an offer the hero product is
not part of. Two ways to resolve it, both one line:

- **Preferred:** add the Starter Kit to the `parasite` discount in Shopify, then
  add `'parasite-cleanse-starter-kit'` to `SALE`. Never the second without the
  first.
- **Or:** drop `'/parasite-starter-duo'` from `SALE_PAGES` and that page goes
  quiet again.

### The cart drawer's code line is now injected, not authored
The feature-page store embed carries the `.bb-cart-code` **styling** but not the
element — it was cut back when those pages were quiet. With the sale on, all four
carts would have been missing the "Code PARASITE is applied automatically at
checkout" reassurance.

Rather than re-upload four ~12 KB embeds, `ensureCartCode()` creates the
paragraph at the top of `.bb-cart-foot` when it is absent, and `renderCodeStatus`
calls it instead of a bare lookup. One place to maintain, and any future page
gets it free. `renderCodeStatus` still no-ops safely if there is no cart drawer
at all.

### Two comments corrected
The `WINDOW` / `STATE` block and `checkoutHref` both described the landing pages
as deliberately quiet, which is no longer true. They now explain the real reason
the two stay separate: the cart must carry the discount to checkout from any
page, including one later taken off `SALE_PAGES`.

---

## v27 — Starter Kit shows the sale treatment (2026-08-31)

`'parasite-cleanse-starter-kit'` added to `SALE`, so it now gets the 20% worm
sticker, the struck-through price and the code chip everywhere it appears — the
home grid, the product modal, and its own landing page's feature card.

### Read this before changing anything here
**The Shopify discount does not cover it.** Emma was shown the consequence and
chose this deliberately on 2026-08-31. The card advertises **$99.12**; checkout
charges the full **$123.90**. The cart drawer's subtotal comes straight from
Shopify, so a shopper who adds it sees the real number there and at checkout.

`SALE` therefore no longer means "what the discount covers" — it means "what the
page displays as discounted". The two are the same for the other eight handles
and differ for this one. The header comment in the script spells this out with
`!!` markers so it does not read as an oversight and get "fixed" back.

Verified live at time of writing — `codeDiscountNodeByCode(code:"parasite")`
returns exactly eight products:

```
biotoxin-binder-cellcore, para-1-cellcore, para-2-cellcore, para-3-cellcore,
para-4, para-kit, drainage-jumpstart-duo, parasite-cleanse-power-duo
```

**To close the gap:** add Parasite Cleanse Starter Kit to the `parasite` discount
in Shopify. Nothing in this repo needs to change — the display is already on.

**To back it out:** remove the handle from `SALE`. Nothing else moves.

**Before adding any other handle to `SALE`,** re-run that query. This is the one
place where the page can promise a price the checkout will refuse.

### Knock-on
`fillCallouts()` counts `SALE.length`, so the collage callout now reads "All 9
sale items below are 20% off" — one of which is not, until the Shopify discount
is updated.

---

## v28 — cart attributes, so orders can be traced back to a page (2026-09-04)

Every cart created on this storefront is now stamped with two attributes:

```js
_bb_source        = 'biohacking-bombshell-webflow'
_bb_landing_page  = '/full-moon-para-kit'   (whatever page they added from)
```

Passed via `attributes` on the `cartCreate` mutation. They ride through to the
Shopify **order** and to the **abandoned-checkout** record.

### Why this exists
Two questions that had no durable answer before:

**1. Which orders are ours?** Shopify's sales-channel field already answers this
(channel "Headless" / publication "Biohacking Bombshell") — but only for orders.
Abandoned checkouts carry no channel field at all. Today they can be identified
by the `parasite` discount code, because the script attaches it to every cart —
but that stops the moment the sale ends, and a Dr. Jaban shopper who types the
code by hand is indistinguishable. Verified: one abandoned checkout on
2026-09-03 carries `parasite` alongside the Online Store theme's "Agreed to the
Terms and Conditions" attribute and Jaban-only products.

**2. Which page produced the sale?** Nothing answered this. The order's referrer
is only ever the bare origin `https://biohacking-bombshell-estore.webflow.io/` —
browsers strip the path on cross-site navigation, so all five pages look
identical. `_bb_landing_page` is the only way to tell them apart.

### Semantics worth knowing
- Set once, at cart **creation**. So it records where the shopper **first** added
  something — first touch, not last. Adding more items later from a different
  page does not overwrite it.
- Keys are underscore-prefixed, which keeps Shopify from showing them on the
  customer's order confirmation. Still fully queryable through the Admin API.
- Only applies to carts created from **v28 onward**. Existing localStorage carts
  keep whatever they had (nothing).

### How to read it back
```graphql
orders(first: 50, query: "created_at:>=2026-09-04") {
  nodes { name customAttributes { key value } }
}
abandonedCheckouts(first: 50) {
  nodes { createdAt completedAt customAttributes { key value } }
}
```

### Caveat on abandoned-checkout counts
Do NOT publish a "checkout abandonment rate" from `abandonedCheckouts` without
reconciling first. `completedAt` came back **null even for checkouts that clearly
converted** — e.g. one created 2026-09-03T21:28:35Z for $244.60 matches order
#63965 placed 40 seconds later for the same amount. Counting those as abandoned
would overstate dropoff badly. Reconcile against orders before reporting.

### Related, not yet done
The top of the funnel — page views, product opens, add-to-cart, checkout clicks —
still needs a web analytics tool on the Webflow site. Nothing is recording it and
`dataCollectionEnabled` is false with no Google tag attached. Still open — it is
not what v29 did.

---

## v29 — the sale is over, every trace of it removed (2026-09-08)

Emma: *"Can we remove any verbiage from any of the pages about a sale happening?
The sale is over now."*

The Shopify discount had already expired on its own — `codeDiscountNodeByCode(code:"parasite")`
returns `status: EXPIRED`, `endsAt: 2026-09-08T03:59:59Z` — so nothing here changed
what a customer is charged. **No Shopify discount was created, edited or deleted.**

### The one switch

```js
var SALE_ENABLED = false;   // footer script, was true
```

That single flag silences every *dynamic* sale surface on all five pages at once,
because they all read `SALE_ON` / `STATE`, which derive from it:

| Surface | Function | With the flag off |
|---|---|---|
| Fixed pink promo bar | `mountPromo()` | never mounts; no body top-padding, header sits back at 0 |
| 20% worm sticker on cards | `badgeHtml()` | returns `''` |
| Struck-through price + red sale price | `priceHtml()` | returns the plain `$xx.xx` |
| "Use code PARASITE…" chip on cards, feature blocks and the modal | `codeHtml()` | returns `''` |
| Hero-collage callout `#bb-collage-code` | `fillCallouts()` | `display:none` |
| Cart-drawer code line `#bb-cart-code` | `renderCodeStatus()` | `display:none` |
| `?discount=PARASITE` appended to the checkout URL | `checkoutHref()` | not appended |
| PARASITE attached to a **new** cart | `addToCart()` → `cartCreate` | `discountCodes: []` |
| PARASITE left on a **returning shopper's saved** cart | `cartDiscountCodesUpdate` on load | **stripped**, so an old cart cannot quietly discount an order |

Those last two mattered even with the Shopify discount expired: without the flag
the script kept sending a dead code, which surfaces in checkout as a rejected
discount — sale verbiage by another name.

`SALE_START` / `SALE_END` / `SALE_PCT` / `BADGE` / `DISCOUNT` / `SALE` / `SALE_PAGES`
are all **left in place**. They are inert while the flag is false and they are the
historical record. The next sale is: confirm the Shopify discount exists and covers
every handle in `SALE`, update the four values to match it, flip the flag. Do **not**
flip it on before the Shopify discount is live, or the page advertises a price
checkout will refuse.

### The date check was NOT enough on its own
`windowState()` already returned `'ended'` past `SALE_END`, which is why the promo
bar had gone quiet before this change. But that check runs against **the visitor's
device clock**. A shopper with a slow or wrong clock would still have seen the whole
sale. `SALE_ENABLED` is clock-independent. Use the flag, not the dates, to end a sale.

### Three pieces of static markup also had to go
The flag cannot reach text that is authored into an embed rather than drawn by the
script. All three were on the **Home page only**; the four landing pages were already
clean (their eyebrows all read "Your Recommended Protocol", verified).

| What | Where | Now |
|---|---|---|
| Hero eyebrow read "Parasite Cleanse Product Sale" | embed `95c7e548…` | "Parasite Cleanse Protocols" |
| Hero solid CTA read "Shop the Sale" | Webflow Link `…f471`, string `6f80e687…` | "Shop the Formulas" |
| Static 20% OFF sticker + `#bb-collage-code` chip | hero collage embed `d7a7c63a…` → **v11** | both elements deleted |
| `<p id="bb-cart-code">Code PARASITE is applied automatically at checkout.</p>` | store embed `7c7f9b41…` → **v17** | deleted |

The cart-code line mattered more than it looks: `renderCodeStatus()` only hides it
once a cart renders, so on a page with no cart the drawer showed that sentence to
anyone who opened it.

**The CSS for all of it was deliberately kept** — `.bb-was`, `.bb-now`, `.bb-code`,
`.bb-cart-code`, `#bb-collage-code`, `.bb-off`. Nothing on the page uses those rules
today. The next sale then needs only the flag plus, if the collage sticker and chip
are wanted back, those two elements pasted into the collage embed.

`ensureCartCode()` now creates `#bb-cart-code` on demand on **every** page (no embed
carries it any more), so the next sale needs no embed change at all for the cart
drawer.

### Files touched
| File | Change |
|---|---|
| `docs/bb-store-footer-code.html` | v28 → **v29**, `SALE_ENABLED = false`, comments updated |
| `docs/bb-hero-collage.html` | v10 → **v11**, sticker + chip removed, CSS kept |
| `docs/bb-store-embed-markup.html` | v16 → **v17**, static `#bb-cart-code` removed |

Published to the Webflow subdomain (`publishToWebflowSubdomain: true`), as every
publish in this project has been. The custom domains are still on their **Aug 26**
publish — see the open question about whether `biohackingbombshell.com` is meant to
serve this site.

### Still open after v29
- The `parasite-cleanse-starter-kit` FEATURED/SALE mismatch from v27 is **dormant,
  not fixed**. Nothing displays a sale price, so the gap is harmless today. It
  returns the moment `SALE_ENABLED` goes true. The `!!` block at the top of the
  footer script says so.
- The Shopify `parasite` discount expired by itself. It has **not** been deleted —
  if it should be removed from the Shopify admin, that is Emma's call.

---

## v30 — the sale is back on (2026-09-08)

Emma: *"We are actually going to run the sale for another day, can you add all
the parasite discount code verbiage back in?"*

**The Shopify discount had already been extended** before this request reached me.
Checked immediately before touching anything:

```
codeDiscountNodeByCode(code: "parasite")
  status    ACTIVE          (was EXPIRED four hours earlier)
  startsAt  2026-08-31T20:45:45Z
  endsAt    2026-09-10T03:59:59Z   (was 2026-09-08T03:59:59Z)
  value     20%
```

So no Shopify discount was created or edited here either. **Always run that query
before flipping the flag on.** The page only displays prices; Shopify is what
charges the customer. Turning the display on against an expired or missing
discount means every card advertises a price the checkout refuses — which is a
worse failure than the sale simply being off.

### What changed

| | |
|---|---|
| `docs/bb-store-footer-code.html` | v29 → **v30**: `SALE_ENABLED = true`, `SALE_END` → `2026-09-10T03:59:59Z` |
| `docs/bb-hero-collage.html` | v11 → **v12**: 20% OFF sticker and `#bb-collage-code` chip restored |
| Home hero eyebrow (embed `95c7e548…`) | → "Parasite Cleanse Product Sale" |
| Home hero CTA (`…f471`) | → "Shop the Sale" |

**The store embed needed no change.** v17 removed its hard-coded `#bb-cart-code`
line, and `ensureCartCode()` creates that element on demand — so the cart drawer's
code line came back on its own. That was the point of the v17 refactor and it paid
off on the first cycle: a 12.5KB embed re-upload avoided.

Everything else — promo bar, worm stickers, struck-through pricing, the code chips
on cards, feature blocks and modals, the callouts — is derived from `SALE_ENABLED`
and came back with the one flag. v11 having *kept* the sale CSS while removing only
the two elements is why restoring the collage was a two-line paste.

### The date is not typed twice
The promo bar's "Ends September 9" is produced by `saleDate(SALE_END)`, not written
anywhere. `2026-09-10T03:59:59Z` is 11:59pm Eastern on Sep 9, so it renders as
September 9 in every US timezone. Change `SALE_END` and every date on the site
follows. There is no second place to update.

### Note on the extension length
Emma asked for "another day." The Shopify discount was extended by **two** — from
end-of-Sep-7 to end-of-Sep-9 Eastern. The page mirrors Shopify, because Shopify is
what honours the code; the page must never claim a shorter or longer window than
the discount actually has. If one day was intended, shorten it **in Shopify** and
re-copy `endsAt` into `SALE_END`.

### The Starter Kit mismatch is live again
`parasite-cleanse-starter-kit` is in `SALE` but is **not** in the Shopify discount —
re-verified 2026-09-08, still the same eight products. Its card shows $99.12;
checkout charges $123.90. This is Emma's explicit call from 2026-08-31, made with
the consequence stated, and it is back in force now that the sale is running. To
close it, add the Starter Kit to the `parasite` discount in Shopify.

### Ending it again
Set `SALE_ENABLED = false` and re-publish. Do **not** just let `SALE_END` pass:
`windowState()` reads the **visitor's device clock**, so a shopper with a wrong
clock keeps seeing the sale. The flag is clock-independent, and it is also what
stops the code being attached to new carts and strips it from saved ones.

---

## v31 — sale off again, and the switch-off is now a checklist (2026-09-10)

Emma: *"please remove all of the discount verbiage from the pages now"*

Verified before touching anything — the discount had already lapsed on its own
schedule:

```
codeDiscountNodeByCode(code: "parasite")
  status   EXPIRED
  endsAt   2026-09-10T03:59:59Z   (~17h before this edit)
```

So no offer was withdrawn from under a shopper mid-flight, and again **no Shopify
discount was created, edited or deleted.**

### The switch-off checklist

Three cycles in (off v29 → on v30 → off v31), this is now a known routine rather
than a one-off. It is written into the footer script's comment block as well, so
whoever does it next does not have to find this document.

**One flag** — `SALE_ENABLED = false` — covers everything the script draws:

promo bar · 20% worm stickers · struck-through prices · code chips on cards,
feature blocks and modals · hero-collage callout · cart-drawer code line ·
`?discount=` on the checkout URL · the code on NEW carts · the code on a
returning shopper's SAVED cart (stripped on their next load)

**Three things the flag cannot reach**, because they are authored into Webflow
rather than drawn by the script. These must be reset by hand every single time:

| Element | Sale on | Sale off |
|---|---|---|
| Home hero eyebrow, embed `95c7e548…` | "Parasite Cleanse Product Sale" | "Parasite Cleanse Protocols" |
| Home hero CTA, `…f471` | "Shop the Sale" | "Shop the Formulas" |
| Hero collage embed `d7a7c63a…` | `.bb-off` sticker + `#bb-collage-code` chip present | both removed |

The collage embed has now toggled v11 (out) → v12 (in) → v13 (out). **Its sale CSS
is never removed**, only the two elements, which is why each flip is a two-line
paste rather than a rewrite. The exact two lines are named in a comment at the top
of that embed.

**The store embed is never touched.** Since v17 it has no `#bb-cart-code` element
at all — `ensureCartCode()` builds it on demand and `renderCodeStatus()` hides it
while the sale is off. That refactor has now saved a 12.5KB embed re-upload on
three consecutive flips.

### Do not rely on SALE_END lapsing
`windowState()` compares `SALE_END` against **the visitor's device clock**. A
shopper with a wrong clock keeps seeing the entire sale after it ends. Only
`SALE_ENABLED` is clock-independent. Let the date lapse *and* throw the flag.

### Turning it back on
Re-read the Shopify discount first and copy its `endsAt` into `SALE_END`
**verbatim** — never pick a date in this file. The page displays prices; Shopify
charges the customer. A page advertising a discount checkout refuses is a worse
outcome than no sale at all.

### Still not fixed
The `parasite-cleanse-starter-kit` display/discount mismatch has now survived two
full on/off cycles untouched. It is harmless while the sale is off and returns the
instant it is switched on. Adding the Starter Kit to the `parasite` discount in
Shopify closes it permanently and takes about thirty seconds — worth doing before
the next sale rather than after.

---

## v32 — per-product links (2026-09-29)

Emma: *"Allyssa wants to be able to have specific product links. are you able to
create a spreadsheet with links to each individual product? Right now it is just
a home page."*

She is right that it was just a home page. **The storefront is a single page.**
There is no Webflow page per product and no per-product URL — a product card
opens a modal, which has no address of its own. So a link sheet could not be
written until links existed.

### The mechanism

`?product=<shopify-handle>` on any storefront URL opens that product's modal on
load, with its full description, images and Add to Cart:

```
https://biohacking-bombshell-estore.webflow.io/?product=para-3-cellcore
```

**Why not a Shopify product URL.** It would land the shopper on
`synergizedsupps.com` — Dr. Jaban's Online Store. That loses the Biohacking
Bombshell sales channel AND the `_bb_source` / `_bb_landing_page` cart
attributes, so the order stops being attributable to this storefront at all and
drops out of the Airtable daily metrics. The whole attribution chain built in
v28 depends on the shopper staying on the Webflow site.

**Why resolution is deferred.** `byHandle` fills in two stages — the nine
FEATURED products resolve first, then the catalogue pages in ~50 at a time.
`openDeepLink()` is called at both points and no-ops until its handle exists, so
a featured product opens immediately and a catalogue product opens a beat later.
First match wins and clears `wantProduct`, so the modal cannot open twice.

**Unknown handles fail silently and deliberately.** A mistyped or retired handle
just renders the normal storefront. These links will sit in Instagram bios and
old emails for months; a shopper landing on a working shop is a better outcome
than an error page. `?bbdebug=1` reports what actually happened.

### The spreadsheet
`docs/exports/biohacking-bombshell-product-links.xlsx` — 272 products, one row
each: name, brand, price, section, stock, product link, and the dedicated
landing-page URL for the four products that have one.

**272, not 339.** The sheet reproduces the site's own `isHidden()` rule, because
a link to a product the storefront hides would open nothing. Excluded: 67
products — every `$0` placeholder, and everything matching `HIDE_WORDS`
(`jaban`, `resistance band`, `kinesiology`, `welcome gift`, `chasing health`,
`parasites 101`). If that rule ever changes, the sheet has to be regenerated
against it or it will list dead links.

Prices are a snapshot; the page always renders live price and stock, so a stale
price in the sheet never reaches a customer.

### Finding worth acting on
**"Beginner Gallbladder Flush" ($203.85, Cellcore) is invisible on the
storefront.** Its handle is
`chasing-health-monthly-subscription-dr-jabans-gallbladder-flush-copy` — a
leftover from whatever product it was duplicated from — and `jaban` in that
handle trips `isHidden()`. The product itself is Cellcore, active, in stock and
nothing to do with Dr. Jaban.

Note this contradicts the comment above `HIDE_WORDS`, which claims the
still-for-sale Beginner Gallbladder Flush survives because `'chasing health'`
has a space and cannot match the hyphenated handle. True as far as it goes — but
`'jaban'` catches it anyway. Changing the Shopify handle is the clean fix and
costs nothing; it is a duplicate-derived slug nobody links to.

---

## v33 — CellCore only, category browsing, October flash sale (2026-10-06)

Emma: *"I want to ONLY have cellcore products available and we are running a
flashsale from October 7th - October 14th it is 20% off sitewide. I want to
create categories so people know what to shop for... I also want people to know
that they can come back and purchase from this store after the sale is over."*

This is a **rebuild**, not a patch. It deletes more than it adds.

### What the shop is now
`CATEGORIES` in the footer script is the entire storefront: 9 categories, 36
unique CellCore handles. A product not named there does not appear, is not
fetched, and cannot be deep-linked. There is no catalogue fallback.

Gone with it: the search box, the brand filter, the sort control, the paged
catalogue loader, `isHidden()`, `vendorOf()`, `HIDE_WORDS`, `VENDOR_ALIAS`, and
the FEATURED / rest-of-store split. A fixed 36-product list needs none of them,
and every one of those was a place for Dr. Jaban's catalogue to leak in.

Navigation is a chip row (`#bb-cats`) built from the same `CATEGORIES` array, so
it can never advertise a section that does not exist. Chips scroll rather than
jump, because the fixed promo bar would otherwise park the heading under it.
A category whose handles all fail to load is dropped from the chips **and** the
sections, so a bad handle reads as "not offered" rather than a broken page.

### Verified against Shopify before building
All 58 live CellCore products pulled 2026-10-06 (vendor `Cellcore Biosciences`,
status ACTIVE, published to the Biohacking Bombshell channel). The sheet's 58
rows mapped to **47** real products; **11 could not be used**:

| Sheet entry | Reality |
|---|---|
| Core Nutrients 60 ct / 120 ct, D3+K2 Pro, TriMag Complex, Methyl-B Complex, HydrOxygen | Do not exist in the store at all |
| "Foundational Protocol", "Step 4: Systemic Detox" | Do not exist |
| Daily Foundational Detox Support | Exists, **ARCHIVED** |
| Hormone Support Bundle (= "Hormone Jumpstart") | Exists, **ARCHIVED** |
| Biocidin LSF / Liquid / Capsules | Biocidin brand, not CellCore — contradicts "only CellCore" |

That is why **Foundation Support ships with one product (BC-ATP)**. Reactivating
the two archived items and creating the five missing ones in Shopify is the fix;
then add their handles to `CATEGORIES`.

Emma's call on the 21 live CellCore products her sheet does not categorise (Full
Moon Para Kit, Jumpstart Kit, the Liver/Stomach/MYC/RAD/C.A. kits, Optimize A
and B, Phase 1–5, Beginner Gallbladder Flush, CT-Minerals, ME Support): **leave
them off the site.** They remain inside the FLASHSALE discount, so a direct link
still discounts correctly — nothing on the site links to one.

### The sale
Copied verbatim from the live Shopify discount, read before the edit:

```
codeDiscountNodeByCode(code: "FLASHSALE")
  status     SCHEDULED
  percentage 0.2
  startsAt   2026-10-07T04:30:00Z    (12:30am ET, Oct 7)
  endsAt     2026-10-14T16:37:00Z    (12:37pm ET, Oct 14)
```

**Coverage was checked this time, not assumed.** The discount lists 58 products
— every live CellCore item, including all 36 the site sells. So for this
storefront it is genuinely sitewide and `isSale()` returns true for everything.
That is not a standing licence: the v27 Starter Kit mismatch came from assuming
coverage. Re-verify before the next sale.

**`endsAt` is 12:37pm Eastern on Oct 14, not end of day** — almost certainly an
artifact of when the discount was created. Emma was told. If she extends it,
re-copy the new `endsAt` into `SALE_END`, or the page keeps selling at 20% for
eleven hours after the code stops working.

### The year-round line
`#bb-restock` renders *"This shop stays open. Come back any time to reorder your
formulas — no sale needed..."* and is filled by `renderEvergreen()`, which sits
**outside every sale conditional**. That is deliberate: it is the one piece of
copy that must survive the sale ending. Three sale cycles have taught that
anything inside a sale conditional disappears the moment the flag flips.

### Static copy went evergreen
After v29/v30/v31 spent three cycles toggling hand-written sale text, none of the
Webflow-authored copy mentions the sale any more:

| Element | Now reads |
|---|---|
| Hero eyebrow `95c7e548…` | "Practitioner-Grade CellCore" |
| Hero CTA `…f471` | "Shop by Category" |
| Shop eyebrow `…f483` | "Shop by Need" |
| Shop heading `…f488` | "The CellCore Collection" |

Only the injected promo bar and the script-rendered chips, badges and struck
prices talk about the sale, and all of those are driven by `SALE_ENABLED` plus
the Shopify dates. **Ending this sale is now one flag and a republish**, with no
Webflow text to undo.

### Files
| File | Change |
|---|---|
| `docs/bb-store-footer-code.html` | v32 → **v33**, full rebuild |
| `docs/bb-store-embed-markup.html` | v17 → **v18**, category containers replace the toolbar/grid |

A copy of v32 is in the session scratchpad if a rollback is ever needed.


---

## v34 — parasite verbiage out, discount code everywhere (2026-10-06)

Emma: *"Can you take out all the parasite verbiage and make sure that the
discount code is listed in many places that it has to be plugged in at
checkout?"*

Two jobs in one pass. Neither is reversible by a flag, so both are written down
here in full.

### 1. The discount code, on seven surfaces

`codeLine()` in the footer script is now the **single source of truth** for the
code sentence. Change the wording there and it changes everywhere at once.

| # | Surface | Element |
|---|---|---|
| 1 | Site-wide promo bar | `#bb-promo`, injected by `mountPromo()` |
| 2 | Banner above the category chips | `#bb-code-banner`, built by `mountCodeBanner()` |
| 3 | Every product card | `.bb-code` via `codeHtml()` inside `card()` |
| 4 | Product modal | `.bb-code` via `codeHtml()` inside `openModal()` |
| 5 | Hero collage chip | `#bb-collage-code`, filled by `fillCallouts()` |
| 6 | Cart drawer | `#bb-cart-code`, filled by `renderCodeStatus()` |
| 7 | Under the Checkout button | `#bb-checkout-code`, built by `ensureCheckoutNote()` |

Live wording: **"Enter code FLASHSALE at checkout for 20% off"**. Before the
window opens it reads "Code FLASHSALE · opens October 7". When the sale is off
or ended, every one of the seven is empty or hidden — the sale is still a
one-flag switch.

**Worth knowing before anyone "fixes" the copy:** the cart *already* carries the
code. `cartCreate` attaches it and `checkoutHref()` appends `?discount=`, so for
most shoppers it arrives pre-filled at checkout. The copy still says *enter it*
because that is the instruction, and it stays true either way — a shopper who
sees it pre-filled has lost nothing, and one whose browser dropped the cart
still knows what to type. The cart drawer says so precisely: once the code is
applied it reads "✓ Code FLASHSALE is on your cart — check it is still applied
on the checkout page."

New CSS for surfaces 2 and 7 lives in the **store embed, v19**
(`#bb-code-banner`, `.bb-cb-pct`, `.bb-cb-txt`, `.bb-cb-sub`,
`.bb-checkout-code`). Like the rest of the sale styling it is left in place when
a sale ends.

### 2. Parasite verbiage removed

The September parasite campaign was the site's entire voice. It is gone from
every visitor-facing surface.

**Home page text nodes (Webflow-authored):**

| Element | Was | Now |
|---|---|---|
| H1 `3ce7aa49…` | "If you have a pulse, you have a parasite." | "Stop chasing symptoms. Start clearing the load." |
| Hero subhead `1aebf178…` | "…stubborn symptoms? Parasites. Run your targeted parasite cleanse…" | "…stubborn symptoms? The total load your body is carrying. Shop the full CellCore collection…" |
| Ghost CTA `f6879d16…` | "Learn Why Parasites Matter" | "Learn Why Root Cause Matters" |
| Footer link `…f564` | "Parasite " (+ "&" + " Gut") | "Detox " (+ "&" + " Gut") |

**Testimonials — read this before editing further.** Three of the parasite
mentions sat inside quotes attributed to named clients (Jenna M., Sarah R.,
Kayla T.). Those were edited, which means a named person's quoted words were
changed. The edits were kept to the smallest possible substitution and nothing
about the claimed outcome was altered:

- Jenna M.: "…the drainage work and **parasite cleansing**…" → "…the drainage
  work and **the staged protocol**…"
- Sarah R.: "Allyssa's guide and **parasite cleanse masterclass**…" →
  "Allyssa's guide and **masterclass**…"
- Kayla T.: "Ran the **Para Kit** for 30 days… I recommend **this cleanse**…" →
  "Ran the **protocol** for 30 days… I recommend **it**…"

Emma was told explicitly. If any of these is a verbatim quote she holds on
record, the wording should be checked against the original.

**Education embed `2148c621…` — rewritten.** It was a full parasite lesson:
pill "Let's Talk Parasites", an attributed quote ("If you have a pulse, you have
a parasite." — Dr. Todd Watts), four parasite cards (where they come from, why
they keep you stuck, full-moon timing, drainage first) and a 14-item parasite
symptom checklist. It is now a root-cause / total-burden lesson with the same
structure, the same CSS and the same four-card grid:

- Pill "Let's Talk Root Cause"; lead about total burden rather than parasites.
- The Dr. Todd Watts quote is **removed, not reworded** — putting different
  words in a named person's mouth is not an option. The blockquote now carries
  the site's own line, cited to "the Biohacking Bombshell approach".
- Cards: where the burden comes from / why you stay stuck / why the order
  matters (the CellCore phases) / open drainage pathways first.
- `#bb-drainage-link` is **preserved** — it is what opens the Drainage Jumpstart
  Duo modal via `COPY_LINKS` in the footer script. Do not drop it in a rewrite.
- The symptom list drops the parasite-specific items (full-moon flares, Lyme/EBV/HSV
  naming) for general signs of a body that cannot keep up.

**Elsewhere:**
- `CATEGORIES.anti.blurb` was "The parasite and pathogen formulas." → "Targeted
  formulas for microbial support." The category *name* stays "Anti-Microbials",
  which is Emma's own from the sheet.
- The 20% OFF sticker carried a little **worm glyph**. `badgeHtml()` now emits
  plain type. The `.bb-off svg` rules are still in both embeds and simply match
  nothing.
- Hero collage, v14: the five tiles were Para 1–4 + BioToxin Binder — the
  parasite protocol as the face of the home page. `COLLAGE` and the static
  fallback are now one product from five different categories (Drainage
  Activator, BioToxin Binder, CT-Biotic, Para 1, BC-ATP), so the hero reads as
  the collection. The fallback markup and `COLLAGE` must be changed together.

**Deliberately NOT changed, and why:**
- Product names. "Para 1", "Parasite Cleanse Power Duo" and the
  `parasite-cleanse-*` handles are CellCore's and Shopify's, not site copy.
  Renaming them would break the handle lookups and sell something that is not
  what it says.
- The `SALE_PAGES` and `FEATURE` paths (`/parasite-power-duo`,
  `/full-moon-para-kit`, `/parasite-starter-duo`). Those are the real URLs of
  the four hidden landing pages.

### Still open
- **The four hidden landing pages** (`/parasite-power-duo`,
  `/full-moon-para-kit`, `/drainage-duo`, `/parasite-starter-duo`) are *entirely*
  parasite-themed quiz funnels and were **not** touched. They are unlinked from
  the site, so nobody reaches one without a direct link — but anyone who has a
  link still lands on the old voice. Emma's call: rewrite them, or retire them.
- `SALE_END` still reads 12:37pm ET Oct 14, per the live Shopify discount.

### Files
| File | Change |
|---|---|
| `docs/bb-store-footer-code.html` | v33 → **v34** |
| `docs/bb-store-embed-markup.html` | v18 → **v19** |
| `docs/bb-hero-collage.html` | v13 → **v14** |
| `docs/bb-education-embed.html` | parasite lesson → root-cause lesson |

---

## v35 — code moved off products, and the date bug (2026-10-06)

### The code sits at section level now, not product level

Emma, looking at v34: *"rather than the code FLASHSALE being on every single
product, can it just be at checkout and above each section rather than each
product?"*

She is right. 36 products meant 36 identical pink chips; the code stopped
reading as information and started reading as wallpaper. v35 drops the two
**per-product** surfaces and adds one **per-category** line.

| Surface | v34 | v35 |
|---|---|---|
| `#bb-promo` site-wide bar | yes | yes |
| `#bb-code-banner` above the chips | yes | yes |
| `#bb-collage-code` hero chip | yes | yes |
| `.bb-cat-code` under each category heading | — | **new** |
| Every product card (`.bb-code` in `card()`) | yes | **removed** |
| Product modal (`.bb-code` in `openModal()`) | yes | **removed** |
| `#bb-cart-code` cart drawer | yes | yes |
| `#bb-checkout-code` under Checkout | yes | yes |

Nine category sections, so the code now appears nine times in the shop instead
of thirty-six — once where a shopper is actually deciding what to browse.

`codeHtml()` still exists but is called from **one place only**: `renderFeature()`,
the four hidden landing pages. Those pages have no category sections, so without
it their only mention of the code would be the promo bar. Do not reintroduce
`codeHtml()` into `card()` or `openModal()` — that is exactly what was asked to
be taken out. New styling: `.bb-cat-code` in the store embed, **v20**.

### The date bug Emma caught

Emma: *"also the code start october 7th not the 6th."*

This was a real bug, not a typo. `saleDate()` called `toLocaleDateString()` with
no `timeZone`, so it formatted against the **visitor's device clock**:

```
SALE_START = 2026-10-07T04:30:00Z
  → Eastern:  October 7, 12:30am   ✓
  → Central:  October 6, 11:30pm   ✗  "opens October 6"
  → Mountain: October 6,  9:30pm   ✗
  → Pacific:  October 6,  8:30pm   ✗
```

Every shopper outside Eastern was being told the sale opens **October 6**. The
fix is a new `SALE_TZ = 'America/New_York'` passed to every `saleDate()` call, so
all six surfaces read "October 7" and "October 14" for everyone, everywhere.
There is a device-local fallback inside a nested try/catch for any browser that
rejects the `timeZone` option, rather than printing an empty date.

**What was deliberately NOT changed:** `windowState()` still compares real
instants against Shopify's `startsAt`/`endsAt`. Only the words changed, never
the window — the page can still never advertise a discount checkout will refuse.

**One thing for Emma to decide.** The Shopify discount genuinely begins at
04:30 UTC, which is 11:30pm **Central** on October 6. So for the last half hour
of the 6th, a Central-time shopper can use the code while the page says it opens
the 7th. Erring that way is the safe direction — the page under-promises — but if
the sale is meant to start at midnight Central, the Shopify discount's `startsAt`
needs to move to `2026-10-07T05:00:00Z`. That is a live pricing change, so it is
Emma's to make; re-copy the new value into `SALE_START` afterwards.

### Files
| File | Change |
|---|---|
| `docs/bb-store-footer-code.html` | v34 → **v35** |
| `docs/bb-store-embed-markup.html` | v19 → **v20** |

---

## v36 — hero graphic, shop headings, flow (2026-10-06)

Seven changes from Emma, all cosmetic/flow except the first, which is wired to
the real Shopify dates.

### 1. The top banner reads the range
Was *"Opens October 7"*. Now **"Oct 7-14th"**, in both the pre-sale and live
states. `saleRange()` builds it from `SALE_START`/`SALE_END` rather than a typed
string, so it cannot drift from the Shopify window. It uses the same
Eastern-pinned formatter as everything else, carries an `ord()` helper so the
suffix is right on any date (1st, 2nd, 3rd, 11th, 21st), and handles a sale that
straddles two months ("Oct 28-Nov 3rd").

`salePart(iso, opts)` is now the single date formatter. Every call site goes
through it, so the timezone pin from v35 cannot be forgotten on a new one.

### 2. The hero is Emma's sale graphic
Uploaded to Webflow assets as `bb-flashsale-hero-oct2026.webp`
(asset id `6ac55845500f8d19ec9cadba`, 2000x1125). A copy lives in this repo at
`docs/assets/` so the source is not only in Webflow.

**It is script-managed, not pasted in.** `swapHero()` shows `#bb-hero-sale`
while the sale is on and `#bb-collage` (the product strip) the rest of the year.
That matters: a dated graphic hard-coded into the hero would still be sitting
there on October 15. This way the hero reverts on its own with the same flag as
everything else.

The graphic already says "20% OFF", "OCTOBER 7 - 14" and "USE CODE FLASHSALE",
so the `#bb-collage-off` sticker and `#bb-collage-code` chip hide along with the
strip rather than repeating it. The code's six surfaces are unchanged in number
— the hero chip's slot is now the graphic itself.

**Flagged to Emma:** the graphic reads "UP TO 20% OFF". The FLASHSALE discount
is a flat 20% on every product the site sells, so "up to" undersells it. Her
asset, her call.

### 3-5. Shop headings
| Element | Was | Now |
|---|---|---|
| Shop eyebrow `…f483` | "Shop by Need" | **"SAVE BIG ON"** |
| Shop subhead `f9797ddc…` | "Every CellCore formula I use with my clients..." | **"The top formulations I use with clients that uplevel their results. Pick a category below or scroll to shop."** |
| Chip-row label `.bb-cats-lab` | "Shop by need", 11px grey caps | **"Shop by Category"**, 21px / 800 weight / brand plum |

### 6. The reorder line MOVED, it was not deleted
Emma: *"take away the little section... While we definitely want to encourage
that, I think the overall flow would be better if we went straight into all the
different categories."*

So `#bb-restock` no longer sits between the chips and the first category. It now
**closes the shop**, after the last category — which is where a reorder prompt
belongs anyway, once someone has seen what is for sale. The encouragement she
said she wants is kept; only its position changed. Say the word if it should go
entirely.

Mechanically: the `<div id="bb-restock">` is gone from the store embed, and
`renderEvergreen()` builds the element and appends it to `#bb-cat-sections`.
Because `renderShop()` replaces that container's innerHTML, **renderEvergreen
must run after renderShop** — it is called inside the `loadProducts().then`,
not at boot. Do not move it back to the boot block; it would be wiped.

### 7. A "CATEGORIES" divider
`.bb-cats-divider` — a centred, letterspaced label between two hairline rules —
now sits above the first category section, so it is obvious the whole catalogue
follows rather than one list.

### Files
| File | Change |
|---|---|
| `docs/bb-store-footer-code.html` | v35 → **v36** |
| `docs/bb-store-embed-markup.html` | v20 → **v21** |
| `docs/bb-hero-collage.html` | v14 → **v15** |
| `docs/assets/bb-flashsale-hero-oct2026.webp` | new — source of the hero graphic |

---

## v37 — hero banner sizing, and where it lives now (2026-10-06)

Emma: *"can you fix the sizing of the hero banner"*.

### What was actually wrong with the sizing
The graphic is 2000x1125 (16:9). At v15's `max-width: 860px` it rendered **484px
tall** — taller than the H1, subhead and both buttons put together, and enough
to push the CTAs off the first screen on a laptop. Two caps now apply together:

| Cap | Effect |
|---|---|
| `max-width: 720px` | 405px tall at most, matching the rest of the hero |
| `max-height: 44vh` | on a short window it scales down instead of eating the fold |

| Viewport | Banner |
|---|---|
| 900px tall | 704 x 396 |
| 800px tall | 626 x 352 |
| 700px tall | 548 x 308 |

`width:auto` + `max-width` + `max-height` keeps the aspect ratio, so the graphic
is never cropped and never letterboxed. The radius and shadow sit on the **img**,
not a wrapper — on a wrapper they would frame a box wider than the picture once
the height cap bites.

### The embed was gone
Before changing anything, a read of the live page found the home page had been
edited in the Designer (site published 22:54Z, ~2.5h after the v36 publish):

- the hero embed holding the banner had been **deleted**
- the hero eyebrow, H1, subhead and the wrapper around the CTA buttons were all
  set to **hidden**
- no Image element and no banner anywhere else on the page

So there was no banner to resize. Emma confirmed both calls: **rebuild it from
the script**, and **leave the hides as they are**.

### The banner is now script-owned
`ensureHero()` + `heroCss()` in the footer script build the banner, its styling
and its sizing, and append it to the `.bb-hero` section. Consequences worth
knowing:

- **There is no element in the Designer tree to delete**, so this cannot be lost
  the same way again.
- It is **home page only** (`path === '/'`). The four landing pages are sale
  pages too but have their own feature block and should not grow a second hero.
- It is still tied to the sale flag — nothing is built once the sale ends, so a
  dated graphic cannot be stranded on the page.
- If a page still carries the old `#bb-collage` strip, it is hidden while the
  banner is up rather than showing both.
- To change the artwork, upload a new asset and change `HERO_IMG`.

`swapHero()` from v36 is gone, replaced by `ensureHero()`.

### Open, for Emma
The home page currently has **no visible H1** — it is hidden along with the
eyebrow and subhead. That costs SEO and screen-reader structure. Say the word
and I will add one back, visible or visually-hidden.

### Files
| File | Change |
|---|---|
| `docs/bb-store-footer-code.html` | v36 → **v37** |
| `docs/bb-hero-collage.html` | v15 → **v16**, and marked retired — no longer on the home page |

---

## v38 — one hero graphic, not two (2026-10-06)

Emma: *"there should only be 1 image of her. remove the one on the top."*

### What had happened
The sale graphic ended up on the page **twice**, from two different places:

| Source | What it looked like |
|---|---|
| `.bb-hero` `background-image: @img_6ac55845500f8d19ec9cadba`, `background-size: cover` — set in the **Designer** | full-bleed behind everything |
| `#bb-hero-sale`, built by **v37's `ensureHero()`** | framed card on top of it |

v37 added the script version precisely *because* the embed had been deleted —
but the asset had already been re-applied as the section background, which the
element tree does not show. Checking the element tree alone was not enough; the
style had to be read too. The `.bb-hero` style was queried this time before
touching anything, which is what identified the duplicate.

### The fix
`ensureHero()`, `heroCss()` and `HERO_IMG` are **deleted**. The hero is now
entirely the Designer's background image, and the script builds nothing there.
A prominent comment block sits where the code was, explaining the v36 → v37 →
v38 flip-flop, so a future change does not re-add a third copy. **Check the
`.bb-hero` style before putting any hero element back.**

### Open, for Emma — two things
1. **The background image will not clear itself.** Everything else dated on this
   site is behind `SALE_ENABLED` and disappears the moment the sale ends. A
   background-image set in the Designer is not. On October 14 someone has to
   remove it by hand, or the storefront keeps advertising a finished sale. If
   that is a problem, the script can override it when the sale ends — say the
   word.
2. **`background-size: cover` crops it.** The hero is tall (200px top padding,
   400px bottom), and the graphic is 16:9, so `cover` scales it to fill and
   chops the rest: the "UP TO 20% OFF" badge is clipped at the top and one of
   the "SALE" lines runs off the bottom. `contain` would show the whole design
   but leaves bars; reducing the hero padding is the other way. Her call.

Also still open from v37: the home page has **no visible H1**.

### Files
| File | Change |
|---|---|
| `docs/bb-store-footer-code.html` | v37 → **v38** |

---

## v38a — the hero crop (2026-10-06)

Emma: *"now the hero banner is so small it is only showing her forehead."*

### Why removing the duplicate made the crop worse
`.bb-hero` was `background-size: cover` on a full-width section whose height came
only from its padding (200px top + 400px bottom = 600px). `cover` scales the
image to fill the box and throws away the overflow, so the taller and narrower
the box relative to 16:9, the more survives — and the shorter and wider, the
less:

| Viewport | Section height | Of the graphic's height, visible |
|---|---|---|
| 1900px wide | 1000px (v37, with the script element adding ~400px) | 94% |
| 1900px wide | 600px (v38, element removed) | **56%** |
| 1440px wide | 600px | 74% |
| 1280px wide | 600px | 83% |

So v37's banner element had been propping the section open. Removing it dropped
the section to 600px, `cover` cropped harder, and on a wide screen you were left
with a band across her forehead.

### The fix — `.bb-hero` style, changed in the Designer
| Property | Was | Now |
|---|---|---|
| `background-size` | `cover` | `contain` |
| `background-repeat` | `repeat` | `no-repeat` |
| `background-position` | `0px 0px` | `50% 50%` |
| `padding-top` | `200px` | `0px` |
| `padding-bottom` | `400px` | `0px` |
| `aspect-ratio` | — | `2000 / 1125` |
| `max-height` | — | `78vh` |

`aspect-ratio` makes the section's own shape match the graphic, so `contain`
fills it edge to edge with nothing cropped and nothing letterboxed. `max-height`
stops it running past most of a screen on a wide monitor — when that cap bites,
the section becomes wider than 16:9 and the graphic centres with symmetric
margins rather than cropping.

| Viewport | Banner | Visible | Side margin |
|---|---|---|---|
| 1900x900 | 1248x702 | 100% | 326px |
| 1440x900 | 1248x702 | 100% | 96px |
| 1280x800 | 1109x624 | 100% | 85px |
| 390x844 (phone) | 390x219 | 100% | 0 |

**This is a trade, and it is the only one available:** a 16:9 designed graphic in
a wide, short section can be shown *whole* (margins at the sides on wide
screens) or *edge to edge* (cropped). It cannot be both. Whole was chosen
because the graphic carries the offer — "OCTOBER 7 - 14", "USE CODE FLASHSALE",
the 20% badges — and cropping it loses the message. To go back to full-bleed,
set `background-size` to `cover` and drop `aspect-ratio`/`max-height`.

The disabled gradient layer in `background-image` was left intact, including its
`/* ... */` comment syntax, so it still shows as a disabled layer in the Designer.

### Files
No script change — `.bb-hero` style only. The footer script stays at **v38**.

---

## v38b — the gap on the right (2026-10-06)

Emma: *"fix the spacing issue on the right hand side."* The graphic was flush to
the left edge with a band of empty white down the right.

### Two causes, one visible symptom

**1. `background-position` was silently not applying.** v38a wrote it as
`/* 0px 0px, */ 50% 50%`, mirroring the disabled-gradient-layer syntax already in
`background-image`. That round-trips through the API fine — reading the style
back returned exactly that string — but it does **not** survive into the
published CSS, so the property fell back to left-aligned. `background-size` and
`background-repeat` were written the same way and were presumably getting the
same treatment.

**Lesson for this style:** do not use the `/* layer, */ value` comment syntax
when writing background properties through the API. Write plain single-layer
values. `background-image` is now a plain value too, which means **the disabled
gradient layer is gone from the Designer** — it was only ever a switched-off
layer, but if that gradient is wanted back it has to be re-added by hand.

**2. `max-height: 78vh` was cutting the box shorter than its own aspect ratio.**
When the cap bites, the section becomes wider than 16:9 and a `contain`
background cannot fill it — hence empty space regardless of alignment. Raising
the cap to `100vh` means that on essentially every real screen the aspect ratio
governs and the graphic fills the section exactly.

| Viewport | Hero box | Graphic | Gap each side |
|---|---|---|---|
| 1875x985 (the screenshot) | 1875x985 | 1751x985 | 62px |
| 1920x1080 | 1920x1080 | 1920x1080 | **none** |
| 1440x900 | 1440x810 | 1440x810 | **none** |
| 1280x800 | 1280x720 | 1280x720 | **none** |
| 2560x1440 | 2560x1440 | 2560x1440 | **none** |
| 390x844 (phone) | 390x219 | 390x219 | **none** |

Nothing is cropped at any size. On a short, wide window the cap can still bite
and leave a small margin — but it is now *centred*, so it is symmetric rather
than dumped on one side.

### Also cleared
The `tiny` breakpoint still carried `padding-bottom: 200px` from the old text
hero, which would have added dead space under the banner on the smallest
screens. Removed.

### Files
No script change — `.bb-hero` style only. The footer script stays at **v38**.
