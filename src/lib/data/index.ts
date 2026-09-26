/**
 * Point d'entrée unique pour les données. Le front n'importe QUE ce fichier.
 * NEXT_PUBLIC_DATA_SOURCE = 'mock' (local : JSON + localStorage) ou 'supabase' (prod).
 * Absente : 'supabase' si NEXT_PUBLIC_SUPABASE_URL est définie, sinon 'mock'.
 */
import type { DataApi } from '../types';
import { mockApi } from './mock';
import { supabaseApi } from './supabase';

// Valeur explicite si présente (guillemets / espaces / casse tolérés), sinon Supabase dès que son URL est configurée.
// ⚠ Accès direct à process.env.NEXT_PUBLIC_… : c'est ce que Next remplace par la valeur au build.
const explicit = process.env.NEXT_PUBLIC_DATA_SOURCE?.trim().replace(/^["']|["']$/g, '').toLowerCase();
export const DATA_SOURCE: 'mock' | 'supabase' =
  explicit === 'mock' ? 'mock'
    : explicit === 'supabase' || process.env.NEXT_PUBLIC_SUPABASE_URL ? 'supabase' : 'mock';
export const api: DataApi = DATA_SOURCE === 'supabase' ? supabaseApi : mockApi;
export { DB_EVENT } from './events';
