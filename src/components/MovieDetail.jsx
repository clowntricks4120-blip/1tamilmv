import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../supabase';
import AdSlot from '../AdUnits';

const TIERS = ['4K', '2K', '1080p', '720p', '480p'];
const TIER_LABEL = { '4K': '4K UHD', '2K': '2K QHD', '1080p': 'Full HD', '720p': 'HD', '480p': 'SD' };
const TIER_COLOR = {
  '4K':    { bg: '#fef9c3', fg: '#a16207', border: '#fde68a' },
  '2K':    { bg: '#fef9c3', fg: '#a16207', border: '#fde68a' },
  '1080p': { bg: '#dcfce7', fg: '#15803d', border: '#bbf7d0' },
  '720p':  { bg: '#dcfce7', fg: '#15803d', border: '#bbf7d0' },
  '480p':  { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' },
};

const T = {
  bg:        '#f8fafc',
  surface:   '#ffffff',
  surface2:  '#f1f5f9',
  border:    '#e2e8f0',
  text:      '#0f172a',
  muted:     '#64748b',
  accent:    '#2563eb',
  accentBg:  '#eff6ff',
  accentBdr: '#bfdbfe',
};

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 150'%3E%3Crect fill='%23e2e8f0' width='100' height='150'/%3E%3C/svg%3E";

const TIER_ALIASES = [
  [/^(4k|2160p?|uhd)$/i, '4K'],
  [/^(2k|1440p?|qhd)$/i, '2K'],
  [/^1080p?$/i, '1080p'],
  [/^720p?$/i, '720p'],
  [/^(480p?|sd)$/i, '480p'],
];

function normalizeTier(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  for (const [re, canon] of TIER_ALIASES) if (re.test(s)) return canon;
  const m = s.match(/\b(2160|1440|1080|720|480)p?\b/i) || s.match(/\b(4k|2k)\b/i);
  if (!m) return null;
  return normalizeTier(m[0]);
}

function tiersFromTitle(title) {
  if (!title) return [];
  const m = title.match(/\[([^\]]*(?:p|K)[^\]]*)\]/i);
  if (!m) return [];
  return m[1].split(/[,&]/).map(s => normalizeTier(s.trim())).filter(Boolean);
}

