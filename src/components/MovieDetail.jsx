// language: jsx, file: src/components/MovieDetail.jsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../supabase';

const TIERS = ['4K', '2K', '1080p', '720p', '480p'];
const TIER_LABEL = { '4K': '4K UHD', '2K': '2K QHD', '1080p': 'Full HD', '720p': 'HD', '480p': 'SD' };
const TIER_COLOR = {
  '4K':    { bg: 'rgba(234,179,8,0.15)', fg: '#fbbf24', border: 'rgba(234,179,8,0.4)' },
  '2K':    { bg: 'rgba(234,179,8,0.15)', fg: '#fbbf24', border: 'rgba(234,179,8,0.4)' },
  '1080p': { bg: 'rgba(34,197,94,0.15)', fg: '#4ade80', border: 'rgba(34,197,94,0.4)' },
  '720p':  { bg: 'rgba(34,197,94,0.15)', fg: '#4ade80', border: 'rgba(34,197,94,0.4)' },
  '480p':  { bg: 'rgba(34,197,94,0.15)', fg: '#4ade80', border: 'rgba(34,197,94,0.4)' },
};

const THEME = {
  bg: '#0d1117', surface: '#161b22', surface2: '#1c2128',
  border: '#30363d', text: '#e6edf3', muted: '#7d8590',
  accent: '#22d3ee', accentDim: 'rgba(34,211,238,0.12)',
};

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 150'%3E%3Crect fill='%231c2128' width='100' height='150'/%3E%3C/svg%3E";

export default function MovieDetail() {
  const { id } = useParams();
  const [movie, setMovie] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('movies').select('*').eq('id', id).single()
      .then(({ data, error: e }) => {
        if (e || !data) setError(e?.message || 'Not found');
        else setMovie(data);
      });
  }, [id]);

  if (error) return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 40, color: THEME.text }}>
      <Link to="/movies" style={{ color: THEME.accent }}>← Back</Link>
      <p style={{ opacity: 0.7, marginTop: 24 }}>{error}</p>
    </div>
  );

  if (!movie) return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 40, color: THEME.text, opacity: 0.6 }}>Loading...</div>
  );

  const dls = Array.isArray(movie.downloads) ? movie.downloads : [];
  const groups = {};
  dls.forEach(d => { const t = d.tier || '720p'; (groups[t] ||= []).push(d); });
  const langs = movie.languages || [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 12px 48px', background: THEME.bg, color: THEME.text, minHeight: '100vh' }}>
      <Link to="/movies" style={{ display: 'inline-block', marginBottom: 14, color: THEME.accent, fontSize: 13, textDecoration: 'none' }}>
        ← Back
      </Link>

      <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
        <img
          src={movie.poster_url || PLACEHOLDER}
          alt={movie.title}
          referrerPolicy="no-referrer"
          onError={e => { e.currentTarget.src = PLACEHOLDER; e.currentTarget.onerror = null; }}
          style={{ width: 100, height: 150, objectFit: 'cover', borderRadius: 8, background: THEME.surface2, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, margin: '0 0 10px', lineHeight: 1.25 }}>{movie.title}</h1>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {movie.year && <Pill>{movie.year}</Pill>}
            {langs.map(l => <Pill key={l}>{l}</Pill>)}
          </div>
          {dls.length > 0 && (
            <div style={{ fontSize: 12, color: THEME.muted }}>
              {dls.length} download{dls.length > 1 ? 's' : ''} available
            </div>
          )}
        </div>
      </div>

      <AdBlock />

      {dls.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: THEME.muted }}>No downloads available.</div>
      ) : (
        TIERS.map(tier => {
          const rows = groups[tier];
          if (!rows || !rows.length) return null;
          const col = TIER_COLOR[tier] || TIER_COLOR['720p'];
          return (
            <div key={tier}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 800,
                    background: col.bg, color: col.fg, border: `1px solid ${col.border}`,
                  }}>{tier}</span>
                  <span style={{ fontSize: 12, color: THEME.muted }}>
                    {TIER_LABEL[tier]} · {rows.length} option{rows.length > 1 ? 's' : ''}
                  </span>
                </div>
                {rows.map((d, i) => (
                  <DownloadRow key={i} d={d} movie={movie} />
                ))}
              </div>
              <AdBlock />
            </div>
          );
        })
      )}
    </div>
  );
}

function DownloadRow({ d, movie }) {
  const langText = d.langs || (movie.languages || []).join(' + ') || '—';
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      padding: '10px 12px', borderRadius: 8, marginBottom: 6,
      border: `1px solid ${THEME.border}`, background: THEME.surface, fontSize: 13,
    }}>
      <span style={{ fontWeight: 800, minWidth: 60, color: THEME.text }}>{d.size || '—'}</span>
      <span style={{ flex: 1, minWidth: 140, color: THEME.text }}>
        <span style={{ fontSize: 10, color: THEME.muted, textTransform: 'uppercase', marginRight: 6 }}>Audio</span>
        {langText}
      </span>
      <span style={{ display: 'flex', gap: 6 }}>
        {d.magnet && <DLBtn href={d.magnet} kind="magnet">MAGNET</DLBtn>}
        {d.torrent_url && <DLBtn href={d.torrent_url} kind="torrent">.TORRENT</DLBtn>}
        {d.direct_url && <DLBtn href={d.direct_url} kind="direct" external>DIRECT</DLBtn>}
      </span>
    </div>
  );
}

function Pill({ children }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: THEME.accentDim, color: THEME.accent, border: `1px solid ${THEME.accent}`,
    }}>{children}</span>
  );
}

function DLBtn({ href, kind, external, children }) {
  const palette = {
    magnet:  { bg: '#1e5c3e', color: '#b8f0d3' },
    torrent: { bg: 'rgba(34,211,238,0.15)', color: '#22d3ee' },
    direct:  { bg: '#4a2a1d', color: '#ffb38a' },
  }[kind] || { bg: THEME.border, color: THEME.text };
  return (
    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}
       style={{
         padding: '6px 12px', borderRadius: 6, background: palette.bg, color: palette.color,
         fontSize: 11, fontWeight: 800, textDecoration: 'none', letterSpacing: 0.4,
       }}>{children}</a>
  );
}

function AdBlock() {
  return (
    <div style={{
      margin: '12px 0', padding: 14, minHeight: 70, borderRadius: 8,
      border: `1px dashed ${THEME.border}`, background: THEME.surface2,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: THEME.muted, fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase',
    }}>Advertisement</div>
  );
}
