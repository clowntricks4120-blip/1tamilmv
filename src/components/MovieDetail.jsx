// language: jsx, file: src/components/MovieDetail.jsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../supabase';

const TIERS = ['4K', '2K', '1080p', '720p', '480p'];
const TIER_LABEL = { '4K': '4K UHD', '2K': '2K QHD', '1080p': 'Full HD', '720p': 'HD', '480p': 'SD' };
const TIER_COLOR = {
  '4K':    { bg: 'rgba(234,179,8,.15)', fg: '#eab308' },
  '2K':    { bg: 'rgba(234,179,8,.15)', fg: '#eab308' },
  '1080p': { bg: 'rgba(34,197,94,.15)', fg: '#22c55e' },
  '720p':  { bg: 'rgba(34,197,94,.15)', fg: '#22c55e' },
  '480p':  { bg: 'rgba(34,197,94,.15)', fg: '#22c55e' },
};

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
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 40, color: '#f0f0f2' }}>
      <Link to="/" style={{ color: '#ff6b1a' }}>← Back</Link>
      <p style={{ opacity: 0.7, marginTop: 24 }}>{error}</p>
    </div>
  );

  if (!movie) return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 40, color: '#f0f0f2', opacity: 0.6 }}>
      Loading...
    </div>
  );

  const dls = Array.isArray(movie.downloads) ? movie.downloads : [];
  const groups = {};
  dls.forEach(d => {
    const t = d.tier || '720p';
    (groups[t] ||= []).push(d);
  });

  const official = Array.isArray(movie.official_links) ? movie.official_links : [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 64px', color: '#f0f0f2' }}>
      <Link to="/" style={{ display: 'inline-block', marginBottom: 24, color: '#ff6b1a', fontSize: 13, textDecoration: 'none' }}>
        ← Back to movies
      </Link>

      {/* hero */}
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 28 }}>
        <div style={{ width: 220, flexShrink: 0, borderRadius: 14, overflow: 'hidden', background: '#1b1b20' }}>
          {movie.poster_url ? (
            <img src={movie.poster_url} alt={movie.title} referrerPolicy="no-referrer"
                 style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', aspectRatio: '2/3', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
              No poster
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 34, lineHeight: 1.1, margin: '0 0 14px' }}>{movie.title}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {movie.year && <Pill>{movie.year}</Pill>}
            {(movie.languages || []).map(l => <Pill key={l}>{l}</Pill>)}
            {(movie.genres || []).map(g => <Pill key={g} neutral>{g}</Pill>)}
            {dls.length > 0 && <Pill neutral>{dls.length} downloads</Pill>}
          </div>
          {movie.source_url && (
            <a href={movie.source_url} target="_blank" rel="noopener noreferrer"
               style={{ display: 'inline-block', padding: '9px 16px', borderRadius: 8,
                        border: '1px solid #26262c', color: '#f0f0f2', fontSize: 13, textDecoration: 'none' }}>
              View original source →
            </a>
          )}
        </div>
      </div>

      {movie.synopsis && (
        <section style={{ marginBottom: 24 }}>
          <SectionLabel>Synopsis</SectionLabel>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, opacity: 0.85 }}>{movie.synopsis}</p>
        </section>
      )}

      {movie.trailer_url && (
        <section style={{ marginBottom: 24 }}>
          <SectionLabel>Trailer</SectionLabel>
          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0,
                        borderRadius: 10, overflow: 'hidden', background: '#000' }}>
            <iframe
              src={movie.trailer_url} title="Trailer"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </section>
      )}

      <AdSlot />

      {dls.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <SectionLabel>Downloads</SectionLabel>
          <h2 style={{ fontSize: 20, margin: '0 0 16px' }}>Available options</h2>
          {TIERS.map(tier => {
            const rows = groups[tier];
            if (!rows || !rows.length) return null;
            const col = TIER_COLOR[tier] || { bg: 'rgba(255,255,255,.08)', fg: '#f0f0f2' };
            return (
              <div key={tier} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 800,
                                 background: col.bg, color: col.fg }}>{tier}</span>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>
                    {TIER_LABEL[tier]} · {rows.length} option{rows.length > 1 ? 's' : ''}
                  </span>
                </div>
                {rows.map((d, i) => (
                  <div key={i} style={{
                    display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
                    padding: '10px 14px', borderRadius: 8, marginBottom: 6,
                    border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.02)',
                  }}>
                    <span style={{ fontWeight: 800, fontSize: 14, minWidth: 70 }}>{d.size || '—'}</span>
                    <span style={{ fontSize: 13, flex: 1, minWidth: 140 }}>
                      <span style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase', marginRight: 6 }}>Audio</span>
                      {d.langs || (movie.languages || []).join(' + ') || '—'}
                    </span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      {d.magnet && <DlBtn href={d.magnet} kind="magnet">MAGNET</DlBtn>}
                      {d.torrent_url && <DlBtn href={d.torrent_url} kind="torrent">.TORRENT</DlBtn>}
                      {d.direct_url && <DlBtn href={d.direct_url} kind="direct" external>DIRECT</DlBtn>}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      )}

      {official.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <SectionLabel>Official destinations</SectionLabel>
          <h2 style={{ fontSize: 20, margin: '0 0 16px' }}>Watch legally</h2>
          {official.map((link, i) => (
            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
               style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px', borderRadius: 10, marginBottom: 8,
                        border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.02)',
                        color: '#f0f0f2', textDecoration: 'none', fontSize: 14 }}>
              <span>{link.platform || link.label || 'Watch'}</span>
              <span style={{ color: '#ff6b1a', fontWeight: 700 }}>Open →</span>
            </a>
          ))}
        </section>
      )}

      <AdSlot />
    </div>
  );
}

function Pill({ children, neutral }) {
  return (
    <span style={{
      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: neutral ? '#141418' : 'rgba(255,107,26,.12)',
      border: `1px solid ${neutral ? '#26262c' : 'rgba(255,107,26,.3)'}`,
      color: neutral ? '#8a8a92' : '#ff6b1a',
    }}>{children}</span>
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.55, margin: '0 0 6px' }}>
      {children}
    </p>
  );
}

function DlBtn({ href, kind, external, children }) {
  const palette = {
    magnet:  { bg: '#1e5c3e', color: '#b8f0d3' },
    torrent: { bg: 'rgba(255,107,26,.15)', color: '#ff6b1a' },
    direct:  { bg: '#4a2a1d', color: '#ffb38a' },
  }[kind] || { bg: '#26262c', color: '#f0f0f2' };
  return (
    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}
       style={{
         padding: '6px 12px', borderRadius: 6, background: palette.bg, color: palette.color,
         fontSize: 11, fontWeight: 800, textDecoration: 'none', letterSpacing: 0.4,
       }}>{children}</a>
  );
}

function AdSlot() {
  return (
    <div style={{
      margin: '20px 0', padding: 20, minHeight: 90, borderRadius: 10,
      border: '1px dashed #2a2a32', background: '#13131a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#4a4a52', fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase',
    }}>Advertisement</div>
  );
}
