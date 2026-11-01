/**
 * Configuration publique de l'app. SEULES des valeurs publiques ici :
 * l'URL Supabase et la clé « anon » sont faites pour être dans l'app.
 * Les clés secrètes (OpenAI, Meta, Stripe, chiffrement) vivent UNIQUEMENT
 * dans les secrets des Edge Functions Supabase (voir README).
 */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

/** Le serveur est-il branché ? Sans lui : pas de compte en ligne, pas d'IA, pas de publication. */
export const isBackendConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
