import { useEffect, useState } from 'react'
import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom'
import { Film, Search, Shield, Menu, X, Clapperboard } from 'lucide-react'
import MovieGrid from './components/MovieGrid'
import MovieDetail from './components/MovieDetail'
import Admin from './pages/Admin'
import AdminLogin from './pages/AdminLogin'
import { isSupabaseConfigured, supabase } from './supabase'

function Header() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  return <header className="site-header">
    <div className="header-inner">
      <Link to="/" className="brand"><span className="brand-mark"><Film size={20}/></span><span>1TAMIL<span className="accent">MV</span></span></Link>
      <button className="mobile-menu icon-btn" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X/> : <Menu/>}</button>
      <nav className={open ? 'nav open' : 'nav'}>
        <NavLink to="/" end>Discover</NavLink><a href="/#latest">Latest</a><NavLink to="/admin/login" className="admin-nav"><Shield size={15}/> Admin</NavLink>
      </nav>
    </div>
  </header>
}

function SetupNotice() {
  return <div className="setup-notice"><strong>Supabase is not configured.</strong><span>Copy <code>.env.example</code> to <code>.env</code>, add your Supabase project URL and anon key, then restart the dev server.</span></div>
}
export default function App() {
  return <div className="app-shell"><Header/>{!isSupabaseConfigured && <SetupNotice/>}
    <main><Routes>
      <Route path="/" element={<MovieGrid/>}/>
      <Route path="/movies/:id" element={<MovieDetail/>}/>
      <Route path="/admin/login" element={<AdminLogin/>}/>
      <Route path="/admin/*" element={<Admin/>}/>
      <Route path="*" element={<div className="empty-state"><h2>Page not found</h2><Link className="button primary" to="/">Back to discover</Link></div>}/>
    </Routes></main>
    <footer className="footer"><div className="footer-brand"><Clapperboard size={18}/> 1TamilMV</div><span>Movie discovery · Official sources only</span><span>© {new Date().getFullYear()} 1TamilMV</span></footer>
  </div>
}