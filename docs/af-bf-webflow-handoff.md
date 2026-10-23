# Aegis Black Friday 2026 page (Dr. Jaban Webflow)

| Thing | Value |
|---|---|
| Site | Dr Jaban Moore `6a5d0daed8efe08bd61817de` |
| Page | `Aegis Black Friday 2026`, slug `/black-friday`, id `6adbb692c5e5984383db966e` |
| State | **Draft**, not in navigation, `noindex, nofollow` in page head code |
| Shopify | Synergized Supplements, myshopify `dr-jaban-moore-store.myshopify.com`, Storefront API `2026-07` |
| Token | Buy Button Storefront token, same one the Biohacking Bombshell storefront uses. `TOKENPLACEHOLDER` in this repo copy |

## Where the code lives
- Page head custom code: noindex meta + CSS for script-rendered parts. Mirror: `af-bf-head-code.html`.
- Page footer custom code: all JavaScript (`af-bf v1`). Mirror: `af-bf-footer-code.html`. Settings block at the top: `TOKEN`, `SALE_START`, `SALE_END`, `DISCOUNT`, `SALE_PCT`.
- Static sections are native Webflow elements reusing site classes (`ncp-*` from Work With Dr. Nick, `oa-*` phase cards from Home, `faq-*` + the site `faqaccordion` script). New classes are prefixed `bf-`.

## How it sells
- Products load live by handle: `calm`, `clearaf`, `elemental-edge`, `rebalance-previously-called-post-pill-ease`, `nanoglut-b`, `tudca-max`, `total-tox-binder`, `total-tox-binder-copy`. All are published to Buy Button.
- Kits are not Shopify products. Each kit button adds its formulas as separate cart lines; the displayed kit price is the live sum. Full Sequence adds all of them (NanoGlut+B x2).
- Cart attributes `_af_source`, `_af_landing_page`, `_utm_campaign`; checkout URL gets UTMs and `?discount=` when `DISCOUNT` is set.
- `?bfdebug=1` shows a log panel.
