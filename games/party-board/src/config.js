const url=(import.meta.env.VITE_SUPABASE_URL||'').trim();
const publishableKey=(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY||'').trim();

export const supabaseConfig=Object.freeze({
  url,
  publishableKey,
  isConfigured:/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)&&publishableKey.length>20,
});

export const gameConfig=Object.freeze({
  players:4,
  globalTurns:60,
  startingCoins:20,
  startingStars:0,
  inventorySize:6,
});
