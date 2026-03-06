// JS shim: re-export the TypeScript Supabase client so Vite/esbuild
// resolve the same exports (including getSupabaseAccessToken).
export * from './supabase.ts';