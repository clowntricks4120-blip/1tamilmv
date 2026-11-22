#!/usr/bin/env python3
# language: Python 3, file: scripts/backfill_posters.py
"""
Backfill missing posters for already-scraped movies.
Queries Supabase for movies where poster_url is null or empty,
fetches their source_url, extracts poster, updates row.

Env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""
import os, re, sys, time
import requests
from bs4 import BeautifulSoup
from supabase import create_client

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
HEADERS = {'User-Agent': UA, 'Accept-Encoding': 'identity', 'Referer': 'https://www.1tamilmv.ceo/'}

sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
sess = requests.Session(); sess.headers.update(HEADERS)

POSTER_HOSTS = (
    'pbs.twimg.com', 'm.media-amazon.com', 'image.tmdb.org',
    'i.ibb.co', 'imgbb.com', 'i.postimg.cc', 'postimg.cc',
    'img.imageride.net', 'img1.imageride.net',
)
SCREENSHOT_HINTS = (
    'vlcsnap', 'screenshot', 'snap-', 'thumb-', 'preview',
    'telegram', 't.me',
)

def absolutize(raw, origin):
    raw = raw.strip()
    if raw.startswith('http://') or raw.startswith('https://'):
        return raw
    if raw.startswith('//'):
        return 'https:' + raw
    if raw.startswith('/'):
        return origin + raw
    return origin + '/' + raw

def _normalize(src):
    if 'pbs.twimg.com/media/' in src:
        if 'name=' in src:
            return re.sub(r'name=[^&]+', 'name=large', src)
        return src + ('&' if '?' in src else '?') + 'name=large'
    if 'imageride.net' in src:
        return re.sub(r'\.(?:th|md|lg)\.', '.', src)
    if 'postimg' in src:
        return src.replace('/th/', '/')
    return src

def _img_src(img):
    src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or ''
    src = src.strip()
    if not src or src.startswith('data:'):
        return None
    parent = img.parent
    if parent is not None and getattr(parent, 'name', None) == 'a':
        href = (parent.get('href') or '').strip()
        if href and re.search(r'\.(jpg|jpeg|png|webp|gif)(\?|$)', href, re.I):
            return _normalize(href)
    return _normalize(src)

def find_poster(soup, origin):
    body = soup.select_one(
        'article.cPost, .cPost_contentWrap, [data-role="commentContent"], .ipsType_richText'
    ) or soup

    candidates = []
    hit = False

    def walk(el):
        nonlocal hit
        if hit:
            return
        for child in el.children:
            if hit:
                return
            if isinstance(child, str):
                if child.strip() and re.search(r'telegram\s*channel', child, re.I):
                    hit = True
                    return
            elif hasattr(child, 'name'):
                if child.name == 'img':
                    src = _img_src(child)
                    if src:
                        candidates.append(absolutize(src, origin))
                elif child.name not in ('script', 'style', 'noscript'):
                    walk(child)

    walk(body)

    if not candidates:
        for img in body.find_all('img'):
            src = _img_src(img)
            if src:
                candidates.append(absolutize(src, origin))

    if not candidates:
        return None

    ordered = list(reversed(candidates)) if hit else candidates

    for src in ordered:
        low = src.lower()
        if any(h in low for h in POSTER_HOSTS) and not any(s in low for s in SCREENSHOT_HINTS):
            return src

    for src in ordered:
        if not any(s in src.lower() for s in SCREENSHOT_HINTS):
            return src

    return ordered[0]

def main():
    res = sb.table('movies').select('id, source_url, poster_url') \
        .not_.is_('source_url', 'null').execute()
    rows = res.data or []

    # filter rows where poster_url is null or empty string
    missing = [r for r in rows if not r.get('poster_url')]
    print(f'[*] {len(missing)} movies missing poster')

    updated = 0
    errors = 0

    for row in missing:
        try:
            r = sess.get(row['source_url'], timeout=25)
            if r.status_code != 200:
                print(f'  [!] {row["id"]}: HTTP {r.status_code}')
                errors += 1
                continue

            soup = BeautifulSoup(r.text, 'html.parser')
            m = re.match(r'^(https?://[^/]+)', r.url)
            origin = m.group(1) if m else 'https://www.1tamilmv.ceo/'

            poster = find_poster(soup, origin)
            if poster:
                sb.table('movies').update({'poster_url': poster}).eq('id', row['id']).execute()
                updated += 1
                print(f'  [+] {row["id"]}: poster set')
            else:
                print(f'  [-] {row["id"]}: no poster found')

            time.sleep(0.4)
        except Exception as e:
            print(f'  [!] {row["id"]}: {e}', file=sys.stderr)
            errors += 1

    print(f'[done] {updated}/{len(missing)} posters updated · {errors} errors')

if __name__ == '__main__':
    main()
