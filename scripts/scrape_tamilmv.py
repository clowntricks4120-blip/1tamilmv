#!/usr/bin/env python3
# language: Python 3, file: scripts/scrape_tamilmv.py
"""
1tamilmv -> Supabase.
Runs in GitHub Actions with SUPABASE_SERVICE_ROLE_KEY.
Also backfills missing posters for old rows — no separate script needed.
"""
import os, re, sys, time
import requests
from bs4 import BeautifulSoup
from supabase import create_client

BASE    = 'https://www.1tamilmv.io'
HOME    = 'https://1tamilmv.io/'
UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
HEADERS = {'User-Agent': UA, 'Accept-Encoding': 'identity', 'Referer': BASE + '/'}
MAX_T   = int(os.environ.get('MAX_THREADS', '30'))

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

sb   = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
sess = requests.Session()
sess.headers.update(HEADERS)


def fetch(url, timeout=25):
    r = sess.get(url, timeout=timeout)
    r.raise_for_status()
    return r.text


def topic_urls(home_html):
    soup = BeautifulSoup(home_html, 'html.parser')
    out, seen = [], set()
    for a in soup.select('a[href*="/forums/topic/"]'):
        href = a['href'].split('#')[0]
        m = re.search(r'/forums/topic/(\d+)-([^/]+)/?', href)
        if not m:
            continue
        tid = int(m.group(1))
        if tid in seen:
            continue
        seen.add(tid)
        out.append((tid, f'https://www.1tamilmv.io/forums/topic/{m.group(1)}-{m.group(2)}/'))
    return out


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


def detect_tier(text):
    t = (text or '').lower()
    if re.search(r'2160|4k|uhd', t):
        return '4K'
    if re.search(r'1440|2k', t):
        return '2K'
    if re.search(r'1080', t):
        return '1080p'
    if re.search(r'720', t):
        return '720p'
    if re.search(r'480', t):
        return '480p'
    return None  # do not default to 720p


def parse_thread(tid, url, html):
    soup = BeautifulSoup(html, 'html.parser')
    h1 = soup.find('h1')
    title = h1.get_text(strip=True) if h1 else ''
    if not title:
        t = soup.find('title')
        title = t.get_text(strip=True) if t else f'topic {tid}'

    ym = re.search(r'\((\d{4})\)', title)
    year = int(ym.group(1)) if ym else None

    poster = None
    for img in soup.find_all('img'):
        src = img.get('src', '')
        if 'm.media-amazon.com' in src:
            poster = src
            break
    if not poster:
        for img in soup.find_all('img'):
            src = img.get('src', '')
            if 'imageride.net' in src and 'vlcsnap' in src:
                poster = src
                break

    downloads = extract_downloads(soup)
    blob = ' '.join((d.get('langs', '') + ' ' + d.get('header', '')) for d in downloads)
    langs = normalize_langs(blob) or normalize_langs(title)

    return {
        'topic_id': tid, 'title': title, 'year': year,
        'poster_url': poster, 'downloads': downloads,
        'languages': langs, 'source_url': url,
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
        tier = detect_tier(header or quality or '')  # None if unknown

        torrent_url = direct_url = None
        if hasattr(row, 'find_all'):
            for a in row.find_all('a'):
                txt = a.get_text(' ', strip=True)
                hh  = a.get('href', '')
                if hh.endswith('.torrent') and not torrent_url:
                    torrent_url = hh
                if 'DIRECT LINK' in txt.upper() and not direct_url:
                    direct_url = hh

        downloads.append({
            'quality': quality, 'size': size, 'langs': langs,
            'header': header, 'format': fmt, 'tier': tier,
            'magnet': href, 'torrent_url': torrent_url, 'direct_url': direct_url,
        })

    order = {'4K': 0, '2K': 1, '1080p': 2, '720p': 3, '480p': 4, None: 5}
    downloads.sort(key=lambda d: order.get(d['tier'], 99))
    return downloads


def backfill_missing_posters():
    """Fill poster_url for rows where poster is null but source_url exists."""
    try:
        res = sb.table('movies').select('id, source_url, poster_url') \
            .is_('poster_url', 'null').not_.is_('source_url', 'null').execute()
        rows = res.data or []
        if not rows:
            print('[*] No old rows need poster backfill.')
            return
        print(f'[*] Backfilling posters for {len(rows)} old rows...')
        for row in rows:
            try:
                html = fetch(row['source_url'])
                soup = BeautifulSoup(html, 'html.parser')
                poster = None
                for img in soup.find_all('img'):
                    src = img.get('src', '')
                    if 'm.media-amazon.com' in src:
                        poster = src
                        break
                if not poster:
                    for img in soup.find_all('img'):
                        src = img.get('src', '')
                        if 'imageride.net' in src and 'vlcsnap' in src:
                            poster = src
                            break
                if poster:
                    sb.table('movies').update({'poster_url': poster}).eq('id', row['id']).execute()
                    print(f'  [+] poster set for {row["id"]}')
                else:
                    print(f'  [-] no poster for {row["id"]}')
                time.sleep(0.4)
            except Exception as e:
                print(f'  [!] backfill {row.get("id")}: {e}', file=sys.stderr)
    except Exception as e:
        print(f'[!] backfill failed: {e}', file=sys.stderr)


def main():
    # 1) backfill first so old rows get posters before new upserts
    backfill_missing_posters()

    # 2) normal scrape
    print('[*] fetching home')
    topics = topic_urls(fetch(HOME))
    print(f'[*] {len(topics)} topics')

    processed = 0
    for tid, url in topics[:MAX_T]:
        try:
            print(f'[>] {tid}')
            rec = parse_thread(tid, url, fetch(url))
            sb.table('movies').upsert({
                'topic_id':   rec['topic_id'],
                'title':      rec['title'],
                'year':       rec['year'],
                'poster_url': rec['poster_url'],
                'languages':  rec['languages'],
                'downloads':  rec['downloads'],
                'source_url': rec['source_url'],
            }, on_conflict='topic_id').execute()
            processed += 1
            time.sleep(0.5)
        except Exception as e:
            print(f'  [!] {tid}: {e}', file=sys.stderr)

    print(f'[+] {processed}/{min(len(topics), MAX_T)}')


if __name__ == '__main__':
    main()
