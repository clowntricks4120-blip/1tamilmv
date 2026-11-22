def main():
    print('[*] fetching home')
    topics = topic_urls(fetch(HOME))
    print(f'[*] {len(topics)} topics')

    processed = 0
    for tid, url in topics[:MAX_T]:
        try:
            print(f'[>] {tid}')
            rec = parse_thread(tid, url, fetch(url))
            sb.table('movies').upsert({
                'topic_id':      rec['topic_id'],
                'title':         rec['title'],
                'year':          rec['year'],
                'poster_url':    rec['poster_url'],
                'languages':     rec['languages'],
                'downloads':     rec['downloads'],
                'source_url':    rec['source_url'],
                'genres':        [],
                'synopsis':      '',
                'official_links': [],
                'featured':      False,
                'published':     True,   # ← required, or anon RLS hides the row
            }, on_conflict='topic_id').execute()
            processed += 1
            time.sleep(0.5)
        except Exception as e:
            print(f'  [!] {tid}: {e}', file=sys.stderr)

    print(f'[+] {processed}/{min(len(topics), MAX_T)}')
