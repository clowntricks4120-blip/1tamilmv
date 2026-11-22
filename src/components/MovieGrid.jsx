// language: jsx, file: src/components/MovieGrid.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';

const LANGS = ['', 'Tamil', 'Telugu', 'Hindi', 'Malayalam', 'Kannada', 'English'];
const FMT_ORDER = ['4K', '2K', '1080p', '720p', '480p', 'BluRay', 'WEB-DL', 'HD', 'TC', 'CAM'];

function bestFormat(dls) {
  if (!Array.isArray(dls) || !dls.length) return null;
  const has = f => dls.some(d => (d.format || d.tier || '').toLowerCase() === f.toLowerCase());
  for (const f of FMT_ORDER) if (has(f)) return f;
  return dls[0]?.format || dls[0]?.tier || null;
}

function fmtColor(f) {
  if (f === '4K' || f === '2K') return { bg: 'rgba(234,179,8,.85)', color: '#0a0a0c' };
  if (f === 'CAM' || f === 'TC') return { bg: 'rgba(239,68,68,.85)', color: '#fff' };
  return { bg: 'rgba(34,197,94,.85)', color: '#0a0a0c' };
}

export default function MovieGrid() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    let req = supabase
  .from('movies')
  .select('id,title,year,poster_url,languages,downloads,created_at')
  .eq('published', true)
  .order('created_at', { ascending: false })
  .limit(180);

    if (q.trim()) req = req.ilike('title', `%${q.trim()}%`);
    if (lang) req = req.contains('languages', [lang]);

    req.then(({ data, error }) => {
      if (cancelled) return;
      if (!error && data) setMovies(data);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [q, lang]);

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: '24px 20px 48px', color: '#f0f0f2' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24, alignItems: 'center' }}>
        {LANGS.map(l => (
          <button key={l || 'all'} onClick={() => setLang(l)}
                  style={{
                    padding: '7px 16px', borderRadius: 24, cursor: 'pointer',
                    border: `1px solid ${lang === l ? '#ff6b1a' : '#26262c'}`,
                    background: lang === l ? '#ff6b1a' : '#141418',
                    color: lang === l ? '#0a0a0c' : '#f0f0f2',
                    fontSize: 13, fontWeight: lang === l ? 600 : 400,
                  }}>
            {l || 'All'}
          </button>
        ))}
        <input
          placeholder="Search movies..."
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{
            flex: 1, minWidth: 200, maxWidth: 320, padding: '8px 14px',
            borderRadius: 24, border: '1px solid #26262c', background: '#141418',
            color: '#f0f0f2', fontSize: 13, marginLeft: 'auto',
          }}
        />
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 20 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ aspectRatio: '2/3', borderRadius: 12, background: '#1b1b20' }} />
          ))}
        </div>
      ) : !movies.length ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', opacity: 0.6 }}>
          <strong style={{ display: 'block', fontSize: 17, color: '#f0f0f2', marginBottom: 6, opacity: 1 }}>
            No movies yet
          </strong>
          Scraper runs every 6 hours.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 20 }}>
          {movies.map((m, i) => {
            const fmt = bestFormat(m.downloads);
            const fc = fmt ? fmtColor(fmt) : null;
            return (
              <Link key={m.id} to={`/movies/${m.id}`}
                    style={{
                      textDecoration: 'none', color: 'inherit', display: 'block',
                      background: '#141418', borderRadius: 12, overflow: 'hidden',
                      transition: 'transform .2s, box-shadow .2s',
                    }}>
                <div style={{ position: 'relative', aspectRatio: '2/3', background: '#1b1b20', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', gap: 4, flexWrap: 'wrap', zIndex: 2 }}>
                    {fmt && (
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 4,
                        background: fc.bg, color: fc.color, textTransform: 'uppercase', letterSpacing: 0.3,
                      }}>{fmt}</span>
                    )}
                    {(m.languages || []).slice(0, 2).map(l => (
                      <span key={l} style={{
                        fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 4,
                        background: 'rgba(10,10,12,.85)', color: '#ff6b1a',
                        border: '1px solid rgba(255,107,26,.45)', textTransform: 'uppercase', letterSpacing: 0.3,
                      }}>{l}</span>
                    ))}
                  </div>
                  {m.poster_url ? (
                    <img src={m.poster_url} alt={m.title} loading={i < 12 ? 'eager' : 'lazy'}
                         referrerPolicy="no-referrer"
                         style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex',
                                  alignItems: 'center', justifyContent: 'center', opacity: 0.2, fontSize: 12 }}>
                      No poster
                    </div>
                  )}
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, lineHeight: 1.4,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', minHeight: 36,
                  }}>{m.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                                marginTop: 6, fontSize: 12, color: '#8a8a92' }}>
                    <span>{m.year || '—'}</span>
                    {fmt && <span style={{ color: '#ff6b1a', fontWeight: 700 }}>{fmt}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
