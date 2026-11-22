// language: jsx, file: src/MovieGrid.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from './supabase';
import './movie.css';

const LANGS = ['', 'Tamil', 'Telugu', 'Hindi', 'Malayalam', 'Kannada', 'English'];

const fmtOrder = ['4K', '2K', '1080p', '720p', '480p', 'BluRay', 'WEB-DL', 'HD', 'TC', 'CAM'];

function bestFormat(dls) {
  if (!Array.isArray(dls) || !dls.length) return 'HD';
  const has = f => dls.some(d => (d.format || d.tier || '').toLowerCase() === f.toLowerCase());
  for (const f of fmtOrder) if (has(f)) return f;
  return dls[0]?.format || 'HD';
}

function fmtClass(f) {
  if (f === '4K' || f === '2K') return 'uhd';
  if (f === 'CAM' || f === 'TC') return 'cam';
  return '';
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
      .select('topic_id,title,year,poster_url,languages,downloads')
      .order('scraped_at', { ascending: false })
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
    <div className="mv-wrap">
      <div className="mv-chips">
        {LANGS.map(l => (
          <button key={l || 'all'} className={`mv-chip ${lang === l ? 'active' : ''}`}
                  onClick={() => setLang(l)}>{l || 'All'}</button>
        ))}
        <input className="mv-search" placeholder="Search movies..." value={q}
               onChange={e => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="mv-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="mv-card skeleton"><div className="poster" /></div>
          ))}
        </div>
      ) : !movies.length ? (
        <div className="mv-empty"><strong>No movies yet</strong>Scraper runs every 6 hours.</div>
      ) : (
        <div className="mv-grid">
          {movies.map((m, i) => {
            const f = bestFormat(m.downloads);
            return (
              <Link key={m.topic_id} to={`/movies/${m.topic_id}`}
                    className="mv-card" style={{ animationDelay: `${Math.min(i * 18, 400)}ms` }}>
                <div className="poster">
                  <div className="tags">
                    <span className={`tag fmt ${fmtClass(f)}`}>{f}</span>
                    {(m.languages || []).slice(0, 2).map(l => <span key={l} className="tag">{l}</span>)}
                  </div>
                  <img src={m.poster_url || ''} alt={m.title} loading="lazy"
                       referrerPolicy="no-referrer" onError={e => e.currentTarget.style.opacity = 0.15} />
                </div>
                <div className="meta">
                  <div className="title">{m.title}</div>
                  <div className="sub"><span>{m.year || '—'}</span><span className="q">{f}</span></div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
