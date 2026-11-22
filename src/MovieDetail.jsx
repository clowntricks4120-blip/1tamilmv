// language: jsx, file: src/MovieDetail.jsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from './supabase';
import './movie.css';

const GROUPS = ['4K', '2K', '1080p', '720p', '480p'];
const LABELS = { '4K': '4K UHD', '2K': '2K QHD', '1080p': 'Full HD', '720p': 'HD', '480p': 'SD' };
const BADGE  = { '4K': 'uhd', '2K': 'uhd', '1080p': 'mid', '720p': 'mid' };

export default function MovieDetail() {
  const { id } = useParams();
  const [movie, setMovie] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('movies').select('*').eq('topic_id', id).single()
      .then(({ data, error: e }) => {
        if (e || !data) setError(e?.message || 'Not found');
        else setMovie(data);
      });
  }, [id]);

  if (error) return <div className="mv-wrap"><div className="mv-empty"><strong>{error}</strong></div></div>;
  if (!movie) return <div className="mv-wrap"><div className="mv-empty">Loading...</div></div>;

  const dls = Array.isArray(movie.downloads) ? movie.downloads : [];
  const groups = {};
  dls.forEach(d => { const t = d.tier || '720p'; (groups[t] ||= []).push(d); });

  return (
    <div className="mv-wrap mv-detail">
      <Link to="/movies" className="mv-back">← Back to movies</Link>

      <div className="mv-hero">
        <div className="mv-hero-poster">
          <img src={movie.poster_url || ''} alt={movie.title} referrerPolicy="no-referrer" />
        </div>
        <div className="mv-hero-info">
          <h1>{movie.title}</h1>
          <div className="mv-meta">
            {movie.year && <span className="pill">{movie.year}</span>}
            {(movie.languages || []).map(l => <span key={l} className="pill">{l}</span>)}
            <span className="pill neutral">{dls.length} downloads</span>
          </div>
          <a className="mv-btn-ghost" href={movie.source_url} target="_blank" rel="noopener noreferrer">
            View original source →
          </a>
        </div>
      </div>

      <div className="mv-ad-slot">Advertisement</div>

      <h2 className="mv-section">Download Options</h2>

      {GROUPS.map(tier => {
        const arr = groups[tier];
        if (!arr?.length) return null;
        return (
          <div key={tier} className="mv-group">
            <div className="mv-group-head">
              <span className={`mv-badge ${BADGE[tier] || ''}`}>{tier}</span>
              <span className="mv-group-label">{LABELS[tier]} · {arr.length} option{arr.length > 1 ? 's' : ''}</span>
            </div>
            {arr.map((d, i) => (
              <div key={i} className="mv-dl-row">
                <div className="size">{d.size || '—'}</div>
                <div className="lang"><span>Audio</span>{d.langs || (movie.languages || []).join(' + ') || '—'}</div>
                <div className="quality">{d.quality || d.format || tier}</div>
                <div className="actions">
                  {d.magnet && <a className="dl magnet" href={d.magnet}>Magnet</a>}
                  {d.torrent_url && <a className="dl torrent" href={d.torrent_url}>.torrent</a>}
                  {d.direct_url && <a className="dl direct" href={d.direct_url} target="_blank" rel="noopener noreferrer">Direct</a>}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div className="mv-ad-slot">Advertisement</div>
    </div>
  );
}
