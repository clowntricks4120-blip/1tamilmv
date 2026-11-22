#!/usr/bin/env python3
# language: Python 3, file: scripts/scrape_tamilmv.py
"""
1tamilmv -> Supabase scraper.
Cron-friendly: only fetches topic_ids NOT already in the movies table.
Existing rows are never re-fetched or modified (title, downloads, poster
all frozen once a row is created).

FORCE_RESCAN=1 env: re-fetch every topic on the home page, updating existing
rows. Use once for a poster backfill, then set back to 0.

env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  MAX_THREADS (default 30)
  FORCE_RESCAN (default 0)
"""
import os, re, sys, time
import requests
from bs4 import BeautifulSoup
from supabase import create_client

HOME    = 'https://1tamilmv.io/'
UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
HEADERS = {'User-Agent': UA, 'Accept-Encoding': 'identity', 'Referer': HOME}
MAX_T   = int(os.environ.get('MAX_THREADS', '30'))
FORCE   = os.environ.get('FORCE_RESCAN', '0') == '1'

LANG_MAP = {
    'tam': 'Tamil', 'tamil': 'Tamil',
    'tel': 'Telugu', 'telugu': 'Telugu',
    'hin': 'Hindi', 'hindi': 'Hindi',
    'mal': 'Malayalam', 'malayalam': 'Malayalam',
    'kan': 'Kannada', 'kannada': 'Kannada',
    'eng': 'English', 'english': 'English',
    'kor': 'Korean', 'jap': 'Japanese', 'chi': 'Chinese',
}

FORMAT_PATTERNS = [
    ('4K',     r'\b(2160p|4k|uhd)\b'),
    ('2K',     r'\b(1440p|2k)\b'),
    ('1080p',  r'\b1080p\b'),
    ('720p',   r'\b720p\b'),
    ('480p',   r'\b(480p|400mb|500mb)\b'),
    ('CAM',    r'\b(cam|hdcam)\b'),
    ('TC',     r'\b(tc|hdtc)\b'),
    ('BluRay', r'\b(blu-?ray|bdrip|brrip)\b'),
    ('WEB-DL', r'\b(web-?dl|webrip|web)\b'),
    ('HD',     r'\b(hdrip|hd)\b'),
]

TEMPLATE_IMG = (
    'torrborder', 'utorrent', 'logo.png', 'logo.jpg', 'logo.svg',
    'smiley', 'emoticon', 'twemoji', 'jsdelivr.net/gh/twitter',
    'default_photo', 'avatar', 'icon_', 'telegram', 't.me',
    'telegram-icon', 'channel-icon',
)

POSTER_HOSTS = (
    'pbs.twimg.com',
    'm.media-amazon.com',
    'image.tmdb.org',
    'i.ibb.co',
    'imgbb.com',
    'i.postimg.cc',
    'postimg.cc',
    'img.imageride.net',
    'img1.imageride.net',
)

SCREENSHOT_HINTS = (
    'vlcsnap', 'screenshot', 'snap-', 'thumb-', 'preview',
)

TELEGRAM_ANCHOR = re.compile(r'telegram\s*channel', re.I)

sb   = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
sess = requests.Session()
sess.headers.update(HEADERS)


# ---------- fetch ----------

def fetch_with_origin(url, timeout=25):
    r = sess.get(url, timeout=timeout)
    r.raise_for_status()
    m = re.match(r'^(https?://[^/]+)', r.url)
    origin = m.group(1) if m else 'https://www.1tamilmv.ceo'
    return r.text, origin


def absolutize(raw, origin):
    raw = raw.strip()
    if raw.startswith('http://') or raw.startswith('https://'):
        return raw
    if raw.startswith('//'):
        return 'https:' + raw
    if raw.startswith('/'):
        return origin + raw
    return origin + '/' + raw


# ---------- home parse ----------

def topic_urls(home_html, origin):
    soup = BeautifulSoup(home_html, 'html.parser')
    out, seen = [], set()
    for a in soup.select('a[href*="/forums/topic/"]'):
        raw = a['href'].split('#')[0].strip()
        if not raw:
            continue
        m = re.search(r'/forums/topic/(\d+)', raw)
        if not m:
            continue
        tid = int(m.group(1))
        if tid in seen:
            continue
        seen.add(tid)
        out.append((tid, absolutize(raw, origin)))
    return out


# ---------- poster ----------

def _img_src(img):
    src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or ''
    src = src.strip()
    if not src or src.startswith('data:'):
        return None
    return src


