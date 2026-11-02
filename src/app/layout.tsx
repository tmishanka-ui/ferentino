import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Shell } from '@/components/Shell';

export const metadata: Metadata = {
  title: 'Ferentino Management System',
  description: 'Quality control dashboards and the shop-floor working apps of Ferentino Industrial Tyres, together in one place.',
  icons: { icon: '/logo.jpg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0d0f13' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
