import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, PlayCircle, Calendar, Languages, Tag, Film } from 'lucide-react'
import { supabase } from '../supabase'
export default function MovieDetail() {
  const { id } = useParams()
  const [movie,setMovie] = useState(null), [loading,setLoading] = useState(true), [error,setError] = useState('')
  useEffect(()=>{let active=true;(async()=>{if(!supabase){setLoading(false);return}const {data,error}=await supabase.from('movies').select('*').eq('id',id).eq('published',true).single();if(!active)return;if(error)setError(error.message);else setMovie(data);setLoading(false)})();return()=>{active=false}},[id])
  if(loading)return <div className="page-wrap"><div className="empty-state">Loading movie...</div></div>
  if(error||!movie)return <div className="page-wrap"><div className="empty-state"><h2>Movie not found</h2><p>{error}</p><Link to="/" className="button primary">Back to movies</Link></div></div>
  return <section className="page-wrap detail-wrap"><Link to="/" className="back-link"><ArrowLeft size={16}/> Back to discovery</Link><div className="detail-hero"><div className="detail-poster">{movie.poster_url?<img src={movie.poster_url} alt={movie.title}/>:<Film size={48}/>}</div><div className="detail-info"><span className="eyebrow">MOVIE DETAILS</span><h1>{movie.title}</h1><div className="detail-pills">{movie.year&&<span><Calendar size={14}/>{movie.year}</span>}{(movie.languages||[]).map(x=><span key={x}><Languages size={14}/>{x}</span>)}</div>{movie.synopsis&&<p className="synopsis">{movie.synopsis}</p>}{(movie.genres||[]).length>0&&<div className="genre-row"><Tag size={15}/>{movie.genres.join(' · ')}</div>}{movie.trailer_url&&<a className="button primary" href={movie.trailer_url} target="_blank" rel="noreferrer"><PlayCircle size={17}/> Watch official trailer</a>}</div></div>
    {movie.official_links?.length>0&&<div className="official-panel"><div className="section-heading"><div><span className="eyebrow">WHERE TO WATCH</span><h2>Official destinations</h2></div></div>{movie.official_links.map((x,i)=><a className="official-link" href={x.url} key={i} target="_blank" rel="noreferrer"><span><strong>{x.label||'Official platform'}</strong><small>Opens an external official destination</small></span><ExternalLink size={17}/></a>)}</div>}
  </section>
}