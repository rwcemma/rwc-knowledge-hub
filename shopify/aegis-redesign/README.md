# Aegis Formulas: storefront redesign (CellCore-inspired)

Source for the files added to or changed in the unpublished Shopify theme
**"Aegis Redesign (CellCore-style) – Claude"** (theme ID `188199534766`), a copy
of the live `aegis-theme`. Nothing here touches the live theme.

Preview: https://shop.aegisformulas.com/?preview_theme_id=188199534766

## What changed
- `assets/af-refresh.css`: site-wide styling. Fraunces serif headings, Inter body text,
  pill buttons, rounded product cards on a cream background, a frosted sticky header,
  a navy footer, and polish for product pages. Uses the existing Aegis colors
  (navy `#1c3140`, gold `#a7895f`, cream).
- `layout/theme.liquid`: loads the fonts and stylesheet. It also **removes the old
  homepage → `/collections/products` redirect**, so the new homepage shows
  (instructions to restore it are in a comment).
- `sections/af-*.liquid`: new sections you can edit in the theme editor:
  Hero, Trust bar, Product grid, Features, Story, Testimonials, CTA band.
- `templates/index.json`: new homepage. Hero → trust bar → popular products → science
  → founder story → testimonial → video → apps → CTA → newsletter.
- `templates/collection.json`: collection banner turned on, square images,
  trust bar and CTA added under the grid.

## Going live
In Shopify admin, open Online Store → Themes, preview this theme, then **Publish** it.
Shopify keeps the current theme, so you can roll back with one click.
