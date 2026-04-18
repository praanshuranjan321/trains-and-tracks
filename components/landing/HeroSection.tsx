'use client';

// Full-bleed editorial hero — client component because the GSAP image parallax
// + framer-motion staggered content reveal both need the browser. The image
// fills the entire viewport (no tonal gradient overlays — the flat illustration
// carries itself); text legibility is ensured by drop-shadows on each glyph
// block.

import Link from 'next/link';
import Image from 'next/image';
import { useRef } from 'react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

import { buttonVariants } from '@/components/ui/button';

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Reveal variants shared across the content stagger.
const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.09, delayChildren: 0.35 },
  },
};

const item = {
  hidden: { opacity: 0, y: 24, filter: 'blur(6px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const imageWrapRef = useRef<HTMLDivElement>(null);

  // GSAP ScrollTrigger — subtle parallax: image translates up ~18% of its own
  // height as the hero scrolls out, paired with a small scale creep for depth.
  // Honors prefers-reduced-motion via matchMedia (ScrollTrigger doesn't respect
  // the CSS query automatically).
  useGSAP(
    () => {
      if (typeof window === 'undefined') return;
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;

      const ctx = gsap.context(() => {
        gsap.to(imageWrapRef.current, {
          yPercent: -14,
          scale: 1.08,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: 0.6,
          },
        });
      }, sectionRef);

      return () => ctx.revert();
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      className="relative isolate flex min-h-screen flex-col overflow-hidden bg-ink text-cloud-ivory"
    >
      {/* Full-bleed illustration — GSAP-animated wrapper. No tonal gradient
          overlays: the flat illustration is the hero. */}
      <div
        ref={imageWrapRef}
        className="absolute inset-0 -z-20 h-full w-full will-change-transform"
      >
        <Image
          src="/hero_image.png"
          alt="Illustration — red passenger train crossing a stone-arch viaduct over a mountain lake, snow-capped peaks and cloud bank in the distance. Flat-colour style referencing Swiss SBB editorial."
          fill
          priority
          sizes="100vw"
          className="select-none object-cover object-[65%_50%]"
        />
      </div>

      {/* Paper-grain overlay — keeps flat digital areas from feeling CRT-smooth
          without darkening the illustration. */}
      <svg
        className="pointer-events-none absolute inset-0 -z-0 h-full w-full opacity-[0.04] mix-blend-overlay"
        aria-hidden
      >
        <filter id="hero-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#hero-grain)" />
      </svg>

      {/* Top rubric bar. */}
      <motion.header
        className="relative z-10 border-b border-cloud-ivory/20 bg-ink/20 backdrop-blur-[2px]"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 font-mono text-[10px] uppercase tracking-[0.22em] text-cloud-ivory sm:text-[11px]">
          <div className="flex items-center gap-3 drop-shadow-[0_1px_6px_rgba(10,12,14,0.55)]">
            <span aria-hidden className="inline-flex h-1.5 w-1.5 rounded-full bg-train-red" />
            <span translate="no">Trains &amp; Tracks</span>
            <span aria-hidden className="hidden text-cloud-ivory/40 sm:inline">
              /
            </span>
            <span className="hidden sm:inline">№ 01 · Departures</span>
          </div>
          <div className="hidden items-center gap-5 drop-shadow-[0_1px_6px_rgba(10,12,14,0.55)] md:flex">
            <span>NDLS → BCT</span>
            <span aria-hidden className="text-cloud-ivory/40">
              ·
            </span>
            <span>Est. April 2026</span>
          </div>
        </div>
      </motion.header>

      {/* Overlay content — pinned bottom-left, staggered reveal. */}
      <div className="relative z-10 flex flex-1 items-end">
        <motion.div
          className="mx-auto w-full max-w-7xl px-6 pb-16 pt-24 sm:pb-20 lg:pb-24"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          <div className="max-w-[56rem]">
            <motion.div
              variants={item}
              className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-train-red drop-shadow-[0_1px_8px_rgba(10,12,14,0.65)] sm:text-[11px]"
            >
              <span aria-hidden className="h-px w-8 bg-train-red/80" />
              <span>The Tatkal problem, solved</span>
            </motion.div>

            <motion.h1
              variants={item}
              className="mt-6 font-serif font-medium uppercase text-balance text-cloud-ivory [text-shadow:0_2px_24px_rgba(10,12,14,0.55),0_1px_3px_rgba(10,12,14,0.6)]"
              style={{
                fontSize: 'clamp(3rem, 8vw, 8rem)',
                lineHeight: 0.9,
                letterSpacing: '-0.03em',
                fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
              }}
            >
              Exactly once.
              <span className="block">Every time.</span>
            </motion.h1>

            <motion.div variants={item} className="mt-10 flex items-start gap-4">
              <span aria-hidden className="mt-3 hidden h-px w-10 shrink-0 bg-cloud-ivory/60 sm:block" />
              <p
                className="max-w-[38ch] font-serif italic text-cloud-ivory [text-shadow:0_1px_14px_rgba(10,12,14,0.6)]"
                style={{
                  fontSize: 'clamp(1.125rem, 2.1vw, 1.5rem)',
                  lineHeight: 1.35,
                  fontVariationSettings: '"opsz" 36, "SOFT" 0',
                }}
              >
                What IRCTC Tatkal should have been.
              </p>
            </motion.div>

            <motion.div variants={item} className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-4">
              <Link
                href="/book"
                className={buttonVariants({
                  size: 'lg',
                  className:
                    'group h-12 gap-2 rounded-none bg-train-red px-7 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-cloud-ivory shadow-[0_10px_36px_rgba(193,74,74,0.4)] transition-[background-color,color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-train-red-dark hover:text-paper hover:shadow-[0_14px_48px_rgba(193,74,74,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                })}
              >
                Try Booking
                <ArrowRight
                  aria-hidden
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                />
              </Link>
              <Link
                href="/ops"
                className={buttonVariants({
                  size: 'lg',
                  variant: 'outline',
                  className:
                    'h-12 gap-2 rounded-none border-cloud-ivory/60 bg-ink/30 px-7 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-cloud-ivory backdrop-blur-sm transition-[background-color,border-color,color,transform] duration-200 hover:-translate-y-0.5 hover:border-cloud-ivory hover:bg-cloud-ivory/10 hover:text-cloud-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                })}
              >
                See It Running
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Foot strip — ticker + scroll cue. */}
      <motion.footer
        className="relative z-10 border-t border-cloud-ivory/20 bg-ink/25 backdrop-blur-[2px]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 1.0 }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 font-mono text-[10px] uppercase tracking-[0.28em] text-cloud-ivory sm:text-[11px]">
          <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden drop-shadow-[0_1px_6px_rgba(10,12,14,0.55)]">
            <span aria-hidden className="hidden shrink-0 text-cloud-ivory/50 sm:inline">
              ◂
            </span>
            <span className="flex min-w-0 items-center gap-4 truncate">
              <span className="shrink-0">Effectively-once execution</span>
              <span aria-hidden className="shrink-0 text-cloud-ivory/40">
                ·
              </span>
              <span className="hidden shrink-0 sm:inline">FOR UPDATE SKIP LOCKED</span>
              <span aria-hidden className="hidden shrink-0 text-cloud-ivory/40 sm:inline">
                ·
              </span>
              <span className="hidden shrink-0 md:inline">Stripe-contract idempotency</span>
              <span aria-hidden className="hidden shrink-0 text-cloud-ivory/40 md:inline">
                ·
              </span>
              <span className="hidden shrink-0 lg:inline">QStash flow control</span>
            </span>
          </div>
          <a
            href="#problem"
            className="group flex shrink-0 items-center gap-2 rounded-sm px-1 text-cloud-ivory drop-shadow-[0_1px_6px_rgba(10,12,14,0.55)] transition-colors duration-200 hover:text-cloud-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-ink motion-reduce:transition-none"
          >
            <span>Scroll</span>
            <motion.span
              aria-hidden
              animate={{ y: [0, 4, 0] }}
              transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.4 }}
              className="inline-flex motion-reduce:transform-none"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </motion.span>
          </a>
        </div>
      </motion.footer>
    </section>
  );
}