def _is_template(src):
    low = src.lower()
    return any(t in low for t in TEMPLATE_IMG)


def _is_too_small(img):
    try:
        w = int(str(img.get('width', '0')).replace('px', '').strip() or 0)
        h = int(str(img.get('height', '0')).replace('px', '').strip() or 0)
        if w and w < 80: return True
        if h and h < 80: return True
    except Exception:
        pass
    return False


def find_poster(soup, origin):
    body = soup.select_one(
        'article.cPost, '
        '.cPost_contentWrap, '
        '[data-role="commentContent"], '
        '.ipsType_richText'
    ) or soup

    images_before_anchor = []
    hit_anchor = False

    for el in body.descendants:
        if hit_anchor:
            break

        if getattr(el, 'name', None) == 'img':
            src = _img_src(el)
            if not src or _is_template(src) or _is_too_small(el):
                continue
            images_before_anchor.append(absolutize(src, origin))
            continue

        if getattr(el, 'name', None) in ('p', 'div', 'span', 'a', 'font', 'strong', 'b', 'center'):
            try:
                text = el.get_text(' ', strip=True)
            except Exception:
                text = ''
            if text and TELEGRAM_ANCHOR.search(text) and images_before_anchor:
                hit_anchor = True

    if images_before_anchor:
        for src in images_before_anchor:
            low = src.lower()
            if any(h in low for h in POSTER_HOSTS) and not any(s in low for s in SCREENSHOT_HINTS):
                return src
        for src in images_before_anchor:
            if not any(s in src.lower() for s in SCREENSHOT_HINTS):
                return src
        return images_before_anchor[0]

    candidates = []
    for img in body.find_all('img'):
        src = _img_src(img)
        if not src or _is_template(src) or _is_too_small(img):
            continue
        candidates.append(absolutize(src, origin))

    for src in candidates:
        low = src.lower()
        if any(h in low for h in POSTER_HOSTS) and not any(s in low for s in SCREENSHOT_HINTS):
            return src

    for src in candidates:
        if not any(s in src.lower() for s in SCREENSHOT_HINTS):
            return src

    return candidates[0] if candidates else None


# ---------- thread parse ----------

def normalize_langs(blob):
    found = set()
    for tok in re.split(r'[+,\/|\[\]\(\)\s]+', blob):
        t = tok.strip().lower()
        if t in LANG_MAP:
            found.add(LANG_MAP[t])
    return sorted(found)


def detect_format(text):
    t = text.lower()
    for label, pat in FORMAT_PATTERNS:
        if re.search(pat, t):
            return label
    return 'HD'


def parse_thread(tid, url, html, origin):
    soup = BeautifulSoup(html, 'html.parser')

    h1 = soup.find('h1')
    title = h1.get_text(strip=True) if h1 else ''
    if not title:
        t = soup.find('title')
        title = t.get_text(strip=True) if t else f'topic {tid}'

    ym = re.search(r'\((\d{4})\)', title)
    year = int(ym.group(1)) if ym else None

    poster = find_poster(soup, origin)
    downloads = extract_downloads(soup)
    blob = ' '.join((d.get('langs', '') + ' ' + d.get('header', '')) for d in downloads)
    langs = normalize_langs(blob) or normalize_langs(title)

    return {
        'topic_id':   tid,
        'title':      title,
        'year':       year,
        'poster_url': poster,
        'downloads':  downloads,
        'languages':  langs,
        'source_url': url,
    }


