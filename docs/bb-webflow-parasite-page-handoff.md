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

## Embeds currently on the page (4)

| Element ID | What it is | JS? | Renders? |
|---|---|---|---|
| `95c7e548-b7da-2e0f-a368-8d2c7cb9f05a` | Hero eyebrow badge | No | ✅ |
| `d7a7c63a-ebc1-c926-210b-2c7da0e8115c` | Hero 3 Para cards, add-to-cart + modal (markup only, v3) | No | ✅ |
| `7c7f9b41-49f9-eda7-a3c5-f289f9bfec5c` | **Store + cart + product modal** (real token), `bb-store v5` | **Yes** | ✅ |
| `2148c621-673b-0a07-3ec6-1e86f60a7a63` | `#bb-learn` education section | No | ✅ |

Source of `7c7f9b41` is committed alongside this doc as
`bb-headless-store-embed.html`, **token redacted**. The live embed has the real
publishable token in it.

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

## Architecture — one script owns everything

There is exactly **one** `<script>` on the page: the shop embed, `bb-store v5`. It owns
the product fetch, the cart, the drawer, and the product detail modal. Every other
section is markup only.

### Opting a card in

```html
<div class="c" data-bb-handle="para-1-cellcore"
              data-bb-url="https://synergizedsupps.com/products/para-1-cellcore">
  <img src="..."><div class="n">Para 1</div>
  <span class="p"></span>                 <!-- price, filled by decorateCards() -->
  <span class="lm">Learn more</span>
  <button data-bb-add>Add to Cart</button>
</div>
```

- `data-bb-handle` — which Shopify product this card is. Required.
- `data-bb-add` — marks the add-to-cart control.
- `data-bb-url` — product page URL, used only as an offline fallback.

**Clicks are handled by ONE delegated listener on `document`**, which resolves the handle
at click time. This is deliberate: v4 bound handlers in a one-shot pass after the fetch
resolved, and when that pass silently missed, the hero buttons stayed `disabled` and
looked dead. Delegation is immune to timing, ordering and re-renders, and buttons now
ship **enabled**, so a decoration miss costs a price label — never functionality.

Click routing: `[data-bb-add]` adds to cart · anything else inside a `[data-bb-handle]`
card opens the modal · clicks inside the modal are inert except the add button, the
thumbnails and close · Escape closes modal and cart.

`decorateCards()` only fills prices. `fallbackCards()` (called from `report()`) converts
add buttons to "View product" links if the store is unreachable, so a shopper is never
dead-ended.

**Never add a second `<script>`, cart drawer or modal.** Two copies fighting over
`#bb-store` / `#bb-cart-*` ids was one of the original bugs. To add products anywhere:
write markup with `data-bb-handle`, and if the handle is new, add it to `HANDLES`.

### Product modal

Clicking a card opens a centered modal: image with thumbnail switcher, title, price,
the product's full `descriptionHtml` from Shopify, and Add to Cart (which adds, closes
the modal, and opens the cart drawer).

**The descriptions are rendered in full, on purpose.** CellCore copy carries California
Prop 65 warnings and FDA-style `*` disclaimers. Do not excerpt, truncate or summarise
them — dropping a Prop 65 warning off a product listing is a compliance problem, not a
design choice.

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
