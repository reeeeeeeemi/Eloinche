/**
 * Envoi des notifications push. Appelée uniquement par la base (send_push dans supabase/schema.sql,
 * via pg_net), avec le secret partagé PUSH_SECRET. Les abonnements expirés sont oubliés en base.
 */
import { createClient } from '@supabase/supabase-js';
import webpush, { type PushSubscription } from 'web-push';

interface Payload {
  subscriptions: PushSubscription[];
  title: string;
  body: string;
  url: string;
}

export async function POST(request: Request) {
  const secret = process.env.PUSH_SECRET;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!secret || !publicKey || !privateKey) return new Response('notifications non configurées', { status: 503 });
  if (request.headers.get('x-push-secret') !== secret) return new Response('interdit', { status: 401 });

  const { subscriptions, title, body, url } = (await request.json()) as Payload;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'https://eloinche.vercel.app', publicKey, privateKey);

  const expired: string[] = [];
  await Promise.all(subscriptions.map(s =>
    webpush.sendNotification(s, JSON.stringify({ title, body, url }), { TTL: 60 * 60 * 24 })
      .catch((e: { statusCode?: number }) => {
        if (e.statusCode === 404 || e.statusCode === 410) expired.push(s.endpoint);
      }),
  ));

  if (expired.length) {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await db.rpc('forget_push_subscriptions', { p_secret: secret, p_endpoints: expired });
  }
  return Response.json({ sent: subscriptions.length - expired.length, expired: expired.length });
}
