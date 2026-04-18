import type { Metadata } from 'next';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { LoadingScreen } from '@/components/landing/LoadingScreen';

// Body text. Named --font-inter (not --font-sans) so the Tailwind `@theme`
// `--font-sans` token can compose with a fallback stack without self-reference.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

// Numerics, rubric micro-caps, operator-dashboard labels.
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  display: 'swap',
});

// Editorial serif — variable axes (opsz / SOFT / WONK) let the same face carry
// poster-display ("EXACTLY ONCE.") and 24 px italic pull-quotes without
// swapping family. Chosen over Playfair for warmer, less wedding-invite
// character; closest Google Fonts approximation to PP Editorial New / Migra.
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Trains and Tracks — Exactly once. Every time.',
  description:
    'A reservation engine that survives Tatkal. No duplicates, no silent drops, no payment-without-ticket. Effectively-once seat allocation under orders-of-magnitude traffic surges.',
  openGraph: {
    title: 'Trains and Tracks — Exactly once. Every time.',
    description:
      'Effectively-once seat allocation under surge. Handles 100K requests in 10s with zero duplicates and zero payment-without-ticket outcomes.',
    type: 'website',
    url: 'https://trains-and-tracks.vercel.app',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trains and Tracks — Exactly once. Every time.',
    description:
      'Effectively-once seat allocation. No duplicates, no hangs, no silent drops.',
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={{ colorScheme: 'dark' }}
      className={`${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable} h-full dark antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <LoadingScreen />
        {children}
      </body>
    </html>
  );
}
