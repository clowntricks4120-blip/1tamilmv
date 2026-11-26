import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import AdSlot from '../AdUnits';

const LANGS = ['All', 'Tamil', 'Telugu', 'Hindi', 'Malayalam', 'Kannada', 'English'];
const FMT_ORDER = ['4K', '2K', '1080p', '720p', '480p', 'BluRay', 'WEB-DL', 'HD', 'TC', 'CAM'];
const MODDED_APPS_URL = 'https://ct.clowntricks4120.workers.dev';
const AD_EVERY = 6;

const T = {
  bg:        '#f8fafc',
  surface:   '#ffffff',
  surface2:  '#f1f5f9',
  border:    '#e2e8f0',
  borderHov: '#cbd5e1',
  text:      '#0f172a',
  muted:     '#64748b',
  accent:    '#2563eb',
  accentBg:  '#eff6ff',
  accentBdr: '#bfdbfe',
};

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 66'%3E%3Crect fill='%23e2e8f0' width='44' height='66'/%3E%3C/svg%3E";

function bestFormat(dls) {
  if (!Array.isArray(dls) || !dls.length) return null;
  const has = f => dls.some(d => (d.format || d.tier || '').toLowerCase() === f.toLowerCase());
  for (const f of FMT_ORDER) if (has(f)) return f;
  return dls[0]?.format || dls[0]?.tier || null;
}

function fmtStyle(f) {
  if (f === '4K' || f === '2K') return { bg: '#fef9c3', color: '#a16207', border: '#fde68a' };
  if (f === 'CAM' || f === 'TC') return { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' };
  return { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' };
}

export default function MovieGrid() {
  const [movies, setMovies] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    supabase
      .from('movies')
      .select('id', { count: 'exact', head: true })
      .eq('published', true)
      .then(({ count }) => { if (typeof count === 'number') setTotal(count); });
  }, []);

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
    if (i > 0 && i % AD_EVERY === 0) rows.push(<AdSlot key={`ad-${i}`} placement="grid-inline" type="responsive" />);
    rows.push(<MovieRow key={m.id} movie={m} />);
  });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 12px 48px', background: T.bg, minHeight: '100vh', color: T.text }}>

      {/* Top ad banner */}
      <AdSlot placement="grid-top" type="responsive" />

      {/* header strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: T.muted }}>
          <span style={{ color: T.accent, fontWeight: 700, fontSize: 18 }}>
            {total === null ? '—' : total.toLocaleString()}
          </span>{' '}Movies & Series Available
        </div>
        <a href={MODDED_APPS_URL} target="_blank" rel="noopener noreferrer" style={{
          padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
          background: T.accentBg, color: T.accent, border: `1px solid ${T.accentBdr}`,
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}>Modded Apps →</a>
      </div>

      {/* language filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {LANGS.map(l => {
          const v = l === 'All' ? '' : l;
          const active = lang === v;
          return (
            <button key={l} onClick={() => setLang(v)} style={{
              padding: '7px 14px', borderRadius: 20, fontFamily: 'inherit',
              border: `1px solid ${active ? T.accent : T.border}`,
              background: active ? T.accent : T.surface,
              color: active ? '#fff' : T.text,
              fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
            }}>{l}</button>
          );
        })}
      </div>

      {/* search */}
      <input
        placeholder="Search movies..."
        value={q}
        onChange={e => setQ(e.target.value)}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 8, fontFamily: 'inherit',
          border: `1px solid ${T.border}`, background: T.surface,
          color: T.text, fontSize: 14, marginBottom: 14, boxSizing: 'border-box',
          outline: 'none',
        }}
      />

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: T.muted }}>Loading...</div>
      ) : !movies.length ? (
        <div style={{ padding: 60, textAlign: 'center', color: T.muted }}>
          <strong style={{ display: 'block', fontSize: 16, color: T.text, marginBottom: 6 }}>No movies yet</strong>
          Scraper runs every 6 hours.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{rows}</div>
      )}

      {/* Bottom ad */}
      <AdSlot placement="grid-bottom" type="responsive" />
    </div>
  );
}

function MovieRow({ movie }) {
  const fmt = bestFormat(movie.downloads);
  const fs = fmt ? fmtStyle(fmt) : null;
  const langs = (movie.languages || []).slice(0, 4);
  const dlCount = (movie.downloads || []).length;
  const totalSize = (() => {
    const sizes = (movie.downloads || []).map(d => d.size).filter(Boolean);
    return sizes.length ? sizes[0] : null;
  })();

  return (
    <Link to={`/movies/${movie.id}`} style={{
      display: 'grid', gridTemplateColumns: '44px 1fr auto',
      gap: 12, alignItems: 'center', padding: '10px 12px',
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 8, textDecoration: 'none', color: 'inherit',
    }}>
      <img
        src={movie.poster_url || PLACEHOLDER}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={e => { e.currentTarget.src = PLACEHOLDER; e.currentTarget.onerror = null; }}
        style={{ width: 44, height: 66, objectFit: 'cover', borderRadius: 4, background: T.surface2 }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.35, marginBottom: 4,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>{movie.title}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: T.muted }}>
          {movie.year && <span>{movie.year}</span>}
          {langs.length > 0 && <span>·</span>}
          {langs.map(l => <span key={l} style={{ color: T.accent }}>{l}</span>)}
          {dlCount > 0 && <span>· {dlCount} links</span>}
          {totalSize && <span style={{ color: T.muted }}>· {totalSize}</span>}
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
