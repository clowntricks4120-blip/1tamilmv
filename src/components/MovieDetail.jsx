import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../supabase';
import AdSlot from '../AdUnits';

const POPUP_URL = 'https://asiafilm.org/4/af8d33a9342f88de85fe6fb1cdd20009';

const TIERS = ['4K', '2K', '1080p', '720p', '480p'];
const TIER_LABEL = { '4K': '4K UHD', '2K': '2K QHD', '1080p': 'Full HD', '720p': 'HD', '480p': 'SD' };

const TIER_STYLE = {
  '4K':    { headerBg: '#fffbeb', pillBg: '#fef3c7', pillFg: '#92400e', nameFg: '#b45309', bar: '#f59e0b' },
  '2K':    { headerBg: '#fffbeb', pillBg: '#fef3c7', pillFg: '#92400e', nameFg: '#b45309', bar: '#f59e0b' },
  '1080p': { headerBg: '#f0fdf4', pillBg: '#dcfce7', pillFg: '#14532d', nameFg: '#15803d', bar: '#22c55e' },
  '720p':  { headerBg: '#eff6ff', pillBg: '#dbeafe', pillFg: '#1e3a8a', nameFg: '#1d4ed8', bar: '#3b82f6' },
  '480p':  { headerBg: '#faf5ff', pillBg: '#f3e8ff', pillFg: '#4a1d96', nameFg: '#7c3aed', bar: '#a855f7' },
};

const T = {
  bg:        '#f8fafc',
  surface:   '#ffffff',
  surface2:  '#f1f5f9',
  border:    '#e2e8f0',
  borderMid: '#cbd5e1',
  text:      '#0f172a',
  muted:     '#64748b',
  faint:     '#94a3b8',
  accent:    '#2563eb',
  accentBg:  '#eff6ff',
  accentBdr: '#bfdbfe',
};

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 150'%3E%3Crect fill='%23e2e8f0' width='100' height='150'/%3E%3C/svg%3E";

const TIER_ALIASES = [
  [/^(4k|2160p?|uhd)$/i,   '4K'],
  [/^(2k|1440p?|qhd)$/i,   '2K'],
  [/^1080p?$/i,             '1080p'],
  [/^720p?$/i,              '720p'],
  [/^(480p?|sd)$/i,         '480p'],
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
  if (v >= 10000) return '4K';
  if (v >= 2000)  return '1080p';
  if (v >= 800)   return '720p';
  return '480p';
}

function parseDownloads(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
    catch { return []; }
  }
  return [];
}

const SIZE_RE = /([\d]+(?:\.\d+)?)\s*(GB|MB|TB)/i;

function sizeFromMagnet(magnet) {
  if (!magnet) return null;
  try {
    const dn = new URLSearchParams(magnet.split('?')[1] || '').get('dn') || '';
    const decoded = decodeURIComponent(dn).replace(/\+/g, ' ');
    const m = decoded.match(SIZE_RE);
    if (m) return m[1] + m[2].toUpperCase();
  } catch { /* ignore */ }
  return null;
}

function getSize(d) {
  if (!d) return null;
  const fromMagnet = sizeFromMagnet(d.magnet);
  if (fromMagnet) return fromMagnet;
  const v = d.size;
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  const m = s.match(SIZE_RE);
  if (m) return m[1] + m[2].toUpperCase();
  return null;
}

function buildTierSizeMaps(title) {
  if (!title) return { tierSizeMap: {}, tierSizeLists: {} };
  const TIER_RE  = /\b(2160p|4k|uhd|1440p|2k|1080p|720p|480p|360p)\b/gi;
  const SIZE_RE_G = /\b(\d+(?:\.\d+)?)\s*(GB|MB|TB)\b/gi;
  const tiers = [], sizes = [];
  let m;
  while ((m = TIER_RE.exec(title))   !== null) tiers.push({ canon: normalizeTier(m[0]), idx: m.index });
  while ((m = SIZE_RE_G.exec(title)) !== null) sizes.push({ val: m[1] + m[2].toUpperCase(), idx: m.index });
  if (!tiers.length || !sizes.length) return { tierSizeMap: {}, tierSizeLists: {} };
  const seenTiers = new Set();
  const uniqueTiers = [...tiers].sort((a, b) => a.idx - b.idx).filter(t => {
    if (!t.canon || seenTiers.has(t.canon)) return false;
    seenTiers.add(t.canon); return true;
  });
  const sortedSizes = [...sizes].sort((a, b) => a.idx - b.idx);
  const tierSizeMap = {};
  uniqueTiers.forEach((t, i) => { if (sortedSizes[i]) tierSizeMap[t.canon] = sortedSizes[i].val; });
  const allTokens = [
    ...uniqueTiers.map(t => ({ type: 'tier', canon: t.canon, idx: t.idx })),
    ...sortedSizes.map(s => ({ type: 'size', val: s.val, idx: s.idx })),
  ].sort((a, b) => a.idx - b.idx);
  const tierSizeLists = {};
  let cur = null;
  for (const tok of allTokens) {
    if (tok.type === 'tier') { cur = tok.canon; if (!tierSizeLists[cur]) tierSizeLists[cur] = []; }
    else if (tok.type === 'size' && cur) tierSizeLists[cur].push(tok.val);
  }
  return { tierSizeMap, tierSizeLists };
}

