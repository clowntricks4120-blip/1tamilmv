import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LockKeyhole, Film } from 'lucide-react'
import { supabase } from '../supabase'
export default function AdminLogin(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const nav=useNavigate()
 async function submit(e){e.preventDefault();setError('');if(!supabase){setError('Configure Supabase first.');return}setBusy(true);const {error}=await supabase.auth.signInWithPassword({email,password});setBusy(false);if(error)setError(error.message);else nav('/admin')}
 return <div className="auth-wrap"><form className="auth-card" onSubmit={submit}><div className="auth-icon"><LockKeyhole/></div><span className="eyebrow">CONTROL CENTRE</span><h1>Admin sign in</h1><p>Sign in with an account authorized in the admin_users table.</p>{error&&<div className="form-error">{error}</div>}<label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@example.com"/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label><button className="button primary full" disabled={busy}>{busy?'Signing in...':'Sign in securely'}</button><Link to="/" className="back-link centered"><Film size={15}/> Return to website</Link></form></div>
}