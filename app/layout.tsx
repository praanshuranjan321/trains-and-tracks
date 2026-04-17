import type { Metadata } from 'next';
import { Anton, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

const anton = Anton({
  variable: '--font-display',
  subsets: ['latin'],
  weight: '400',
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
      className={`${inter.variable} ${jetbrainsMono.variable} ${anton.variable} h-full dark antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
