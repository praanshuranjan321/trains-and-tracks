'use client';

// Editorial loading screen — ink field + paper-grain, centered serif brand
// wordmark that reveals letter-by-letter, a hairline progress bar that fills
// over ~1.4s, and a rotating mono caption cycling through the correctness
// primitives. Stays mounted for a minimum dwell time (so it reads as
// intentional, not as a flash of fallback content) then fades out.

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

const CAPTIONS = [
  'Acquiring locks',
  'Reserving seats',
  'Charging payments',
  'Issuing tickets',
  'Holding idempotency',
];

// Minimum visible dwell so the loader never flashes for < this duration even
// on an instant local load. 1600 ms lets a single caption cycle finish.
const MIN_DWELL_MS = 1600;

export function LoadingScreen() {
  const [visible, setVisible] = useState(true);
  const [captionIdx, setCaptionIdx] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    // Hide after page is fully loaded + minimum dwell has elapsed.
    const finish = () => {
      const elapsed = performance.now() - startedAt;
      const wait = Math.max(0, MIN_DWELL_MS - elapsed);
      window.setTimeout(() => setVisible(false), wait);
    };
    if (document.readyState === 'complete') {
      finish();
    } else {
      window.addEventListener('load', finish, { once: true });
    }

    // Rotate captions every 320 ms.
    const rot = window.setInterval(() => {
      setCaptionIdx((i) => (i + 1) % CAPTIONS.length);
    }, 320);

    return () => {
      window.removeEventListener('load', finish);
      window.clearInterval(rot);
    };
  }, []);

  // Lock body scroll while the loader is up so the page behind doesn't flash
  // any half-hydrated state. Restored on unmount.
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  const brand = 'Trains & Tracks';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="loader"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink text-cloud-ivory"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } }}
          aria-busy="true"
          aria-live="polite"
          role="status"
        >
          {/* Paper-grain noise — carries aesthetic continuity into the hero. */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05] mix-blend-overlay"
            aria-hidden
          >
            <filter id="loader-grain">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#loader-grain)" />
          </svg>

          <div className="relative flex flex-col items-center gap-10 px-6">
            {/* Top rubric — pulsing dot + edition marker. */}
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-cloud-ivory/55 sm:text-[11px]">
              <span aria-hidden className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-train-red opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-train-red" />
              </span>
              <span>N° 01 · Departures</span>
            </div>

            {/* Brand wordmark — letter-by-letter reveal. */}
            <motion.h1
              className="font-serif italic text-cloud-ivory"
              style={{
                fontSize: 'clamp(2.75rem, 7vw, 5.5rem)',
                lineHeight: 1,
                letterSpacing: '-0.02em',
                fontVariationSettings: '"opsz" 144, "SOFT" 50',
              }}
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
              }}
              aria-label={brand}
            >
              {brand.split('').map((ch, i) => (
                <motion.span
                  key={`${ch}-${i}`}
                  aria-hidden
                  variants={{
                    hidden: { opacity: 0, y: '0.35em', filter: 'blur(6px)' },
                    visible: {
                      opacity: ch === ' ' ? 0 : 1,
                      y: 0,
                      filter: 'blur(0px)',
                      transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
                    },
                  }}
                  style={{ display: 'inline-block', whiteSpace: 'pre' }}
                >
                  {ch}
                </motion.span>
              ))}
            </motion.h1>

            {/* Hairline progress bar. */}
            <div className="relative h-px w-64 overflow-hidden bg-cloud-ivory/15 sm:w-96">
              <motion.div
                className="absolute inset-y-0 left-0 bg-train-red"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              />
            </div>

            {/* Rotating caption with layout animation — type cross-fades. */}
            <div className="h-5 overflow-hidden">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={CAPTIONS[captionIdx]}
                  className="font-mono text-[10px] uppercase tracking-[0.3em] text-cloud-ivory/60 sm:text-[11px]"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  {CAPTIONS[captionIdx]}
                  <span className="ml-1 text-cloud-ivory/30">…</span>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Corner printer's marks — match the hero plate rhythm. */}
          <span
            aria-hidden
            className="absolute left-6 top-6 h-4 w-4 border-l border-t border-cloud-ivory/25"
          />
          <span
            aria-hidden
            className="absolute right-6 top-6 h-4 w-4 border-r border-t border-cloud-ivory/25"
          />
          <span
            aria-hidden
            className="absolute bottom-6 left-6 h-4 w-4 border-b border-l border-cloud-ivory/25"
          />
          <span
            aria-hidden
            className="absolute bottom-6 right-6 h-4 w-4 border-b border-r border-cloud-ivory/25"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
