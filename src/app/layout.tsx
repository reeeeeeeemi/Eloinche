import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Eloinche',
  description: 'Vos parties de coinche entre potes, avec un classement Elo par groupe',
  // icônes : src/app/icon.svg (onglet) et src/app/apple-icon.png (écran d'accueil iPhone), détectées par Next
  appleWebApp: { capable: true, title: 'Eloinche', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // pas de zoom (pincer, double-toucher, ni zoom auto d'iOS sur les champs) : l'appli se comporte comme une appli native
  maximumScale: 1,
  userScalable: false,
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
