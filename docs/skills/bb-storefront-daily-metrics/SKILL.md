---
name: bb-storefront-daily-metrics
description: Syncs daily order and revenue metrics for the Biohacking Bombshell Webflow storefront from Shopify into the "BB Storefront Analytics" Airtable base. Isolates the storefront's own orders from Dr. Jaban's, which share the same Shopify store, by filtering on the Shopify sales channel. Fills in EVERY missing day between the last row in the table and yesterday, so a run that was skipped or failed self-heals on the next run. Use this skill whenever someone says "run the BB metrics sync", "update the BB storefront table", "sync the Biohacking Bombshell numbers", "update the storefront Airtable", "how did the estore do yesterday", "fill in the missing days in the BB table", or when the daily scheduled task fires. Also trigger if someone notices the BB Storefront Analytics table has stopped updating or has gaps.
---

# BB Storefront — daily metrics to Airtable

Write one row per calendar day into the **BB Storefront Analytics** Airtable base,
counting only orders that came from the Biohacking Bombshell Webflow storefront.

Work autonomously. On a scheduled run nobody is watching, so do not ask questions —
apply the rules below, and put anything ambiguous in the row's Notes field.

---

## Background you need

`biohacking-bombshell-estore.webflow.io` is a **headless** storefront: a Webflow
front end that sells through Shopify. Shoppers never see Shopify until checkout.

**The Shopify store is shared with Dr. Jaban.** Most orders in it are his, not ours.
Getting that separation right is the entire job — everything else is arithmetic.

| | Where it comes from | `publication.name` |
|---|---|---|
| **Ours** | the Webflow storefront | `Biohacking Bombshell` |
| Dr. Jaban's | synergizedsupps.com | `Online Store` |
| Subscriptions, gift cards, manual/draft orders | Shopify back office, Recharge | `null` |

Only `Biohacking Bombshell` counts. Everything else is excluded — including every
`null`, which is mostly gift cards and recurring subscription renewals.

---

## Steps

### 1. Work out which days are missing

Read the existing rows first. Do **not** assume the last run succeeded.

```
mcp__Airtable__list_records_for_table
  baseId  appWAGk5yDbYUgF6s
  tableId tblCmfoI3T3PdNVnG
  fieldIds ["fldFBjES1yVA0VhDw"]
  sort [{"fieldId": "fldFBjES1yVA0VhDw", "direction": "desc"}]
```

Take the latest Date present. The days to write are every date from **the day after
that** through **yesterday**, inclusive, in **America/Chicago**.

Usually that is one day. After an outage it will be several — write them all. This
is the whole reason the skill reads the table before writing: a missed run heals
itself instead of leaving a permanent hole.

If the latest row is already yesterday, there is nothing to do. Say so and stop.
**Never write a row for today** — the day is not over and the number would be wrong.

**Timezone.** Chicago is UTC-5 during daylight saving, UTC-6 outside it. DST runs
from the second Sunday in March to the first Sunday in November. Compute the offset
for the dates you are processing; do not hardcode it. A local day runs from
`05:00:00Z` that morning to `05:00:00Z` the next (or `06:00Z` in winter).

### 2. Pull the orders from Shopify

```graphql
{
  orders(first: 100, query: "created_at:>=<START_UTC> created_at:<<END_UTC>", sortKey: CREATED_AT) {
    nodes {
      name
      createdAt
      displayFinancialStatus
      currentTotalPriceSet { shopMoney { amount } }
      publication { name }
      customAttributes { key value }
      lineItems(first: 20) { nodes { title quantity } }
    }
  }
}
```

**Three traps, all of which have bitten this task before:**

1. **Do not use a `sales_channel:` filter in the query string.** Shopify does not
   support it on order search. It does not error — it silently returns **zero
   results**, which looks exactly like a quiet day. Pull all orders for the window
   and filter on `publication.name` in your own code.

2. **`first: 100` is a hard cap and this store exceeds it on a busy day.** If you
   get back 100 nodes, you are almost certainly truncated. Check whether the last
   node's `createdAt` reaches the end of your window; if it does not, query again
   from that timestamp forward until it does. Silently losing the tail of a day
   understates revenue badly — a real run lost 17 orders this way.

3. **Do not try ShopifyQL / `run-analytics-query` for this.** There is no column for
   sales channel or API client that works here; `sales_channel_name` and
   `api_client_name` both return "Column Not Found". Use GraphQL and aggregate
   locally.

