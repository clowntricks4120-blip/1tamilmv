# language: Python 3, file: scripts/backfill_posters.py
import os, re, sys, time
import requests
from bs4 import BeautifulSoup
from supabase import create_client

BASE = 'https://www.1tamilmv.io'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
HEADERS = {'User-Agent': UA, 'Referer': BASE + '/'}

sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
sess = requests.Session(); sess.headers.update(HEADERS)

def fetch(url):
    r = sess.get(url, timeout=25)
    r.raise_for_status()
    return r.text

def extract_poster(html):
    soup = BeautifulSoup(html, 'html.parser')
    # Amazon poster first
    for img in soup.find_all('img'):
        src = img.get('src', '')
        if 'm.media-amazon.com' in src:
            return src
    # VLC snapshot fallback
    for img in soup.find_all('img'):
        src = img.get('src', '')
        if 'imageride.net' in src and 'vlcsnap' in src:
            return src
    return None

def main():
    # Fetch all movies missing poster but with source_url
    res = sb.table('movies').select('id, source_url, poster_url').is_('poster_url', 'null').not_.is_('source_url', 'null').execute()
    rows = res.data or []
    print(f"[*] {len(rows)} movies need poster backfill")

    updated = 0
    for row in rows:
        try:
            html = fetch(row['source_url'])
            poster = extract_poster(html)
            if poster:
                sb.table('movies').update({'poster_url': poster}).eq('id', row['id']).execute()
                updated += 1
                print(f"[+] {row['id']} poster set")
            else:
                print(f"[-] {row['id']} no poster found")
            time.sleep(0.4)
        except Exception as e:
            print(f"[!] {row['id']}: {e}", file=sys.stderr)

    print(f"[done] {updated}/{len(rows)} posters updated")

if __name__ == '__main__':
    main()
