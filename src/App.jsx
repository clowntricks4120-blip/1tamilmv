// language: jsx, file: src/App.jsx
import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { Film, Menu, X, ExternalLink, Clapperboard } from 'lucide-react'
import MovieGrid from './components/MovieGrid'
import MovieDetail from './components/MovieDetail'
import { isSupabaseConfigured } from './supabase'

const MODDED_APPS_URL = 'https://ct.clowntricks4120.workers.dev'

function Header() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="brand">
          <span className="brand-mark"><Film size={20}/></span>
          <span>1TAMIL<span className="accent">MV</span></span>
        </Link>
        <button className="mobile-menu icon-btn" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X/> : <Menu/>}
        </button>
        <nav className={open ? 'nav open' : 'nav'}>
          <a href={MODDED_APPS_URL} target="_blank" rel="noopener noreferrer" className="nav-external">
            Modded Apps <ExternalLink size={13}/>
          </a>
        </nav>
      </div>
    </header>
  )
}

function SetupNotice() {
  return (
    <div className="setup-notice">
      <strong>Supabase is not configured.</strong>
      <span>Copy <code>.env.example</code> to <code>.env</code>, add your Supabase project URL and anon key, then restart the dev server.</span>
    </div>
  )
}

export default function App() {
  return (
    <div className="app-shell">
      <Header/>
      {!isSupabaseConfigured && <SetupNotice/>}
      <main>
        <Routes>
          <Route path="/" element={<MovieGrid/>}/>
          <Route path="/movies/:id" element={<MovieDetail/>}/>
          <Route path="*" element={
            <div className="empty-state">
              <h2>Page not found</h2>
              <Link className="button primary" to="/">Back to home</Link>
            </div>
          }/>
        </Routes>
      </main>
      <footer className="footer">
        <div className="footer-brand"><Clapperboard size={18}/> 1TamilMV</div>
        <span>Free Movies Download</span>
        <span>
          © {new Date().getFullYear()} 1TamilMV ·{' '}
          <a href={MODDED_APPS_URL} target="_blank" rel="noopener noreferrer" className="footer-link">
            ct.clowntricks4120.workers.dev
          </a>
        </span>
      </footer>
    </div>
  )
}
