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
| **All JavaScript** | **Site footer custom code** (Project Settings → Custom Code → Footer). `bb-store v7`. |
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
