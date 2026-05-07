---
name: Smart Companion Notification System
description: Full companion notification system built May 2026 — architecture, files, cron schedule, what was built vs what existed
type: project
---

Built the complete Smart Companion Notification System in FarmVault (May 2026).

**Why:** To make FarmVault feel like "a farming companion walking with the farmer every day" — increasing engagement, emotional connection, and retention.

**How to apply:** When modifying notifications, messaging cron, or companion UI, reference this memory for where everything lives.

## What already existed (do not duplicate):
- `farmer_smart_inbox` table — stores morning/evening/weekly messages with dismiss state
- `farmer_smart_messaging_state` table — rotation state to avoid repeat messages
- `engagement-email-cron` Edge Function — the main cron handler
- `smartDailyMessaging.ts` + `smartDailyMessagingPools.ts` — message building + 365-line pools
- `FarmerSmartMessageBanner.tsx` — dashboard banner (updated during this work)
- `useFarmerSmartInbox.ts` — hook to fetch/dismiss inbox messages
- pg_cron jobs: morning (03:30 UTC), evening Mon-Sat (16:00 UTC), weekly Sunday (16:00 UTC)

## What was built:

### Database (migration: 20260506100000)
- `public.notification_preferences` — per-user opt-in toggles (morning/evening/inactivity/weekly + email/in_app channels)
- `public.companion_inactivity_log` — tracks which inactivity tier (2d/5d/7d/14d) was sent per user per week
- New pg_cron job: inactivity at 09:00 UTC daily (noon EAT)

### Backend
- `smartDailyMessagingPools.ts` — added INACTIVITY pools (10 messages per tier: 2d/5d/7d/14d) + helper exports
- `smartDailyMessaging.ts` — added `loadCompanionPreferences()`, `detectInactivityTier()`, `recordInactivityTierSent()`
- `_shared/farmvault-email/companionEmailTemplates.ts` — branded HTML templates using farmVaultEmailShell for morning, evening, inactivity (per tier), weekly summary
- `engagement-email-cron/index.ts` — complete rewrite: uses companion templates, checks prefs, tiered inactivity, all 4 runs use `insertFarmerInbox` for in-app delivery

### Frontend
- `src/components/companion/SmartCompanionCenter.tsx` — full slide-out Sheet with 3 tabs: Companion Messages (grouped by morning/evening/weekly) | System Alerts | Settings
- `src/components/companion/CompanionPreferencesPanel.tsx` — 6 toggle rows for type + channel preferences
- `src/hooks/useCompanionPreferences.ts` — React Query hook to load/upsert `notification_preferences`
- `TopNavbar.tsx` — added `<SmartCompanionCenter>` next to notification bell (leaf icon, company/farmer users only)
- `FarmerSmartMessageBanner.tsx` — enhanced with slot-aware icons + "View all messages" link to SmartCompanionCenter

## Inactivity tier logic:
- 2d ≤ days_inactive < 5d → tier "2d" (gentle)
- 5d ≤ days_inactive < 7d → tier "5d" (warmer)
- 7d ≤ days_inactive < 14d → tier "7d" (heartfelt)
- days_inactive ≥ 14d → tier "14d" (deeply personal)
- Each tier sent max once per UTC calendar week per user per company
- Detection uses `profile.updated_at` as proxy for last login
