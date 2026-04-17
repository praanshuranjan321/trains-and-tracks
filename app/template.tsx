'use client';

// Page template — runs on every navigation. Adds a subtle 200ms fade so
// route transitions don't flash. Kept minimal — heavier animations belong
// in per-page GSAP work, not here.

import { motion } from 'motion/react';

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="contents"
    >
      {children}
    </motion.div>
  );
}
