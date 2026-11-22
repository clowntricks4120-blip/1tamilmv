// language: jsx, file: src/components/MovieGrid.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';

const LANGS = ['All', 'Tamil', 'Telugu', 'Hindi', 'Malayalam', 'Kannada', 'English'];
const FMT_ORDER = ['4K', '2K', '1080p', '720p', '480p', 'BluRay', 'WEB-DL', 'HD', 'TC', 'CAM'];

const THEME = {
  bg:      '#0d1117',
  surface: '#161b22',
  surface2:'#1c2128',
  border:  '#30363d',
  text:    '#e6edf3',
  muted:   '#7d8590',
  accent:  '#22d3ee',
  accentDim:'rgba(34,211,238,0.12)',
};

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 66'%3E%3Crect fill='%231c2128' width='44' height='66'/%3E%3C/svg%3E";

function bestFormat(dls) {
  if (!Array.isArray(dls) || !dls.length) return null;
  const has = f => dls.some(d => (d.format || d.tier || '').toLowerCase() === f.toLowerCase());
  for (const f of FMT_ORDER) if (has(f)) return f;
  return dls[0]?.format || dls[0]?.tier || null;
}

function fmtStyle(f) {
  if (f === '4K' || f === '2K') return { bg: 'rgba(234,179,8,0.18)', color: '#fbbf24', border: 'rgba(234,179,8,0.4)' };
  if (f === 'CAM' || f === 'TC') return { bg: 'rgba(239,68,68,0.18)', color: '#f87171', border: 'rgba(239,68,68,0.4)' };
  return { bg: 'rgba(34,197,94,0.18)', color: '#4ade80', border: 'rgba(34,197,94,0.4)' };
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
      .limit(100);

    if (q.trim()) req = req.ilike('title', `%${q.trim()}%`);
    if (lang) req = req.contains('languages', [lang]);

    req.then(({ data, error }) => {
      if (cancelled) return;
      if (!error && data) setMovies(data);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [q, lang]);

  const rows = [];
  movies.forEach((m, i) => {
    if (i > 0 && i % 10 === 0) rows.push(<AdRow key={`ad-${i}`} />);
    rows.push(<MovieRow key={m.id} movie={m} />);
  });

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 12px 48px', background: THEME.bg, color: THEME.text, minHeight: '100vh' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {LANGS.map(l => {
          const v = l === 'All' ? '' : l;
          const active = lang === v;
          return (
            <button key={l} onClick={() => setLang(v)} style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${active ? THEME.accent : THEME.border}`,
              background: active ? THEME.accent : THEME.surface,
              color: active ? '#0d1117' : THEME.text,
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}>{l}</button>
          );
        })}
      </div>

      <input
        placeholder="Search movies..."
        value={q}
        onChange={e => setQ(e.target.value)}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 8,
          border: `1px solid ${THEME.border}`, background: THEME.surface,
          color: THEME.text, fontSize: 14, marginBottom: 14, boxSizing: 'border-box',
          fontFamily: 'inherit',
        }}
      />

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: THEME.muted }}>Loading...</div>
      ) : !movies.length ? (
        <div style={{ padding: 60, textAlign: 'center', color: THEME.muted }}>
          <strong style={{ display: 'block', fontSize: 16, color: THEME.text, marginBottom: 6 }}>No movies yet</strong>
          Scraper runs every 6 hours.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{rows}</div>
      )}
    </div>
  );
}

function MovieRow({ movie }) {
  const fmt = bestFormat(movie.downloads);
  const fs = fmt ? fmtStyle(fmt) : null;
  const langs = (movie.languages || []).slice(0, 4);
  const dlCount = (movie.downloads || []).length;

  return (
    <Link to={`/movies/${movie.id}`} style={{
      display: 'grid',
      gridTemplateColumns: '44px 1fr auto',
      gap: 12, alignItems: 'center',
      padding: 10,
      background: THEME.surface,
      border: `1px solid ${THEME.border}`,
      borderRadius: 8,
      textDecoration: 'none', color: 'inherit',
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      <img
        src={movie.poster_url || PLACEHOLDER}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={e => { e.currentTarget.src = PLACEHOLDER; e.currentTarget.onerror = null; }}
        style={{ width: 44, height: 66, objectFit: 'cover', borderRadius: 4, background: THEME.surface2 }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: THEME.text, lineHeight: 1.35, marginBottom: 4,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>{movie.title}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: THEME.muted }}>
          {movie.year && <span>{movie.year}</span>}
          {langs.length > 0 && <span>·</span>}
          {langs.map(l => <span key={l} style={{ color: THEME.accent }}>{l}</span>)}
          {dlCount > 0 && <span>· {dlCount} links</span>}
        </div>
      </div>
      {fmt && (
        <span style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
          background: fs.bg, color: fs.color, border: `1px solid ${fs.border}`, whiteSpace: 'nowrap',
        }}>{fmt}</span>
      )}
    </Link>
  );
}

function AdRow() {
  return (
    <div style={{
      padding: 16, minHeight: 80, border: `1px dashed ${THEME.border}`, borderRadius: 8,
      background: THEME.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: THEME.muted, fontSize: 10, letterSpacing: 2, fontWeight: 600, textTransform: 'uppercase',
    }}>Advertisement</div>
  );
}
