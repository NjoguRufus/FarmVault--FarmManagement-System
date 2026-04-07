#!/usr/bin/env node
/**
 * Prints VAPID key pair for Web Push. Add to Supabase Edge secrets and VITE_VAPID_PUBLIC_KEY for the app.
 *
 *   npm run generate:vapid
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("Add these to your environment (never commit the private key to git):\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("\nOptional contact (shown to push services):");
console.log("VAPID_CONTACT=mailto:support@yourdomain.com");
console.log("\nFrontend (.env):");
console.log(`VITE_VAPID_PUBLIC_KEY=${keys.publicKey}`);
