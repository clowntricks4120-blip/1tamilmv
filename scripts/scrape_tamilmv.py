#!/usr/bin/env python3
# language: Python 3, file: scripts/scrape_tamilmv.py
"""
1tamilmv -> Supabase scraper.

Tier extraction (the core fix):
  Per-link tier is derived by walking UP from each magnet anchor to the
  nearest ancestor whose text contains exactly ONE resolution token
  (2160p/4K/UHD, 1440p/2K, 1080p, 720p, 480p). If an ancestor lists
  several ('[4K, 1080p & 720p]'), the walk keeps climbing until a single
  one wins. If the DOM never narrows to one tier, a previous-sibling walk
  is tried. If that also fails, the tier is inferred from the file size.

  There is NO hardcoded '720p' default. An unparseable link gets tier=None
  and the UI routes it to "Other". A size-based inference is the final
  fallback so a movie with sizes never lands with empty tiers.

Poster detection:
  Walks the post body in document order, collects <img> sources, stops at
  the text node containing "telegram channel". The LAST image before that
  anchor is the poster. Falls back to first-image-in-post.

Only NEW topic_ids are scraped by default (existing rows frozen).
FORCE_RESCAN=1 re-scans all home topics and overwrites rows.

env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  MAX_THREADS (default 1000)
  FORCE_RESCAN (default 0)
"""
import os, re, sys, time
import requests
from bs4 import BeautifulSoup
from supabase import create_client

HOME    = 'https://1tamilmv.io/'
UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
HEADERS = {'User-Agent': UA, 'Accept-Encoding': 'identity', 'Referer': HOME}
MAX_T   = int(os.environ.get('MAX_THREADS', '1000'))
FORCE   = os.environ.get('FORCE_RESCAN', '0') == '1'

