import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { Film, ExternalLink, Clapperboard } from 'lucide-react'
import MovieGrid from './components/MovieGrid'
import MovieDetail from './components/MovieDetail'
import { isSupabaseConfigured } from './supabase'
import AdBlockGate from './AdBlockGate'

const MODDED_APPS_URL = 'https://ct.clowntricks4120.workers.dev'

function Header() {
  const location = useLocation()
  return (
    <header style={{
      height: 56, borderBottom: '1px solid #e2e8f0', background: '#fff',
      position: 'sticky', top: 0, zIndex: 20,
    }}>
      <div style={{
        maxWidth: 900, height: '100%', padding: '0 16px',
        margin: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: '#0f172a' }}>
          <span style={{
            display: 'grid', placeItems: 'center', width: 30, height: 30,
            borderRadius: 7, background: '#2563eb', color: '#fff', flexShrink: 0,
          }}><Film size={16}/></span>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.4px' }}>
            1TAMIL<span style={{ color: '#2563eb' }}>MV</span>
          </span>
        </Link>
        <a href={MODDED_APPS_URL} target="_blank" rel="noopener noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
          borderRadius: 7, border: '1px solid #bfdbfe', background: '#eff6ff',
          fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none',
        }}>Modded Apps <ExternalLink size={12}/></a>
      </div>
    </header>
  )
}

function SetupNotice() {
  return (
    <div style={{
      maxWidth: 900, margin: '12px auto 0', padding: '10px 14px',
      border: '1px solid #fde68a', background: '#fefce8',
      borderRadius: 8, color: '#92400e', fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap',
    }}>
      <strong>Supabase is not configured.</strong>
      <span>Copy <code>.env.example</code> to <code>.env</code>, add your Supabase project URL and anon key, then restart the dev server.</span>
    </div>
  )
}

export default function App() {
  return (
    <AdBlockGate>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
        <Header/>
        {!isSupabaseConfigured && <SetupNotice/>}
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<MovieGrid/>}/>
            <Route path="/movies/:id" element={<MovieDetail/>}/>
            <Route path="*" element={
              <div style={{ textAlign: 'center', padding: '80px 20px', color: '#64748b' }}>
                <h2 style={{ color: '#0f172a', marginBottom: 16 }}>Page not found</h2>
                <Link to="/" style={{
                  display: 'inline-block', padding: '10px 20px', borderRadius: 8,
                  background: '#2563eb', color: '#fff', textDecoration: 'none', fontWeight: 700,
                }}>Back to home</Link>
              </div>
            }/>
          </Routes>
        </main>
        <footer style={{
          borderTop: '1px solid #e2e8f0', padding: '18px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: '#94a3b8', fontSize: 11, flexWrap: 'wrap', gap: 8, background: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#0f172a', fontWeight: 700, fontSize: 13 }}>
            <Clapperboard size={16}/> 1TamilMV
          </div>
          <span>Free Movies Download</span>
          <span>
            © {new Date().getFullYear()} 1TamilMV ·{' '}
            <a href={MODDED_APPS_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
              ct.clowntricks4120.workers.dev
            </a>
          </span>
        </footer>
      </div>
    </AdBlockGate>
  )
}
