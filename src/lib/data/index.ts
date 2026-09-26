/**
 * Point d'entrée unique pour les données. Le front n'importe QUE ce fichier.
 * NEXT_PUBLIC_DATA_SOURCE = 'mock' (local : JSON + localStorage) ou 'supabase' (prod).
 */
import type { DataApi } from '../types';
import { mockApi } from './mock';
import { supabaseApi } from './supabase';

export const DATA_SOURCE = process.env.NEXT_PUBLIC_DATA_SOURCE === 'supabase' ? 'supabase' : 'mock';
export const api: DataApi = DATA_SOURCE === 'supabase' ? supabaseApi : mockApi;
export { DB_EVENT } from './events';
