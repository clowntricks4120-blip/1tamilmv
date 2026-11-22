import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, SlidersHorizontal, Film } from 'lucide-react'
import { supabase } from '../supabase'

const LANGS = ['All', 'Tamil', 'Telugu', 'Hindi', 'Malayalam', 'Kannada', 'English']
export default function MovieGrid() {
  const [movies, setMovies] = useState([])
  const [loading, setLoading] = useState(true)
  const [lang, setLang] = useState('All')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      if (!supabase) { setMovies([]); setLoading(false); return }
      setLoading(true); setError('')
      let req = supabase.from('movies').select('id,title,year,poster_url,languages,genres,featured')
        .eq('published', true).order('created_at', { ascending: false }).limit(120)
      if (query.trim()) req = req.ilike('title', `%${query.trim()}%`)
      if (lang !== 'All') req = req.contains('languages', [lang])
      const { data, error } = await req
      if (!active) return
      if (error) setError(error.message); else setMovies(data || [])
      setLoading(false)
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [query, lang])
  return <section className="page-wrap">
    <div className="hero-banner"><div className="hero-copy"><span className="eyebrow"><span className="live-dot"/> YOUR CINEMA COMPANION</span><h1>Find your next<br/><span className="gradient-text">favourite film.</span></h1><p>Explore movies, discover cast details and find official trailers and streaming destinations.</p></div><div className="hero-art"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><Film size={88}/><span className="hero-art-label">CINEMA / DISCOVERY</span></div></div>
    <div className="section-heading" id="latest"><div><span className="eyebrow">THE COLLECTION</span><h2>Discover movies</h2></div><span className="muted"><SlidersHorizontal size={15}/> Curated catalogue</span></div>
    <div className="filter-bar"><div className="language-filters">{LANGS.map(x=><button key={x} onClick={()=>setLang(x)} className={lang===x?'filter-chip active':'filter-chip'}>{x}</button>)}</div><label className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search movie titles..."/>{query && <button onClick={()=>setQuery('')}>Clear</button>}</label></div>
    {loading ? <div className="movie-grid">{Array.from({length:10},(_,i)=><div className="movie-skeleton" key={i}><div/><span/><i/></div>)}</div>
      : error ? <div className="empty-state"><h3>Couldn't load movies</h3><p>{error}</p></div>
      : movies.length ? <div className="movie-grid">{movies.map(m=><Link className="movie-card" to={`/movies/${m.id}`} key={m.id}><div className="poster-frame">{m.featured && <span className="featured-tag">FEATURED</span>}{m.poster_url ? <img src={m.poster_url} alt={m.title} loading="lazy"/> : <div className="poster-fallback"><Film size={32}/></div>}</div><div className="movie-card-info"><h3>{m.title}</h3><div className="movie-sub"><span>{m.year || 'Year TBA'}</span><span>{(m.languages||[]).slice(0,2).join(' · ')}</span></div></div></Link>)}</div>
      : <div className="empty-state"><div className="empty-icon"><Film/></div><h3>No movies found</h3><p>Add published titles from your admin dashboard.</p></div>}
  </section>
}