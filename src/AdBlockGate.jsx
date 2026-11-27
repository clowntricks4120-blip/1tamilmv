import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import './AdBlockGate.css';

const ADMIN_PATH = '/admin';

/* Bait-div cosmetic detection only — no network requests that can false-positive */
function checkAdBlocking() {
  return new Promise((resolve) => {
    // Create several divs with class names adblockers always hide
    const baits = [
      'adsbox',
      'ad-banner',
      'adsbygoogle',
      'advertisement',
      'ad-container',
      'advert',
      'ad-unit',
    ].map((cls) => {
      const el = document.createElement('div');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText =
        'position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;opacity:1;display:block;';
      document.body.appendChild(el);
      return el;
    });

    // Wait 600ms for adblocker CSS rules to apply
    setTimeout(() => {
      let blocked = false;
      try {
        blocked = baits.some((el) => {
          // Removed from DOM entirely = blocked
          if (!document.body.contains(el)) return true;
          const cs = window.getComputedStyle(el);
          return (
            cs.display === 'none' ||
            cs.visibility === 'hidden' ||
            cs.opacity === '0' ||
            cs.maxHeight === '0px' ||
            cs.overflow === 'hidden' && cs.height === '0px'
          );
        });
      } catch {
        blocked = false; // On any error, allow — don't punish real users
      } finally {
        baits.forEach((el) => {
          if (document.body.contains(el)) document.body.removeChild(el);
        });
      }
      resolve(blocked);
    }, 600);
  });
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
        // Error = allow, never false-block real users
        if (!cancelled) setStatus('allowed');
      });
    return () => { cancelled = true; };
  }, [isAdmin, attempt]);

  if (isAdmin || status === 'allowed') return children;

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
