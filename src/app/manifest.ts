import type { MetadataRoute } from 'next';

/** Installation sur l'écran d'accueil (Android / Chrome) : nom, couleurs et icônes de l'appli. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Coinche CDM',
    short_name: 'Coinche',
    description: 'Le classement Elo de vos parties de coinche',
    start_url: '/',
    display: 'standalone',
    background_color: '#f1f6f5',
    theme_color: '#2f7f78',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
