/**
 * Documented message bucket shape for the Smart Daily Messaging System.
 * Placeholder lines match product copy; 365 rotating lines are generated in the Edge Function
 * (`supabase/functions/_shared/smartDailyMessagingPools.ts`).
 */
export const FARMER_SMART_MESSAGE_TEMPLATE_JSON = {
  morning: {
    general: [
      "Good morning 🌱 A fresh day on the farm. Plan today's work in FarmVault.",
      "Good morning 🌾 Today's efforts shape your harvest. Track your activities.",
      "Good morning 🚜 Start your farm day organized and focused.",
      "Good morning 📊 Record your farm tasks as they happen.",
      "Good morning 🌱 Stay on top of your farm operations today.",
    ],
    inventory: [
      "Good morning 📦 You only have {{quantity}} {{item}} remaining. Consider restocking.",
      "Good morning 📦 No {{item}} recorded in inventory. Update before starting.",
    ],
    expenses: ["Good morning 💰 Your weekly expenses are KES {{amount}}."],
    harvest: ["Good morning 🌽 Harvest season is active. Track your yields."],
    cropStage: [
      "Good morning 🌱 Planting in progress. Track seeds and inputs.",
      "Good morning 🌿 Monitor crop progress and farm activities.",
      "Good morning 🌾 Harvest time. Record yields as you collect.",
      "Good morning 🧪 Spraying planned? Track chemicals and costs.",
    ],
  },
  evening: {
    general: [
      "Good evening 🌾 How was your farm today? Record your progress.",
      "Good evening 📊 Today's records help tomorrow's decisions.",
      "Good evening 🌱 Update your farm activities before resting.",
      "Good evening 🚜 Capture today's work in FarmVault.",
      "Good evening 🌾 Small records today build smarter farming.",
    ],
    inventory: ["Good evening 📦 You used {{amount}} {{item}} today. Inventory updated."],
    expenses: [
      "Good evening 💰 Today's farm expenses total KES {{amount}}.",
      "Good evening 💰 You recorded {{count}} expenses today.",
    ],
    harvest: [
      "Good evening 🌾 You harvested {{quantity}} {{unit}} today.",
      "Good evening 🚜 Total harvest this week: {{quantity}}.",
    ],
    summary: [
      "Good evening 📊 Here's your weekly farm summary:\n• {{operations}} activities recorded\n• KES {{expenses}} in expenses\n• {{harvest}} harvested\n• {{inventoryUsed}} inventory items used\nKeep up the great work managing your farm.",
    ],
  },
} as const;