function codecFromMagnet(magnet) {
  if (!magnet) return '';
  try {
    const dn = decodeURIComponent((new URLSearchParams(magnet.split('?')[1] || '')).get('dn') || '').replace(/\+/g, ' ');
    if (/\b(hevc|x265|h\.?265)\b/i.test(dn)) return 'HEVC';
    if (/\b(avc|x264|h\.?264)\b/i.test(dn))  return 'AVC';
  } catch { /* ignore */ }
  return '';
}

function audioFromMagnet(magnet) {
  if (!magnet) return '';
  try {
    const dn = decodeURIComponent((new URLSearchParams(magnet.split('?')[1] || '')).get('dn') || '').replace(/\+/g, ' ');
    if (/\b(dd\+5\.1|ddp5\.1|e-?ac-?3|eac3|atmos)\b/i.test(dn)) return 'DD+ 5.1';
    if (/\b(dd5\.1|ac-?3)\b/i.test(dn)) return 'DD 5.1';
    if (/\bdts\b/i.test(dn))  return 'DTS';
    if (/\baac\b/i.test(dn))  return 'AAC';
  } catch { /* ignore */ }
  return '';
}

function bitrateFromMagnet(magnet) {
  if (!magnet) return '';
  try {
    const dn = decodeURIComponent((new URLSearchParams(magnet.split('?')[1] || '')).get('dn') || '').replace(/\+/g, ' ');
    const m = dn.match(/\b(\d+)\s*kbps\b/i);
    if (m) return m[1] + 'Kbps';
  } catch { /* ignore */ }
  return '';
}

/* ─── Main component ─── */
export default function MovieDetail() {
  const { id } = useParams();
  const [movie, setMovie]       = useState(null);
  const [error, setError]       = useState('');
  const [popupDone, setPopupDone] = useState(false);

  useEffect(() => {
    supabase.from('movies').select('*').eq('id', id).single()
      .then(({ data, error: e }) => {
        if (e || !data) setError(e?.message || 'Not found');
        else setMovie(data);
      });
  }, [id]);

  const handlePageClick = () => {
    if (popupDone) return;
    setPopupDone(true);
    window.open(POPUP_URL, '_blank', 'noopener');
  };

  if (error) return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 40, color: T.text }}>
      <Link to="/" style={{ color: T.accent }}>← Back</Link>
      <p style={{ opacity: 0.6, marginTop: 24 }}>{error}</p>
    </div>
  );

  if (!movie) return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 40, color: T.muted }}>Loading…</div>
  );

  const dls = parseDownloads(movie.downloads);
  const { tierSizeLists } = buildTierSizeMaps(movie.title);
  const titleHint = tiersFromTitle(movie.title);
  const groups  = Object.fromEntries(TIERS.map(t => [t, []]));
  const unknown = [];

  dls.forEach(d => {
    let t = normalizeTier(d.tier);
    if (!t && titleHint.length === 1) t = titleHint[0];
    if (!t) t = tierFromSize(getSize(d));
    if (t && groups[t]) groups[t].push(d);
    else unknown.push(d);
  });

  const langs       = movie.languages || [];
  const activeTiers = TIERS.filter(t => groups[t].length > 0);

  return (
    <div
      style={{ background: T.bg, minHeight: '100vh', color: T.text, fontFamily: "'Inter', system-ui, sans-serif" }}
      onClick={handlePageClick}
    >
      {/* ── Back bar ── */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '10px 14px' }}>
        <Link
          to="/"
          onClick={e => e.stopPropagation()}
          style={{ color: T.accent, fontSize: 13, textDecoration: 'none', fontWeight: 500 }}
        >
          ← Back to movies
        </Link>
      </div>

      {/* ── Top ad ── */}
      <div style={{ padding: '10px 14px 0' }} onClick={e => e.stopPropagation()}>
        <AdSlot placement="detail-top" type="mobile" />
      </div>

      {/* ── Hero ── */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '14px 14px 16px' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', maxWidth: 860, margin: '0 auto' }}>
          <img
            src={movie.poster_url || PLACEHOLDER}
            alt={movie.title}
            referrerPolicy="no-referrer"
            onError={e => { e.currentTarget.src = PLACEHOLDER; e.currentTarget.onerror = null; }}
            style={{ width: 88, height: 130, objectFit: 'cover', borderRadius: 10, border: `1px solid ${T.border}`, flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', lineHeight: 1.3, color: T.text }}>
              {movie.title}
            </h1>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
              {[movie.year, langs.join(' · ')].filter(Boolean).join(' · ')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              {langs.map(l => <LangPill key={l}>{l}</LangPill>)}
              {movie.year && <LangPill>{movie.year}</LangPill>}
            </div>
            {dls.length > 0 && (
              <div style={{ fontSize: 11, color: T.faint, fontWeight: 500 }}>
                {dls.length} download{dls.length > 1 ? 's' : ''} available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Downloads ── */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '12px 14px 40px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: T.faint, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          Available downloads
        </div>

        {dls.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: T.muted }}>No downloads available.</div>
        ) : (
          <>
            {activeTiers.map((tier, ti) => {
              const rows = groups[tier];
              const st   = TIER_STYLE[tier] || TIER_STYLE['480p'];
              return (
                <div key={tier}>
                  {/* Tier card */}
                  <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}`, marginBottom: 10 }}>
                    {/* Tier header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: st.headerBg, borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 20, background: st.pillBg, color: st.pillFg }}>
                        {tier}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: st.nameFg }}>{TIER_LABEL[tier]}</span>
                      <span style={{ fontSize: 11, color: T.faint, marginLeft: 'auto' }}>{rows.length} file{rows.length > 1 ? 's' : ''}</span>
                    </div>

                    {/* Download rows */}
                    {rows.map((d, i) => {
                      const sizeHint = (tierSizeLists[tier] || [])[i] || null;
                      return <DownloadRow key={i} d={d} movie={movie} sizeHint={sizeHint} accentBar={st.bar} isLast={i === rows.length - 1} />;
                    })}
                  </div>

                  {/* Ad after each tier */}
                  <div style={{ marginBottom: 14 }} onClick={e => e.stopPropagation()}>
                    <AdSlot placement={`detail-tier-${tier}`} type="mobile" />
                  </div>
                </div>
              );
            })}

            {/* Unknown tier rows */}
            {unknown.length > 0 && (
              <div>
                <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}`, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 20, background: T.border, color: T.muted }}>Other</span>
                    <span style={{ fontSize: 11, color: T.faint, marginLeft: 'auto' }}>{unknown.length} file{unknown.length > 1 ? 's' : ''}</span>
                  </div>
                  {unknown.map((d, i) => (
                    <DownloadRow key={`o${i}`} d={d} movie={movie} sizeHint={null} accentBar={T.borderMid} isLast={i === unknown.length - 1} />
                  ))}
                </div>
                <div style={{ marginBottom: 14 }} onClick={e => e.stopPropagation()}>
                  <AdSlot placement="detail-other" type="mobile" />
                </div>
              </div>
            )}
          </>
        )}

        {/* Bottom ad */}
        <div onClick={e => e.stopPropagation()}>
          <AdSlot placement="detail-bottom" type="mobile" />
        </div>
      </div>
    </div>
  );
}