def extract_downloads(soup):
    downloads, seen = [], set()
    for mg in soup.select('a[href^="magnet:"]'):
        href = mg.get('href', '')
        if not href or href in seen:
            continue
        seen.add(href)

        row = mg
        for _ in range(6):
            if row.parent and row.parent.name in ('p', 'div', 'article'):
                row = row.parent
            else:
                break

        header = ''
        node = mg
        for _ in range(10):
            if node.previous_sibling:
                node = node.previous_sibling
            elif node.parent:
                node = node.parent
            else:
                break
            txt = node.get_text(' ', strip=True) if hasattr(node, 'get_text') else str(node)
            if re.search(r'\b(1080p|720p|480p|2160p|4K|BR-?Rip|Blu-?Ray|WEB-?DL|HD-?Rip)\b', txt, re.I) \
               and re.search(r'\b\d+(\.\d+)?\s?(GB|MB)\b', txt, re.I):
                header = txt.strip()
                break

        quality = size = langs = ''
        if header:
            qm = re.search(r'\b(2160p|1080p|720p|480p|4K|BR-?Rip|Blu-?Ray|WEB-?DL|HD-?Rip|HDRip)\b', header, re.I)
            sm = re.search(r'\b(\d+(?:\.\d+)?\s?(?:GB|MB))\b', header, re.I)
            lm = re.search(r'\[([^\]]*(?:Tamil|Hindi|Telugu|Malayalam|Kannada|Eng|Tam|Hin|Tel)[^\]]*)\]', header, re.I)
            quality = qm.group(1) if qm else ''
            size    = sm.group(1) if sm else ''
            langs   = lm.group(1) if lm else ''

        fmt = detect_format(header or quality or '')
        tier = '720p'
        if re.search(r'2160|4k', quality, re.I): tier = '4K'
        elif re.search(r'1440|2k', quality, re.I): tier = '2K'
        elif re.search(r'1080', quality): tier = '1080p'
        elif re.search(r'720', quality): tier = '720p'
        elif re.search(r'480', quality): tier = '480p'

        torrent_url = direct_url = None
        if hasattr(row, 'find_all'):
            for a in row.find_all('a'):
                txt = a.get_text(' ', strip=True)
                hh  = a.get('href', '')
                if not torrent_url and (hh.endswith('.torrent') or 'attachment.php' in hh):
                    torrent_url = hh
                if 'DIRECT LINK' in txt.upper() and not direct_url:
                    direct_url = hh

        downloads.append({
            'quality': quality, 'size': size, 'langs': langs,
            'header': header, 'format': fmt, 'tier': tier,
            'magnet': href, 'torrent_url': torrent_url, 'direct_url': direct_url,
        })

    order = {'4K': 0, '2K': 1, '1080p': 2, '720p': 3, '480p': 4}
    downloads.sort(key=lambda d: order.get(d['tier'], 99))
    return downloads


# ---------- main ----------

def main():
    print(f'[*] FORCE_RESCAN={FORCE}')
    print('[*] fetching home')
    home_html, origin = fetch_with_origin(HOME)
    print(f'[*] origin after redirect: {origin}')

    topics = topic_urls(home_html, origin)
    print(f'[*] {len(topics)} topics on home')

    # what's already in DB for those ids
    existing = {}
    try:
        ids = [t[0] for t in topics]
        resp = sb.table('movies').select('topic_id,poster_url').in_('topic_id', ids).execute()
        existing = {r['topic_id']: r for r in resp.data}
    except Exception as e:
        print(f'[!] existing lookup failed: {e}', file=sys.stderr)

    if FORCE:
        # backfill mode: re-scan everything, but only overwrite poster if ours was missing
        todo = topics
        print(f'[*] FORCE mode — re-scanning all {len(todo)} topics')
    else:
        # normal mode: only new topic_ids not yet in DB
        todo = [t for t in topics if t[0] not in existing]
        print(f'[*] {len(todo)} NEW topics to scrape, {len(existing)} already in DB (skipped)')

    if not todo:
        print('[+] nothing new. exit.')
        return

    processed = 0
    errors = 0

    for tid, url in todo[:MAX_T]:
        try:
            page = sess.get(url, timeout=25)
            if page.status_code != 200:
                print(f'  [!] {tid}: HTTP {page.status_code}', file=sys.stderr)
                errors += 1
                continue

            rec = parse_thread(tid, url, page.text, origin)

            row = {
                'topic_id':       rec['topic_id'],
                'title':          rec['title'],
                'year':           rec['year'],
                'languages':      rec['languages'],
                'downloads':      rec['downloads'],
                'source_url':     rec['source_url'],
                'genres':         [],
                'synopsis':       '',
                'official_links': [],
                'featured':       False,
                'published':      True,
            }
            if rec['poster_url']:
                row['poster_url'] = rec['poster_url']

            # in FORCE mode: only set poster_url if prior row has none
            prior = existing.get(tid) or {}
            if FORCE and prior.get('poster_url') and not rec['poster_url']:
                row.pop('poster_url', None)

            sb.table('movies').upsert(row, on_conflict='topic_id').execute()
            print(f'[+] {tid}  poster={"yes" if rec["poster_url"] else "no"}  dls={len(rec["downloads"])}')
            processed += 1
            time.sleep(0.4)
        except Exception as e:
            print(f'  [!] {tid}: {e}', file=sys.stderr)
            errors += 1

    print(f'[+] {processed}/{min(len(todo), MAX_T)} processed · {errors} errors')


if __name__ == '__main__':
    main()
