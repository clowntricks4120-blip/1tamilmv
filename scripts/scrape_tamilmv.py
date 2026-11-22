#!/usr/bin/env python3
# language: Python 3, file: scripts/scrape_tamilmv.py
"""
1tamilmv -> Supabase scraper.
Poster detection: first non-template image inside the post body, preferring
known poster hosts (Amazon, TMDB, imageride, imgbb, postimg). Falls back to
the first large image, skipping screenshots and template chrome.

Priority order in main(): topics WITHOUT a poster_url in DB get fetched first,
so a single run with MAX_THREADS=300 backfills every missing poster.

env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  MAX_THREADS (default 60)
"""
import os, re, sys, time
import requests
from bs4 import BeautifulSoup
from supabase import create_client

HOME    = 'https://1tamilmv.io/'
UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
HEADERS = {'User-Agent': UA, 'Accept-Encoding': 'identity', 'Referer': HOME}
MAX_T   = int(os.environ.get('MAX_THREADS', '60'))

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
    'torrborder', 'utorrent', 'logo.png', 'logo.jpg',
    'smiley', 'emoticon', 'twemoji', 'jsdelivr.net/gh/twitter',
    'default_photo', 'avatar', 'icon_',
)

POSTER_HOSTS = (
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

def find_poster(soup, origin):
    """Return absolute URL of the best poster candidate, or None."""
    # try post-body containers first
    containers = soup.select(
        'article.cPost, '
        '.cPost_contentWrap, '
        '[data-role="commentContent"], '
        '.ipsType_richText, '
        '.cPost_body, '
        '.ipsRichText'
    )

    imgs = []
    for c in containers:
        for img in c.find_all('img'):
            imgs.append(img)
    if not imgs:
        imgs = soup.find_all('img')

    # collect src (handle data-src for lazy load)
    candidates = []
    for img in imgs:
        src = img.get('src') or img.get('data-src') or ''
        if not src:
            continue
        low = src.lower()

        # skip template chrome
        if any(t in low for t in TEMPLATE_IMG):
            continue
        # skip tiny inline icons / data URIs
        if src.startswith('data:') or 'pixel' in low or 'spacer' in low:
            continue

        # get image dimensions if listed — skip icons
        w = img.get('width', '')
        h = img.get('height', '')
        try:
            if w and int(str(w).replace('px', '').strip() or 0) < 80:
                continue
            if h and int(str(h).replace('px', '').strip() or 0) < 80:
                continue
        except Exception:
            pass

        candidates.append(absolutize(src, origin))

    if not candidates:
        return None

    # 1. known poster hosts
    for src in candidates:
        if any(h in src.lower() for h in POSTER_HOSTS):
            # but reject imageride screenshots even on known hosts
            low = src.lower()
            if any(s in low for s in SCREENSHOT_HINTS):
                continue
            return src

    # 2. first non-screenshot image
    for src in candidates:
        if not any(s in src.lower() for s in SCREENSHOT_HINTS):
            return src

    # 3. last resort — first screenshot
    return candidates[0]


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
    print('[*] fetching home')
    home_html, origin = fetch_with_origin(HOME)
    print(f'[*] origin after redirect: {origin}')

    topics = topic_urls(home_html, origin)
    print(f'[*] {len(topics)} topics')

    # lookup existing rows for these topic_ids so we can prioritize
    existing = {}
    try:
        ids = [t[0] for t in topics]
        resp = sb.table('movies').select('topic_id,poster_url').in_('topic_id', ids).execute()
        existing = {r['topic_id']: r for r in resp.data}
    except Exception as e:
        print(f'[!] existing lookup failed: {e}', file=sys.stderr)

    def needs_poster(tid):
        row = existing.get(tid)
        return row is None or not row.get('poster_url')

    prioritized = ([t for t in topics if needs_poster(t[0])]
                 + [t for t in topics if not needs_poster(t[0])])

    no_poster_count = sum(1 for t in topics if needs_poster(t[0]))
    print(f'[*] {no_poster_count} topics still missing posters')

    processed = 0
    poster_fixed = 0

    for tid, url in prioritized[:MAX_T]:
        try:
            print(f'[>] {tid} {url}')
            page = sess.get(url, timeout=25)
            if page.status_code != 200:
                print(f'  [!] {tid}: HTTP {page.status_code}', file=sys.stderr)
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

            prior = existing.get(tid) or {}
            if rec['poster_url']:
                row['poster_url'] = rec['poster_url']
                if not prior.get('poster_url'):
                    poster_fixed += 1
            elif prior.get('poster_url'):
                row['poster_url'] = prior['poster_url']
            # else leave unset — grid shows placeholder

            sb.table('movies').upsert(row, on_conflict='topic_id').execute()
            processed += 1
            time.sleep(0.4)
        except Exception as e:
            print(f'  [!] {tid}: {e}', file=sys.stderr)

    print(f'[+] {processed}/{min(len(prioritized), MAX_T)}')
    print(f'[+] {poster_fixed} posters newly added')


if __name__ == '__main__':
    main()