/* ─── Download row — 2-line layout ─── */
function DownloadRow({ d, movie, sizeHint, accentBar, isLast }) {
  const size = getSize(d) || sizeHint || null;

  const rawCodec   = d.codec   || codecFromMagnet(d.magnet);
  const codecShort = rawCodec === 'HEVC' ? 'HEVC (x265)' : rawCodec === 'AVC' ? 'AVC (x264)' : rawCodec || '—';

  const audio   = d.audio   || audioFromMagnet(d.magnet);
  const bitrate = d.bitrate || bitrateFromMagnet(d.magnet);
  const langText = d.langs || (movie.languages || []).join(' + ') || '';
  const subParts = [audio, bitrate, langText].filter(Boolean);
  const subLine  = subParts.join(' · ');

  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: isLast ? 'none' : `1px solid ${T.border}`,
      background: T.surface,
      position: 'relative',
    }}>
      {/* Left accent bar */}
      <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, background: accentBar, borderRadius: '0 2px 2px 0' }} />

      {/* Line 1: codec ←→ size */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3, paddingLeft: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{codecShort}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#334155', flexShrink: 0, marginLeft: 8 }}>{size || '—'}</span>
      </div>

      {/* Line 2: audio/lang info ←→ buttons */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, paddingLeft: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: T.faint, flex: 1, minWidth: 0, lineHeight: 1.5 }}>
          {subLine || ' '}
        </span>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignSelf: 'flex-end' }} onClick={e => e.stopPropagation()}>
          {d.magnet      && <DLBtn href={d.magnet}      kind="magnet">Magnet</DLBtn>}
          {d.torrent_url && <DLBtn href={d.torrent_url} kind="torrent">Torrent</DLBtn>}
          {d.direct_url  && <DLBtn href={d.direct_url}  kind="direct" external>Direct</DLBtn>}
        </div>
      </div>
    </div>
  );
}

function LangPill({ children }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
      background: T.accentBg, color: T.accent, border: `1px solid ${T.accentBdr}`,
    }}>{children}</span>
  );
}

function DLBtn({ href, kind, external, children }) {
  const s = {
    magnet:  { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    torrent: { bg: T.surface2, color: '#475569', border: T.border },
    direct:  { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  }[kind] || { bg: T.surface2, color: T.muted, border: T.border };

  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      style={{
        padding: '4px 10px', borderRadius: 7,
        background: s.bg, color: s.color,
        border: `1px solid ${s.border}`,
        fontSize: 11, fontWeight: 700,
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}
    >{children}</a>
  );
}
