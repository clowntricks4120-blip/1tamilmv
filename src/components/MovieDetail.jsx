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

// --- tier normalization -----------------------------------------------------
// Accept "4K", "2160p", "4k uhd", "UHD", "1080P", "1080", etc.
// Return canonical tier string, or null if unparseable.
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
  // fallback: scrape the first resolution token out of a free-form string
  const m = s.match(/\b(2160|1440|1080|720|480)p?\b/i) || s.match(/\b(4k|2k)\b/i);
  if (!m) return null;
  return normalizeTier(m[0]);
}

// Parse a title like "[4K, 1080p & 720p]" into a Set of canonical tiers.
// Used as a last-resort hint when d.tier is empty — but ONLY if the entry has
// no own tier, and only to *label* a single link as multi-tier. We do not split
// one link into three links; we label it "Multi" and group by the best tier.
function tiersFromTitle(title) {
  if (!title) return [];
  const m = title.match(/\[([^\]]*(?:p|K)[^\]]*)\]/i);
  if (!m) return [];
  return m[1].split(/[,&]/).map(s => normalizeTier(s.trim())).filter(Boolean);
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
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 40, color: THEME.text }}>
      <Link to="/" style={{ color: THEME.accent }}>← Back</Link>
      <p style={{ opacity: 0.7, marginTop: 24 }}>{error}</p>
    </div>
  );

  if (!movie) return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 40, color: THEME.text, opacity: 0.6 }}>Loading...</div>
  );

  const dls = Array.isArray(movie.downloads) ? movie.downloads : [];
  const titleHint = tiersFromTitle(movie.title);
  const groups = Object.fromEntries(TIERS.map(t => [t, []]));
  const unknown = [];

  dls.forEach(d => {
    // 1) canonicalize the link's own tier
    let t = normalizeTier(d.tier) || normalizeTier(d.format);
    // 2) if still missing, and the movie title advertises exactly one tier, adopt it.
    //    If the title advertises multiple tiers and the link has none, we cannot
    //    guess — route to "Other" so the operator can fix the source data.
    if (!t && titleHint.length === 1) t = titleHint[0];
    // 3) still missing but has a size? try size-implied tier (rough heuristic)
    if (!t) t = tierFromSize(d.size);
    if (t && groups[t]) groups[t].push(d);
    else unknown.push(d);
  });

  const langs = movie.languages || [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 12px 48px', background: THEME.bg, color: THEME.text, minHeight: '100vh' }}>
      <Link to="/" style={{ display: 'inline-block', marginBottom: 14, color: THEME.accent, fontSize: 13, textDecoration: 'none' }}>
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
        <>
          {TIERS.map(tier => {
            const rows = groups[tier];
            if (!rows.length) return null;
            const col = TIER_COLOR[tier] || TIER_COLOR['720p'];
            return (
              <div key={tier} style={{ marginBottom: 20 }}>
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
                <AdBlock />
              </div>
            );
          })}
          {unknown.length > 0 && (
            <div key="other" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 800,
                  background: 'rgba(125,133,144,0.15)', color: '#7d8590',
                  border: '1px solid rgba(125,133,144,0.4)'
                }}>Other</span>
                <span style={{ fontSize: 12, color: THEME.muted }}>
                  Unsorted · {unknown.length} option{unknown.length > 1 ? 's' : ''}
                </span>
              </div>
              {unknown.map((d, i) => (
                <DownloadRow key={`o${i}`} d={d} movie={movie} />
              ))}
              <AdBlock />
            </div>
          )}
        </>
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

// rough size → tier heuristic, used only when tier and format are both empty
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
