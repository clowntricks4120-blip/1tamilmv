# 1TamilMV — Dark Movie Discovery Platform

A React + Vite + Supabase starter for a lawful movie catalogue. It provides public movie discovery and a protected admin area for managing metadata, posters, official trailers and official streaming destinations.

## Included
- Responsive dark / AMOLED-style interface
- Movie search and language filters
- Movie detail pages
- Supabase authentication for admin sign-in
- Admin allowlist (`admin_users`) enforced by database RLS
- Add, edit, delete, publish and feature movie entries
- Bulk JSON import
- Official trailer and streaming destination fields
- Vite production build configuration

## Not included
The original repository contained a scraper that extracted magnet/torrent/direct-download links from a third-party source. This starter does not implement unauthorized scraping or distribution. It is designed for metadata and links to authorized/official destinations.

## Setup
1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. In Supabase Authentication, create an admin user with email and password.
4. Run the final SQL comment from `schema.sql`, replacing `YOUR_ADMIN_EMAIL`, to add that user to `admin_users`.
5. Copy `.env.example` to `.env` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Install and run:

```bash
npm install
npm run dev
```

7. Open `/admin/login` and sign in.

## Build
```bash
npm run build
npm run preview
```

## Bulk import JSON format
```json
[
  {
    "title": "Example Film",
    "year": 2026,
    "poster_url": "https://example.com/poster.jpg",
    "languages": ["Tamil"],
    "genres": ["Drama", "Thriller"],
    "synopsis": "A short description.",
    "trailer_url": "https://www.youtube.com/watch?v=...",
    "official_links": [
      { "label": "Official streaming service", "url": "https://example.com/title" }
    ],
    "featured": false,
    "published": false
  }
]
```

## Deploy
Build with `npm run build`; deploy the generated `dist/` folder to Cloudflare Pages. Add the two Vite environment variables in Cloudflare Pages project settings. Configure SPA fallback by adding `public/_redirects` (already included) or equivalent Cloudflare Pages routing.

Never put the Supabase service-role key in frontend environment variables.
