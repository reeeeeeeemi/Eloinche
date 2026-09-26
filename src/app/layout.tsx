import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Coinche CDM',
  description: 'Les parties de coinche du CDM, avec classement Elo',
  // icônes : src/app/icon.svg (onglet) et src/app/apple-icon.png (écran d'accueil iPhone), détectées par Next
  appleWebApp: { capable: true, title: 'Coinche', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f1f6f5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
