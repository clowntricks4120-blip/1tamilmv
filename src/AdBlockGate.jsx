import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import './AdBlockGate.css';

const ADMIN_PATH = '/admin';

/* ── Detection method 1: bait-div cosmetic filter ── */
function baitCheck() {
  return new Promise((resolve) => {
    const classes = [
      'adsbox',
      'ad-banner',
      'ad-unit',
      'advertisement',
      'ad-container',
      'adsbygoogle',
      'advert',
    ];
    const baits = classes.map((cls) => {
      const el = document.createElement('div');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText =
        'position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;';
      document.body.appendChild(el);
      return el;
    });

    setTimeout(() => {
      let blocked = false;
      try {
        blocked = baits.some((el) => {
          if (!document.body.contains(el)) return true;
          const cs = window.getComputedStyle(el);
          return (
            cs.display === 'none' ||
            cs.visibility === 'hidden' ||
            cs.opacity === '0' ||
            parseInt(cs.maxHeight || '1', 10) === 0
          );
        });
      } catch {
        blocked = false;
      } finally {
        baits.forEach((el) => el.parentNode && el.parentNode.removeChild(el));
      }
      resolve(blocked);
    }, 500);
  });
}

/* ── Detection method 2: try fetching a known ad URL ── */
function networkCheck() {
  return new Promise((resolve) => {
    const img = new Image();
    const timeout = setTimeout(() => { img.src = ''; resolve(true); }, 3000);
    img.onload = () => { clearTimeout(timeout); resolve(false); };
    img.onerror = () => { clearTimeout(timeout); resolve(true); };
    // Use a URL pattern adblockers always block
    img.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?' + Date.now();
  });
}

/* ── Run both checks; blocked if either says blocked ── */
async function checkAdBlocking() {
  const [bait, network] = await Promise.all([baitCheck(), networkCheck()]);
  return bait || network;
}

export default function AdBlockGate({ children }) {
  const [status, setStatus] = useState('checking');
  const [attempt, setAttempt] = useState(0);

  const isAdmin =
    window.location.pathname === ADMIN_PATH ||
    window.location.pathname.startsWith(ADMIN_PATH + '/');

  const retry = useCallback(() => {
    setStatus('checking');
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (isAdmin) return;
    let cancelled = false;
    setStatus('checking');
    checkAdBlocking()
      .then((blocked) => {
        if (!cancelled) setStatus(blocked ? 'blocked' : 'allowed');
      })
      .catch(() => {
        // On error default to allowed so legit users aren't blocked
        if (!cancelled) setStatus('allowed');
      });
    return () => { cancelled = true; };
  }, [isAdmin, attempt]);

  /* Always block render until check is done */
  if (isAdmin) return children;
  if (status === 'allowed') return children;

  /* Checking or blocked — show gate */
  return (
    <div className="abg-screen">
      <div className="abg-card">
        <div className="abg-icon-wrap">
          <ShieldAlert size={32} aria-hidden="true" />
        </div>

        {status === 'checking' ? (
          <>
            <h1 className="abg-title">Checking your browser…</h1>
            <p className="abg-desc">Please wait a moment.</p>
            <div className="abg-spinner" aria-label="Checking" />
          </>
        ) : (
          <>
            <h1 className="abg-title">Ad Blocker Detected</h1>
            <p className="abg-desc">
              1TamilMV is <strong>100% free</strong> — ads keep it running.
              <br />
              Please <strong>disable your ad blocker</strong> for this site, then click Retry.
            </p>

            <div className="abg-steps">
              <div className="abg-step">
                <span className="abg-num">1</span>
                Click your adblocker icon in the browser toolbar
              </div>
              <div className="abg-step">
                <span className="abg-num">2</span>
                Pause or disable it for <strong>this site</strong>
              </div>
              <div className="abg-step">
                <span className="abg-num">3</span>
                Click the Retry button below
              </div>
            </div>

            <button type="button" className="abg-btn" onClick={retry}>
              <RefreshCw size={16} aria-hidden="true" />
              I've Disabled It — Retry
            </button>

            <p className="abg-note">
              Using a DNS blocker or browser shield? Disable it for this domain too.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
