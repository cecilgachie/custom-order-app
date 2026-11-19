# Managing the Vatican Cake Point menu

You manage the menu from the Supabase dashboard. Changes appear in the app the next time a customer opens or refreshes Home. No app update is needed.

## One-time setup

1. Run `migrations/20261106000000_catalog_images.sql` in the **SQL Editor**.
2. In your project folder, install the image cache package: `npx expo install expo-image`

## Preparing a photo

| | |
|---|---|
| Shape | Portrait, **4:5** (for example 1200 x 1500 px). Keep every cake the same shape so the grid looks tidy. |
| Format | JPEG or WebP (PNG works but is much larger) |
| Size | **Under 1 MB** (aim for 150 to 300 KB). Larger files are rejected. |
| File name | Lowercase, no spaces: `chocolate-drip.jpg`, `red-velvet-2tier.jpg`. Never reuse a name for a different cake. |
| Content | Your own photos of your own cakes, with the cake centred and the bottom third not too busy (the title overlays it). |

Free tools for resizing: squoosh.app (compress) and any phone photo editor (crop 4:5).

## Adding a cake

1. **Dashboard > Storage > `cake-images` > Upload file.** Upload the photo.
2. **Dashboard > Table Editor > `cake_catalog` > Insert row.** Fill in:

| Column | What to enter |
|---|---|
| `title` | Cake name, e.g. `Chocolate Drip Celebration` |
| `description` | One or two sentences. The card shows the first two lines, the detail page shows all of it. |
| `base_flavor` | e.g. `Chocolate` |
| `default_weight_kg` | Usual size, e.g. `1.5` |
| `image_url` | **Just the file name you uploaded**, e.g. `chocolate-drip.jpg` (a full web address also works) |
| `category` | `Wedding`, `Birthday`, `Cupcakes` or `Custom` (these are the filter chips on Home) |
| `is_active` | `true` to show it, `false` to hide it without deleting |
| `sort_order` | Smaller numbers appear first: `10`, `20`, `30`... Leave gaps so you can slot cakes in later. |
| `ingredients` | Comma separated: `Butter, Free range eggs, Dark chocolate, Fresh cream` |
| `lead_time_hours` | Notice needed, e.g. `48`. Empty means 48. |
| `tiers`, `layers`, `finish` | Shown in the "Structure" section. Empty uses the defaults (1, 3, Buttercream). |

3. Open the app, pull down on Home to refresh. The cake appears.

## Changing or hiding a cake

- **Fix a typo or price-related text:** edit the row. Done.
- **Replace a photo:** upload the new photo with a **new** file name, then change `image_url`. (Phones cache photos, so reusing the same name can show the old picture for a while.)
- **Take a cake off the menu:** set `is_active` to `false`. Existing orders keep working.
- **Reorder:** change `sort_order`.

## Adding several cakes at once (optional)

In the SQL Editor:

```sql
insert into public.cake_catalog
  (title, description, base_flavor, default_weight_kg, image_url, category, sort_order, ingredients, finish)
values
  ('Chocolate Drip Celebration', 'Rich chocolate sponge with a glossy ganache drip and fresh berries.',
   'Chocolate', 1.5, 'chocolate-drip.jpg', 'Birthday', 10,
   'Butter, Free range eggs, Dark chocolate, Fresh cream', 'Chocolate drip'),
  ('Vanilla Rose Wedding Tier', 'Three delicate vanilla tiers finished with sugar roses.',
   'Vanilla', 3, 'vanilla-rose-wedding.jpg', 'Wedding', 20,
   'Butter, Free range eggs, Madagascan vanilla, Cream cheese', 'Buttercream');
```

## If a photo does not appear

1. The file name in `image_url` must match the uploaded file exactly, including `.jpg` and capital letters.
2. Open **Storage > cake-images**, click the file, and use **Get URL**. The link must open the picture in a browser. If it says "not found", the name is wrong. If it asks you to sign in, the bucket is not public (re-run the migration).
3. Photos over 1 MB are rejected on upload. Compress and try again.
4. While loading, or if a photo is missing, the app shows a gold cake icon. A missing photo never crashes the app.

## Prices

All cakes use one price rule: KES 2,200 per kg, times the size factor. There are no per-cake prices in v1, so editing a description or photo can never change what customers are charged.