function tierFromSize(size) {
  if (!size) return null;
  const m = String(size).match(/([\d.]+)\s*(GB|MB)/i);
  if (!m) return null;
  const v = parseFloat(m[1]) * (/GB/i.test(m[2]) ? 1000 : 1);
  if (v >= 15000) return '4K';
  if (v >= 7000)  return '1080p';
  if (v >= 1500)  return '720p';
  if (v >= 400)   return '480p';
  return null;
}

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
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 40, color: T.text }}>
      <Link to="/" style={{ color: T.accent }}>← Back</Link>
      <p style={{ opacity: 0.6, marginTop: 24 }}>{error}</p>
    </div>
  );

  if (!movie) return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 40, color: T.muted }}>Loading...</div>
  );

  const dls = Array.isArray(movie.downloads) ? movie.downloads : [];
  const titleHint = tiersFromTitle(movie.title);
  const groups = Object.fromEntries(TIERS.map(t => [t, []]));
  const unknown = [];

  dls.forEach(d => {
    let t = normalizeTier(d.tier) || normalizeTier(d.format);
    if (!t && titleHint.length === 1) t = titleHint[0];
    if (!t) t = tierFromSize(d.size);
    if (t && groups[t]) groups[t].push(d);
    else unknown.push(d);
  });

  const langs = movie.languages || [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 12px 48px', background: T.bg, minHeight: '100vh', color: T.text }}>

      <Link to="/" style={{ display: 'inline-block', marginBottom: 14, color: T.accent, fontSize: 13, textDecoration: 'none' }}>
        ← Back
      </Link>

      {/* Hero: poster + info */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, padding: '14px 16px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }}>
        <img
          src={movie.poster_url || PLACEHOLDER}
          alt={movie.title}
          referrerPolicy="no-referrer"
          onError={e => { e.currentTarget.src = PLACEHOLDER; e.currentTarget.onerror = null; }}
          style={{ width: 90, height: 135, objectFit: 'cover', borderRadius: 8, background: T.surface2, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 10px', lineHeight: 1.3, color: T.text }}>{movie.title}</h1>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {movie.year && <Pill>{movie.year}</Pill>}
            {langs.map(l => <Pill key={l}>{l}</Pill>)}
          </div>
          {dls.length > 0 && (
            <div style={{ fontSize: 12, color: T.muted }}>
              {dls.length} download{dls.length > 1 ? 's' : ''} available
            </div>
          )}
        </div>
      </div>

      {/* Top ad — responsive banner */}
      <AdSlot placement="detail-top" type="responsive" />

      {dls.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>No downloads available.</div>
      ) : (
        <>
          {TIERS.map(tier => {
            const rows = groups[tier];
            if (!rows.length) return null;
            const col = TIER_COLOR[tier] || TIER_COLOR['720p'];
            return (
              <div key={tier} style={{ marginBottom: 20 }}>
                {/* tier heading */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 800,
                    background: col.bg, color: col.fg, border: `1px solid ${col.border}`,
                  }}>{tier}</span>
                  <span style={{ fontSize: 12, color: T.muted }}>
                    {TIER_LABEL[tier]} · {rows.length} option{rows.length > 1 ? 's' : ''}
                  </span>
                </div>

                {rows.map((d, i) => <DownloadRow key={i} d={d} movie={movie} />)}

                {/* ad after each tier's download rows */}
                <AdSlot placement={`detail-tier-${tier}`} type="rectangle" />
              </div>
            );
          })}

          {unknown.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 800,
                  background: T.surface2, color: T.muted, border: `1px solid ${T.border}`,
                }}>Other</span>
                <span style={{ fontSize: 12, color: T.muted }}>
                  Unsorted · {unknown.length} option{unknown.length > 1 ? 's' : ''}
                </span>
              </div>
              {unknown.map((d, i) => <DownloadRow key={`o${i}`} d={d} movie={movie} />)}
              <AdSlot placement="detail-other" type="rectangle" />
            </div>
          )}
        </>
      )}

      {/* Bottom ad */}
      <AdSlot placement="detail-bottom" type="responsive" />
    </div>
  );
}

function DownloadRow({ d, movie }) {
  const langText = d.langs || (movie.languages || []).join(' + ') || '—';
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      padding: '10px 14px', borderRadius: 8, marginBottom: 6,
      border: `1px solid ${T.border}`, background: T.surface, fontSize: 13,
    }}>
      {/* File size — prominent */}
      <span style={{
        fontWeight: 800, minWidth: 68, fontSize: 13,
        color: d.size ? T.text : T.muted,
        background: d.size ? T.surface2 : 'transparent',
        padding: d.size ? '3px 8px' : '0',
        borderRadius: 6,
        border: d.size ? `1px solid ${T.border}` : 'none',
      }}>{d.size || '—'}</span>

      {/* Audio/language */}
      <span style={{ flex: 1, minWidth: 130, color: T.text }}>
        <span style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', marginRight: 6 }}>Audio</span>
        {langText}
      </span>

      {/* Download buttons */}
      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {d.magnet     && <DLBtn href={d.magnet}      kind="magnet">MAGNET</DLBtn>}
        {d.torrent_url && <DLBtn href={d.torrent_url} kind="torrent">.TORRENT</DLBtn>}
        {d.direct_url  && <DLBtn href={d.direct_url}  kind="direct" external>DIRECT</DLBtn>}
      </span>
    </div>
  );
}

function Pill({ children }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: T.accentBg, color: T.accent, border: `1px solid ${T.accentBdr}`,
    }}>{children}</span>
  );
}

function DLBtn({ href, kind, external, children }) {
  const styles = {
    magnet:  { bg: '#dcfce7', color: '#15803d' },
    torrent: { bg: '#eff6ff', color: '#2563eb' },
    direct:  { bg: '#fff7ed', color: '#c2410c' },
  }[kind] || { bg: T.surface2, color: T.text };
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      style={{
        padding: '6px 12px', borderRadius: 6,
        background: styles.bg, color: styles.color,
        fontSize: 11, fontWeight: 800, textDecoration: 'none', letterSpacing: 0.4,
      }}
    >{children}</a>
  );
}
