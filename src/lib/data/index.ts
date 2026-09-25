/**
 * Point d'entrée unique pour les données. Le front n'importe QUE ce fichier.
 * Aujourd'hui : mock (JSON + localStorage).
 * Demain : on ajoute supabase.ts qui implémente le même DataApi, et on switche ici
 * via NEXT_PUBLIC_DATA_SOURCE. Aucun autre fichier du front ne bouge.
 */
import type { DataApi } from '../types';
import { mockApi } from './mock';

export const api: DataApi = mockApi;
export const DATA_SOURCE = process.env.NEXT_PUBLIC_DATA_SOURCE ?? 'mock';
export { DB_EVENT } from './mock';
