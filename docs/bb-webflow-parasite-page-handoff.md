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
| Shopify | `synergized-supplements.myshopify.com` / `synergizedsupps.com`, Advanced |
| Storefront API | `https://synergized-supplements.myshopify.com/api/2024-10/graphql.json` |

Site has a **paid Webflow Site Plan** (confirmed by Emma). Workspace is **not**
Enterprise, so page branching is unavailable — edit pages directly.

## Embeds currently on the page (4)

| Element ID | What it is | JS? | Renders? |
|---|---|---|---|
| `95c7e548-b7da-2e0f-a368-8d2c7cb9f05a` | Hero eyebrow badge | No | ✅ |
| `d7a7c63a-ebc1-c926-210b-2c7da0e8115c` | Hero 3 Para cards → link out to synergizedsupps.com | No | ✅ |
| `7c7f9b41-49f9-eda7-a3c5-f289f9bfec5c` | **Headless store + cart** (real token) | **Yes** | ❌ |
| `2148c621-673b-0a07-3ec6-1e86f60a7a63` | `#bb-learn` education section | No | ✅ |

Source of `7c7f9b41` is committed alongside this doc as
`bb-headless-store-embed.html`, **token redacted**. The live embed has the real
publishable token in it.

## THE BLOCKER

Shop section renders **nothing** — no product cards, and *not even* the embed's own
`.bb-empty` fallback message. Hero and education embeds render fine.

### Ruled OUT — do not re-investigate

- **Duplicate store embeds.** There were two full copies of the headless store
  (`7c7f9b41` with the real token, `9daa5c04` with `PASTE_STOREFRONT_ACCESS_TOKEN_HERE`),
  both writing into the same `#bb-store` / `#bb-cart-toggle` / `#bb-cart-drawer` ids.
  `getElementById` returns the first match, so the placeholder copy's failure wiped the
  working copy's grid. **`9daa5c04` was deleted and the site republished. Did not fix it.**
- **Wrong product query form.** Both copies already used
  `products(first:20, query:"handle:… OR …")`, not the unsupported `product(handle:)`.
- **Free-plan custom-code restriction.** Site has a paid Site Plan.
- **Page branching mismatch.** Not an Enterprise workspace; `Home` is `isBranch: false`.
- **Edits/publish not landing.** `lastPublished` advanced `15:38:59 → 15:51:51`, page
  `lastUpdated 15:51:28` (before the publish), Webflow regenerated its screenshot, and
  the hero design is visibly live. The publish pipeline is healthy.
- **Stray custom code.** Site and page head/footer freeform blocks are both empty;
  zero registered scripts. Those 4 embeds are the only code on the site.

### Remaining suspects, in priority order

The absence of the `.bb-empty` message is the key signal — that message prints whenever
the Shopify call *returns* anything at all, including a 401. Getting a blank instead means
either the script never executed, or `fetch` **threw** before any response (the embed has
no `.catch()`, so a network-level failure fails silently).

1. **Script not executing at all.** Confirm in DevTools → Elements that the `<script>`
   survived into published HTML, and in Console whether it ran. Cheapest decisive test:
   temporarily drop a trivial JS embed on the page and see if it fires.
2. **`fetch` throwing.** Check the Network tab for the POST to `/api/2024-10/graphql.json`.
   No request at all → suspect #1. Request present but failed/blocked (CORS, CSP,
   `net::ERR_*`) → that's the cause.
3. **Token ↔ channel mismatch.** Only reachable if a response *does* come back. Products
   `para-1-cellcore`, `para-2-cellcore`, `para-3-cellcore`, `para-kit` are confirmed
   published to the **Biohacking Bombshell** (`139575558241`) and **Synergized Supplements
   Headless** (`139293524065`) channels. If the token maps elsewhere, mint a fresh one from
   the Headless channel (or via `storefrontAccessTokenCreate` on the Admin API — note tokens
   created that way bind to the creating app's publication, so verify visibility after).
4. **Section collapsed, not empty.** `#bb-store` with no children has zero height; make
   sure the section isn't simply scrolled past or visually collapsed.

## Open requirements (not yet built)

- **Hero cards should add to cart, not route away.** `d7a7c63a`'s three Para cards are
  plain links to synergizedsupps.com, which exits the BB brand mid-funnel. Emma wants
  add-to-cart on the BB page. Blocked behind the same JS fix — same cart, same token.
- **`para-kit` wraps alone.** `HANDLES` has 4 entries; `#bb-store` is `repeat(3,1fr)`, so
  the kit lands on its own row. Cosmetic; either promote the kit separately or go 4-up.
- **Floating cart toggle** is `position:fixed; top:18px; right:18px` — collides with the
  nav / "Book a Call" button. Move it bottom-right.
- **"Meet Your Practitioner"** (`d110f857-…-68c0c3ccf482`) is hidden, not deleted.
  Restore with a BB practitioner or remove for good.

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
