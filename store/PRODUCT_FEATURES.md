# Product releases, photos and variants

## Deploy

Run from the `store` directory, before deploying the updated Worker:

```powershell
npx wrangler d1 execute fpvgate-store-db --remote --file=migrations/0006_product_releases_variants.sql
npx wrangler deploy
```

Deploy the static site after the Worker. The migration adds columns; existing products remain published and have no variants. Run the migration once.

## Admin workflow

- In Add Product or Edit Product, choose Published now, Draft, or Scheduled release.
- For Scheduled release, enter the date and time in your computer's local timezone. The API stores UTC and checks visibility at request time, without a scheduled deployment. Customers see the release when they load or refresh the storefront.
- Save the product, reopen Edit, and click Preview storefront (saved content). This opens a separate tab showing active products including drafts and scheduled releases. Preview requires your admin session, disables purchases, and does not add products to recently viewed history. Exit preview returns to the public view. Archived products stay hidden.
- Use Make main on any image before creating the product or in the saved product's image gallery. Saved image selection takes effect immediately. The main image is also used for Stripe checkout.
- Enable variants to add names and GBP prices, for example DIY Kit and Pre assembled. Disable variants for a single-price product. Stock, purchase limits, weight and pre-order settings are shared across all variants. Variant IDs remain stable when names or prices change.
- Customers must choose a variant before adding it to their cart. Cart lines and order names include the variant; checkout validates the selection and gets the price from the database.

Static social preview pages are generated separately from the public catalogue by the existing Pages workflow, so their metadata may update after the release. Storefront availability itself changes at the configured time.

## Featured homepage product

Enable Featured in the product editor and save. The homepage leads with that product, using its main image, description, price and a View product button. If several products are featured, the most recently edited visible product leads. With no featured products, the hero stays hidden. Drafts and unreleased products qualify only in admin preview. The New to the Store strip is independently ordered by newest products.

## Verification

From the repository root (Node 24 with built-in SQLite):

```powershell
node --test scripts/test_store_features.cjs scripts/test_product_creation.cjs scripts/test_product_links.cjs scripts/test_store_featured.cjs
python scripts/test_product_previews.py
```