LANG_MAP = {
    'tam': 'Tamil', 'tamil': 'Tamil',
    'tel': 'Telugu', 'telugu': 'Telugu',
    'hin': 'Hindi', 'hindi': 'Hindi',
    'mal': 'Malayalam', 'malayalam': 'Malayalam',
    'kan': 'Kannada', 'kannada': 'Kannada',
    'eng': 'English', 'english': 'English',
    'kor': 'Korean', 'korean': 'Korean',
    'jap': 'Japanese', 'japanese': 'Japanese',
    'chi': 'Chinese', 'chinese': 'Chinese',
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

# Codec detection patterns (order matters — most specific first)
CODEC_PATTERNS = [
    ('HEVC',  r'\b(hevc|x265|h\.?265)\b'),
    ('AVC',   r'\b(avc|x264|h\.?264)\b'),
    ('AV1',   r'\bav1\b'),
]

# Audio format detection
AUDIO_PATTERNS = [
    ('DD+5.1', r'\b(dd\+5\.1|ddp5\.1|e-?ac-?3[^0-9]|eac3|atmos)\b'),
    ('DD5.1',  r'\b(dd5\.1|ac-?3|dolby digital)\b'),
    ('DTS',    r'\b(dts-?hd|dts)\b'),
    ('AAC',    r'\baac\b'),
    ('MP3',    r'\bmp3\b'),
]

# Bitrate detection
BITRATE_RE = re.compile(r'\b(\d+)\s*kbps\b', re.I)

# canonical tier vocabulary
TIER_CANON = {
    '2160p': '4K', '2160': '4K', '4k': '4K', 'uhd': '4K',
    '1440p': '2K', '1440': '2K', '2k': '2K', 'qhd': '2K',
    '1080p': '1080p', '1080': '1080p', 'fhd': '1080p',
    '720p': '720p', '720': '720p', 'hd': '720p',
    '480p': '480p', '480': '480p', '360p': '480p', 'sd': '480p',
}
TIER_TOKEN = re.compile(
    r'\b(2160p|1440p|1080p|720p|480p|360p|4k|2k|uhd|fhd|qhd|sd)\b',
    re.I,
)
SIZE_RE = re.compile(r'(\d+(?:\.\d+)?\s*(?:GB|MB))', re.I)

TEMPLATE_IMG = (
    'torrborder', 'utorrent', 'logo.png', 'logo.jpg', 'logo.svg',
    'smiley', 'emoticon', 'twemoji', 'jsdelivr.net/gh/twitter',
    'default_photo', 'avatar', 'icon_', 'telegram', 't.me',
    'telegram-icon', 'channel-icon',
)
POSTER_HOSTS = (
    'pbs.twimg.com', 'm.media-amazon.com', 'image.tmdb.org',
    'i.ibb.co', 'imgbb.com', 'i.postimg.cc', 'postimg.cc',
    'img.imageride.net', 'img1.imageride.net',
)
SCREENSHOT_HINTS = ('vlcsnap', 'screenshot', 'snap-', 'thumb-', 'preview')
TELEGRAM_ANCHOR = re.compile(r'telegram\s*channel', re.I)

sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
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

def _normalize_poster_url(src):
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
            return _normalize_poster_url(href)
    return _normalize_poster_url(src)


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

    candidates = []
    state = {'hit': False}

    def walk(el):
        if state['hit']:
            return
        for child in el.children:
            if state['hit']:
                return
            if isinstance(child, str):
                if child.strip() and TELEGRAM_ANCHOR.search(child):
                    state['hit'] = True
                    return
            elif hasattr(child, 'name'):
                if child.name == 'img':
                    src = _img_src(child)
                    if src and not _is_template(src) and not _is_too_small(child):
                        candidates.append(absolutize(src, origin))
                elif child.name not in ('script', 'style', 'noscript'):
                    walk(child)

    walk(body)

    if not candidates:
        for img in body.find_all('img'):
            src = _img_src(img)
            if src and not _is_template(src) and not _is_too_small(img):
                candidates.append(absolutize(src, origin))

    if not candidates:
        return None

    ordered = list(reversed(candidates)) if state['hit'] else candidates

    for src in ordered:
        low = src.lower()
        if any(h in low for h in POSTER_HOSTS) and not any(s in low for s in SCREENSHOT_HINTS):
            return src

    for src in ordered:
        if not any(s in src.lower() for s in SCREENSHOT_HINTS):
            return src

    return ordered[0] if ordered else None


# ---------- language ----------

def normalize_langs(blob):
    found = set()
    for tok in re.split(r'[+,\/|\[\]\(\)\s]+', blob or ''):
        t = tok.strip().lower()
        if t in LANG_MAP:
            found.add(LANG_MAP[t])
    return sorted(found)


def _langs_from_anchor(anchor):
    known_words = set(LANG_MAP.keys())
    node = anchor
    for _ in range(4):
        node = node.parent
        if node is None or not hasattr(node, 'get_text'):
            break
        words = re.split(r'[\s+&,/\[\]()\-]+', node.get_text(' ', strip=True).lower())
        found = [w for w in words if w in known_words]
        if found:
            seen, out = set(), []
            for w in found:
                if w not in seen:
                    seen.add(w)
                    out.append(LANG_MAP[w])
            return ' + '.join(out)
    return ''


# ---------- tier ----------

def _canon_tier(tok):
    return TIER_CANON.get(tok.lower()) if tok else None


def _tier_from_ancestors(anchor, max_up=8):
    """
    Walk up from the <a>. Return the tier of the nearest ancestor that
    mentions exactly ONE tier. Ancestors mentioning several tiers
    ('[4K, 1080p & 720p]') are ignored — the per-link <p> heading is
    closer and wins. Returns None if no unambiguous ancestor found.
    """
    node = anchor
    for _ in range(max_up):
        node = node.parent
        if node is None or not hasattr(node, 'get_text'):
            break
        text = node.get_text(' ', strip=True)
        hits = {_canon_tier(m.group(1)) for m in TIER_TOKEN.finditer(text)}
        hits.discard(None)
        if len(hits) == 1:
            return hits.pop()
    return None


def _tier_from_prev_sibling(anchor):
    """
    Fallback for layouts like:
        <p><strong>1080p:</strong></p>
        <p><a href="magnet:...">2.2GB</a></p>
    where the tier heading is a *previous sibling* paragraph, not an
    ancestor of the anchor.
    """
    node = anchor
    for _ in range(4):
        try:
            sib = node.find_previous_sibling()
        except AttributeError:
            sib = None
        if sib is None:
            if node.parent is not None:
                node = node.parent
                continue
            break
        text = sib.get_text(' ', strip=True) if hasattr(sib, 'get_text') else str(sib)
        hits = {_canon_tier(m.group(1)) for m in TIER_TOKEN.finditer(text)}
        hits.discard(None)
        if len(hits) == 1:
            return hits.pop()
        node = sib
    return None


def _tier_from_size(size_str):
    """
    Last-resort fallback. Thresholds calibrated to TamilMV's actual size
    economy:
      ≥12GB -> 4K
      ≥3GB  -> 1080p
      ≥1GB  -> 720p
      <1GB  -> 480p
    """
    if not size_str:
        return None
    m = SIZE_RE.search(size_str)
    if not m:
        return None
    raw = m.group(1).upper()
    try:
        num = float(re.sub(r'[^\d.]', '', raw))
    except ValueError:
        return None
    mb = num * 1000 if 'GB' in raw else num
    if mb >= 12000: return '4K'
    if mb >= 3000:  return '1080p'
    if mb >= 1000:  return '720p'
    if mb >= 300:   return '480p'
    return None


def _size_from_anchor(anchor):
    m = SIZE_RE.search(anchor.get_text(' ', strip=True))
    if m:
        return m.group(1).replace(' ', '').upper()
    sib = anchor.next_sibling
    for _ in range(3):
        if sib is None:
            break
        text = sib.get_text(' ', strip=True) if hasattr(sib, 'get_text') else str(sib)
        m = SIZE_RE.search(text or '')
        if m:
            return m.group(1).replace(' ', '').upper()
        sib = getattr(sib, 'next_sibling', None)
    return ''


# ---------- format / codec / audio ----------

def detect_format(text):
    t = (text or '').lower()
    for label, pat in FORMAT_PATTERNS:
        if re.search(pat, t):
            return label
    return 'HD'


def detect_codec(text):
    """Return 'HEVC', 'AVC', 'AV1', or '' from filename/title text."""
    t = (text or '')
    for label, pat in CODEC_PATTERNS:
        if re.search(pat, t, re.I):
            return label
    return ''


def detect_audio(text):
    """Return audio format string like 'DD+5.1', 'AAC', etc."""
    t = (text or '')
    for label, pat in AUDIO_PATTERNS:
        if re.search(pat, t, re.I):
            return label
    return ''


def detect_bitrate(text):
    """Return bitrate string like '640Kbps', '192Kbps', or ''."""
    m = BITRATE_RE.search(text or '')
    if m:
        return m.group(1) + 'Kbps'
    return ''


def _heading_text_for_anchor(anchor):
    """
    Find the heading <strong> for this download link on 1TamilMV.

    1TamilMV puts everything in ONE large <p> block, with <br> separators:
      <strong>Movie - 4K SDR - HEVC - (DD+5.1 - 640Kbps) - 15GB - ESub :</strong><br>
      <strong><a href="...torrent">filename.torrent</a></strong><br>
      <a class="skyblue-button" href="magnet:...">MAGNET</a><br>
      <a class="download-button" href="...">DIRECT LINK</a><br>
      <br>
      <strong>Movie - 1080p - AVC - ... - 8.6GB - ESub :</strong><br>
      ...

    Strategy: walk backwards through previous siblings of the magnet anchor
    (within the same parent container) looking for a <strong> element whose
    text contains a size or looks like a heading (contains 'ESub' or 'kbps').
    Stop at the previous magnet/DIRECT LINK anchor to avoid crossing groups.
    """
    # Walk backwards from the magnet anchor through siblings in same container
    sib = anchor.previous_sibling
    checked = 0
    while sib is not None and checked < 20:
        # Stop if we cross another magnet link or DIRECT LINK (new group)
        if hasattr(sib, 'name') and sib.name == 'a':
            href = sib.get('href', '')
            if href.startswith('magnet:'):
                break  # crossed into previous group
            txt = sib.get_text(' ', strip=True).upper()
            if 'DIRECT LINK' in txt:
                pass  # these are ok, keep walking

        if hasattr(sib, 'name') and sib.name == 'strong':
            # Check if this is a heading <strong> (not a torrent link)
            inner_a = sib.find('a')
            if not inner_a:
                # No link inside — this is the heading text
                text = sib.get_text(' ', strip=True)
                if len(text) > 20 and (SIZE_RE.search(text) or 'esub' in text.lower() or 'kbps' in text.lower()):
                    return text
            # else: it's a torrent filename link — skip

        sib = sib.previous_sibling
        checked += 1

    # Fallback: walk up to parent, then search previous sibling <p>/<div>
    node = anchor
    for _ in range(5):
        p = node.parent
        if p is None:
            break
        if getattr(p, 'name', None) in ('p', 'div', 'li', 'td'):
            node = p
            break
        node = p

    sib = node
    for _ in range(6):
        try:
            sib = sib.find_previous_sibling()
        except AttributeError:
            break
        if sib is None:
            break
        if not hasattr(sib, 'get_text'):
            continue
        text = sib.get_text(' ', strip=True)
        if len(text) > 30 and (SIZE_RE.search(text) or 'esub' in text.lower() or 'kbps' in text.lower()):
            return text

    return ''


def _context_text_for_anchor(anchor, max_up=6):
    """Collect text from anchor + nearest parent paragraph."""
    parts = [anchor.get_text(' ', strip=True)]
    node = anchor
    for _ in range(max_up):
        node = node.parent
        if node is None or not hasattr(node, 'get_text'):
            break
        text = node.get_text(' ', strip=True)
        parts.append(text)
        if len(text) > 20:
            break
    return ' '.join(parts)


# ---------- thread parse ----------

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
    # Build movie-level languages from per-download langs only (already heading-parsed)
    # Using a set so we don't double-count Tamil if it appears in multiple downloads
    all_langs: set = set()
    for d in downloads:
        for lang in re.split(r'\s*\+\s*|\s*,\s*', str(d.get('langs') or '')):
            lang = lang.strip()
            if lang:
                all_langs.add(lang)
    # If still empty, try parsing from title (but only the bracket part, not full title)
    if not all_langs:
        bracket_m = re.search(r'\[([^\]]*(?:Hindi|Tamil|Telugu|Malayalam|Kannada|English)[^\]]*)\]', title or '', re.I)
        if bracket_m:
            all_langs = set(normalize_langs(bracket_m.group(1)))
    langs = sorted(all_langs) if all_langs else normalize_langs(title)

    return {
        'topic_id':   tid,
        'title':      title,
        'year':       year,
        'poster_url': poster,
        'downloads':  downloads,
        'languages':  langs,
        'source_url': url,
    }


# ---------- downloads ----------

def extract_downloads(soup):
    downloads, seen = [], set()

    for mg in soup.select('a[href^="magnet:"]'):
        href = mg.get('href', '')
        if not href or href in seen:
            continue
        seen.add(href)

        size = _size_from_anchor(mg)
        langs = _langs_from_anchor(mg)

        # tier resolution, in preference order:
        #   1) nearest single-tier ancestor        (most reliable — per-link <p>)
        #   2) previous sibling heading            (TamilMV alt layout)
        #   3) size heuristic                      (last resort)
        tier = _tier_from_ancestors(mg)
        if not tier:
            tier = _tier_from_prev_sibling(mg)
        if not tier:
            tier = _tier_from_size(size)

        # ── HEADING TEXT (most reliable source on 1TamilMV) ──────────────────
        # Each download has a <strong> heading like:
        # "Movie - 4K SDR - HEVC - (DD+5.1 - 640Kbps) - 15GB - ESub :"
        # This is the sibling <strong> *before* the torrent/magnet links.
        heading_text = _heading_text_for_anchor(mg)

        # Also get magnet dn= and context as fallbacks
        ctx = _context_text_for_anchor(mg)
        magnet_dn = ''
        dn_m = re.search(r'[?&]dn=([^&]+)', href)
        if dn_m:
            import urllib.parse
            magnet_dn = urllib.parse.unquote_plus(dn_m.group(1))

        # Size: heading text (most reliable) > magnet dn= > anchor/sibling text
        size_from_heading = ''
        if heading_text:
            sm = SIZE_RE.search(heading_text)
            if sm:
                size_from_heading = sm.group(1).replace(' ', '').upper()

        size_from_dn = ''
        if magnet_dn:
            sm = SIZE_RE.search(magnet_dn)
            if sm:
                size_from_dn = sm.group(1).replace(' ', '').upper()

        size = size_from_heading or size_from_dn or size or ''

        # Codec, audio, bitrate — heading text first, then magnet dn=, then ctx
        search_text = heading_text or magnet_dn or ctx
        codec   = detect_codec(search_text) or detect_codec(ctx)
        audio   = detect_audio(search_text) or detect_audio(ctx)
        bitrate = detect_bitrate(search_text) or detect_bitrate(ctx)

        # Languages — parse ONLY from heading text bracket e.g. [Hindi + Malayalam + Kannada]
        # heading_text is reliable; _langs_from_anchor walks up and can pick up site-level "Tamil"
        langs_from_heading = ''
        if heading_text:
            # Look for bracketed language group: [Hindi + Malayalam + Kannada]
            bracket_m = re.search(r'\[([^\]]*(?:Hindi|Tamil|Telugu|Malayalam|Kannada|English|Korean|Japanese|Chinese)[^\]]*)\]', heading_text, re.I)
            if bracket_m:
                langs_from_heading = normalize_langs(bracket_m.group(1))
                langs_from_heading = ' + '.join(langs_from_heading) if langs_from_heading else ''
        # Also try magnet dn= for language bracket
        if not langs_from_heading and magnet_dn:
            bracket_m = re.search(r'\[([^\]]*(?:Hindi|Tamil|Telugu|Malayalam|Kannada|English)[^\]]*)\]', magnet_dn, re.I)
            if bracket_m:
                lf = normalize_langs(bracket_m.group(1))
                langs_from_heading = ' + '.join(lf) if lf else ''
        # Fall back to old anchor walker only if heading gave nothing
        langs = langs_from_heading or _langs_from_anchor(mg)

        fmt = detect_format(' '.join(filter(None, [tier or '', size])))
        quality = tier or ''

        # row container for torrent / direct sibling anchors
        row = mg
        for _ in range(4):
            if row.parent and getattr(row.parent, 'name', None) in ('p', 'div', 'article', 'td'):
                row = row.parent
            else:
                break

        torrent_url = direct_url = None
        if hasattr(row, 'find_all'):
            for a in row.find_all('a'):
                txt = a.get_text(' ', strip=True)
                hh = a.get('href', '')
                if not torrent_url and (hh.endswith('.torrent') or 'attachment.php' in hh):
                    torrent_url = hh
                if 'DIRECT LINK' in txt.upper() and not direct_url:
                    direct_url = hh

        downloads.append({
            'quality':     quality,
            'size':        size,
            'langs':       langs,
            'header':      '',
            'format':      fmt,
            'tier':        tier,
            'codec':       codec,
            'audio':       audio,
            'bitrate':     bitrate,
            'magnet':      href,
            'torrent_url': torrent_url,
            'direct_url':  direct_url,
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

    existing = {}
    try:
        ids = [t[0] for t in topics]
        resp = sb.table('movies').select('topic_id,poster_url').in_('topic_id', ids).execute()
        existing = {r['topic_id']: r for r in resp.data}
    except Exception as e:
        print(f'[!] existing lookup failed: {e}', file=sys.stderr)

    if FORCE:
        todo = topics
        print(f'[*] FORCE mode — re-scanning all {len(todo)} topics')
    else:
        todo = [t for t in topics if t[0] not in existing]
        print(f'[*] {len(todo)} NEW topics to scrape, {len(existing)} already in DB (skipped)')

    if not todo:
        print('[+] nothing new. exit.')
        return

    processed = 0
    errors = 0
    poster_changed = 0

    for tid, url in todo[:MAX_T]:
        try:
            page = sess.get(url, timeout=25)
            if page.status_code != 200:
                print(f'  [!] {tid}: HTTP {page.status_code}', file=sys.stderr)
                errors += 1
                continue

            rec = parse_thread(tid, url, page.text, origin)

            if not rec['downloads']:
                print(f'  [-] {tid}: no downloads, skipping')
                if tid in existing:
                    sb.table('movies').delete().eq('topic_id', tid).execute()
                    print(f'  [x] {tid}: removed from DB')
                continue

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
                if FORCE and prior.get('poster_url') != rec['poster_url']:
                    poster_changed += 1
            elif prior.get('poster_url'):
                row['poster_url'] = prior['poster_url']

            sb.table('movies').upsert(row, on_conflict='topic_id').execute()
            print(f'[+] {tid}  poster={"yes" if rec["poster_url"] else "no"}  dls={len(rec["downloads"])}  tiers={sorted({d["tier"] for d in rec["downloads"] if d["tier"]})}')
            processed += 1
            time.sleep(0.4)
        except Exception as e:
            print(f'  [!] {tid}: {e}', file=sys.stderr)
            errors += 1

    print(f'[+] {processed} processed · {errors} errors · {poster_changed} posters updated')


if __name__ == '__main__':
    main()
