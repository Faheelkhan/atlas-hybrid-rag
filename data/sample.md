# Brand Tijara — internal notes (sample corpus)

Brand Tijara tracks live retail sales across Pakistani brands. The catalogue is
refreshed daily and every listing links back to the originating store.

## Pricing

Prices are stored in PKR as integers, never floats. A pair of Parishfootwear
velvet formal loafers is listed at PKR 4,800, discounted from PKR 6,000, which
is a 20% reduction. The MA667 model is PKR 6,400 down from PKR 8,000.

Discount percentages are recomputed on every ingest rather than stored, because
brands frequently change the original price without changing the sale price.

## Ingestion

Each brand has its own adapter. Shopify-backed storefronts share a common
adapter that reads the products JSON endpoint; the rest are bespoke. Adapters
run daily and write into a staging collection before promotion.

Deduplication is by normalised product URL, not by title. Titles vary between
listing pages and product pages for the same item.

## Alerts

Users subscribe to a brand and receive an email plus a web push notification
when that brand starts a sale. Alerts are debounced to one per brand per day so
that a brand adding items to an existing sale does not spam subscribers.
