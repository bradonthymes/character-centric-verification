import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      'https://videoqa-dataset-verification.bmt-wcpa.chatgpt.site',
  ),
  title: 'VideoQA Dataset Verification',
  description:
    'A focused research annotation workspace for verifying VideoQA questions, reference answers, and atomic claims.',
  openGraph: {
    title: 'VideoQA Dataset Verification',
    description: 'Human review of questions, answers, and atomic claims.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'VideoQA Dataset Verification research interface',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VideoQA Dataset Verification',
    description: 'Human review of questions, answers, and atomic claims.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
