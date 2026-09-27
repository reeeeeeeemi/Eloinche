/**
 * Notifications push côté navigateur : service worker (public/sw.js) + abonnement de l'appareil.
 * L'envoi se fait côté serveur (supabase/schema.sql -> send_push -> src/app/api/push/route.ts).
 */
import { api } from './data';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** Clés VAPID renseignées (sinon on n'affiche rien). */
export const pushConfigured = !!VAPID_PUBLIC_KEY;

export type PushState = 'unsupported' | 'install' | 'denied' | 'off' | 'on';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches;

function urlBase64ToUint8Array(base64: string) {
  const b64 = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function toSub(s: PushSubscription) {
  const j = s.toJSON();
  return { endpoint: s.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' };
}

const registration = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });

/** État des notifications sur cet appareil. Sur iPhone, il faut d'abord ajouter l'appli à l'écran d'accueil. */
export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined' || !VAPID_PUBLIC_KEY) return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub || Notification.permission !== 'granted') return 'off';
  // rattache l'appareil au joueur connecté (utile après un changement de compte)
  await api.savePushSubscription(toSub(sub)).catch(() => {});
  return 'on';
}

export async function enablePush(): Promise<PushState> {
  if (await Notification.requestPermission() !== 'granted') return 'denied';
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) });
  await api.savePushSubscription(toSub(sub));
  return 'on';
}

/** Coupe les notifications de cet appareil (aussi appelé à la déconnexion). */
export async function disablePush(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.deletePushSubscription(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}