### 3. Filter and aggregate, per day

Keep an order only if **both**:

- `publication.name == "Biohacking Bombshell"`, and
- `displayFinancialStatus == "PAID"`.

**On financial status.** `EXPIRED` means the payment authorization lapsed and **no
money was collected** — exclude it from both the order count and revenue. `REFUNDED`
orders come back with a `$0.00` current total; excluding them is right, since the
revenue is gone. `PENDING` or `AUTHORIZED` are genuinely in-flight — exclude them
too, and name them in Notes so the number can be reconciled later if they settle.

Then per day compute:

- **Orders** — count of kept orders.
- **Revenue** — sum of `currentTotalPriceSet.shopMoney.amount`, rounded to 2dp.
  This is the *current* total, so it already reflects refunds and edits.
- **Top Products** — count how many kept orders contain each `lineItems` title
  (count orders containing the product, not units sold), and take the top 3–4 as a
  comma-separated string.

**Whenever you exclude anything, say so in Notes with the order numbers and the
dollar amount.** A number nobody can reconcile is worse than no number.

### 4. Landing-page attribution (for the Notes)

Orders created from the storefront carry cart attributes that ride through to the
order:

- `_bb_source` = `biohacking-bombshell-webflow`
- `_bb_landing_page` = the path the shopper first added to cart from — `/`,
  `/parasite-power-duo`, `/full-moon-para-kit`, `/drainage-duo`,
  `/parasite-starter-duo`

This is **first touch**, set once at cart creation. Tally it and put the breakdown in
Notes — it is the only way to tell which of the hidden quiz landing pages actually
produce sales.

Only carts created from **2026-09-04 onward** have these attributes. Older orders and
a few edge cases have none; count those as `/` unknown rather than dropping them, and
never let a missing attribute exclude an order from revenue.

### 5. Write the rows

```
mcp__Airtable__create_records_for_table
  baseId  appWAGk5yDbYUgF6s
  tableId tblCmfoI3T3PdNVnG
```

| Field | Field ID | Value |
|---|---|---|
| Date | `fldFBjES1yVA0VhDw` | `YYYY-MM-DD` (Chicago local date) |
| Orders | `fld7BI9IKUKycmWhp` | integer |
| Revenue | `fldTwrQPAvfNV2m33` | number, 2dp |
| Top Products | `fldjw1prhAZZxefTv` | comma-separated string |
| Notes | `fldYVERN6rhqQbhE3` | exclusions, landing pages, anything unusual |
| Visitors | `fldT2nWYJLRSA5tkC` | **leave empty** — see below |

**Do not write AOV (`fldEtZO2DtBWXu8Ao`) or Conversion % (`fld2snJuGrgYKjkgk`).**
Both are formula fields. Airtable computes them; writing them will fail.

**Leave Visitors empty.** There is no analytics tool on the Webflow site, so no
visitor data exists anywhere to pull. Do not estimate it, and do not infer it from
order counts. Conversion % stays blank as a consequence, by design. If GA4 or
Plausible is ever installed, this step is where visitor counts get added.

**Never write a duplicate date.** Step 1 exists to prevent this. If you find a date
you were about to write already present, update that record with
`mcp__Airtable__update_records_for_table` instead of creating a second one.

### 6. Report

State per day: date, orders, revenue, AOV, and anything you excluded. If a day had
zero qualifying orders, still write the row with `0` / `0` — a real zero and a
missed run must not look the same in the table.

---

## Reference

| | |
|---|---|
| Airtable base | `appWAGk5yDbYUgF6s` — "BB Storefront Analytics" |
| Airtable table | `tblCmfoI3T3PdNVnG` — "Daily Metrics" |
| Shopify store | `dr-jaban-moore-store.myshopify.com` (shared with Dr. Jaban) |
| Storefront | `https://biohacking-bombshell-estore.webflow.io` |
| Timezone | America/Chicago |

**Connectors required: Shopify and Airtable.** Both must be attached to the
scheduled task itself, not just enabled on the account. A run without them will
appear to succeed and change nothing — if the Shopify or Airtable tools are not
available, stop and say so plainly rather than reporting a successful sync.

## Known trap, do not repeat

`abandonedCheckouts.completedAt` comes back **null even for checkouts that clearly
converted** — one created at 21:28:35 for $244.60 matched an order placed 40 seconds
later for the same amount, and still showed null. Do **not** publish a cart
abandonment rate from that field without reconciling against orders first. It
overstates dropoff badly.
