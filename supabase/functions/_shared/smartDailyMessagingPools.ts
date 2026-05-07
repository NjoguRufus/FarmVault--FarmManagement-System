/**
 * Rotating farmer message pools (365 lines each) + template JSON shape for logging/tests.
 * Icons limited to: 🌱 🌾 🚜 📦 💰 📊 🧪
 */

const ICONS = ["🌱", "🌾", "🚜", "📦", "💰", "📊", "🧪"] as const;

const MORNING_CORE: string[] = [
  "A fresh day on the farm — sketch today’s work in FarmVault",
  "Today’s field effort shapes your next harvest",
  "Start organized: soil, crops, and records move together",
  "Small plans this morning prevent big gaps tonight",
  "Your farm runs smoother when tasks are written down early",
  "Check inputs and weather before you head out",
  "Good records turn busy days into clear seasons",
  "Walk the crop mentally — then log what you’ll do",
  "Water, feed, protect: line up priorities while it’s cool",
  "One clear focus beats ten half-done jobs",
  "Track seeds, chemicals, and fuel before the rush",
  "Yesterday’s notes are today’s shortcut",
  "Keep harvest and post-harvest in mind when you plan labour",
  "A calm start helps you spot pests or stress early",
  "Your land rewards steady attention, not heroics",
  "Batch similar jobs to save time between blocks",
  "Update stock ideas before trucks and crews arrive",
  "Measure twice on rates, spacing, and spray volumes",
  "Safety and PPE belong in the morning checklist",
  "If it rained overnight, scout low spots and drainage",
  "Dry mornings are ideal for spraying decisions",
  "Windy days need a different chemical plan",
  "Fuel and oil checks save mid-field stops",
  "Greasing and tire checks are farm insurance",
  "Sharp tools make clean cuts and less disease risk",
  "Calibrate spreaders and sprayers on quiet mornings",
  "Soil moisture guides irrigation — look before you pump",
  "Cover crops and mulch protect what you planted",
  "Weed pressure drops when you catch them young",
  "Scout for eggs and larvae before damage spreads",
  "Birds and rodents love ripe plots — plan deterrents",
  "Harvest crates and grading tables deserve a quick tidy",
  "Cold storage checks belong in the morning routine",
  "Market days need packed lists and clean labels",
  "Cash flow follows what you record — keep receipts tight",
  "Loan and supplier deadlines hide in plain sight",
  "Backup your phone photos of field issues",
  "Share one photo update with your team in FarmVault",
  "Rotate fields in your mind to spread risk",
  "Rest is farm equipment too — pace the crew",
];

const MORNING_TAIL: string[] = [
  "Keep it practical and short.",
  "You’ve got this — one step at a time.",
  "Stay curious in the rows today.",
  "Let FarmVault hold the details.",
  "Precision beats rushing.",
  "Steady hands, steady season.",
  "Small wins compound.",
  "Clarity now saves rework later.",
  "Good farmers adapt by noon.",
  "Trust the plan, adjust with evidence.",
  "Moisture and timing matter most.",
  "Sunrise is the best meeting.",
  "Your fields are talking — listen.",
  "Data turns instinct into confidence.",
  "Harvest starts with healthy leaves.",
  "Roots first, fruit follows.",
  "Clean lines, clean yields.",
  "Respect the label rates.",
  "Measure, don’t guess.",
  "Team sync beats solo heroics.",
  "Stock checks prevent panic buys.",
  "Margins live in the margins.",
  "Rain or shine, log the truth.",
  "Tonight you’ll thank morning-you.",
  "Farm work rewards consistency.",
  "Keep eyes on quality, not just speed.",
  "Soil health is long money.",
  "Biodiversity buffers bad years.",
  "Rotation breaks pest cycles.",
  "Cover the basics before extras.",
  "One accurate row beats three sloppy ones.",
  "Your notebook is a farm asset.",
  "Smile at the first row — momentum follows.",
];

const EVENING_CORE: string[] = [
  "How was the farm today — capture it while it’s fresh",
  "Tonight’s notes become tomorrow’s smarter moves",
  "Close the loop: what you did belongs in FarmVault",
  "A five-minute recap saves hours of guessing later",
  "Harvest, spend, and stock changes all deserve a line",
  "Your future self reads what you write tonight",
  "Weather quirks and pest spots fade — log them now",
  "If inputs moved, the inventory story should match",
  "Reconcile crates, bags, and litres before you rest",
  "Photos plus numbers beat memory every time",
  "What broke, bent, or leaked? Note it for maintenance",
  "Fuel burn tells a story — write the chapter",
  "Chemical batch numbers matter if issues appear",
  "Who did what, where? Short notes prevent disputes",
  "Rain delays are data too — store them honestly",
  "Irrigation hours belong beside crop stage",
  "If you postponed a spray, say why",
  "Partial harvests still count — record both blocks",
  "Quality grades drive price — tag them clearly",
  "Buyers remember consistency — log commitments",
  "Cash sales need the same discipline as invoices",
  "Did training or a demo happen? Note takeaways",
  "Safety near misses are free lessons — record one line",
  "Equipment hours help resale and service intervals",
  "Soil tests are useless in a drawer — link them here",
  "Compost turns and moisture checks stack over weeks",
  "Greenhouse vents and temps swing — trend them",
  "Cold chain checks protect your brand",
  "Packhouse downtime is a cost — timestamp it",
  "Seed germination counts — don’t round away truth",
  "Thinning and pruning numbers guide next season",
  "Pollination windows are narrow — date the pass",
  "Stake and trellis checks prevent collapse losses",
  "Rodent bait stations checked? One checkbox saves bins",
  "Water quality shifts — note any odd smell or color",
  "Neighbor drift concerns deserve a dated sentence",
  "Extension advice received — store the source",
  "Trial plots need labels — future you will forget",
  "Celebrate a clean row — morale is yield too",
];

const EVENING_TAIL: string[] = [
  "Rest well — the land will be there at dawn.",
  "Sharp records make sharp farmers.",
  "Honesty today is profit tomorrow.",
  "You earned the quiet tonight.",
  "Let the numbers cool your worries.",
  "Sleep beats spreadsheet perfection.",
  "Tomorrow starts with truth on the page.",
  "Gratitude pairs well with good data.",
  "The season is a marathon — pace it.",
  "One honest line beats a perfect story.",
  "Your crew trusts clear logs.",
  "Buyers trust repeatable quality.",
  "Banks trust traceable costs.",
  "You’re building a farm memory.",
  "Night shift: keyboard and tea.",
  "Close the barn mentally too.",
  "Dream in rows — wake in plans.",
  "Moisture dreams are farmer dreams.",
  "Stars over the field, data in the pocket.",
  "Quiet night, loud yields later.",
  "Screens down soon — eyes need rest.",
  "Hydrate — farming is athletic.",
  "Stretch — tomorrow bends low again.",
  "Charge tools — morning waits for no one.",
  "Lock stores — peace of mind is yield.",
  "Set the alarm with intention.",
  "Thank the soil — it carried you today.",
  "Small edits tonight, big clarity Monday.",
  "You’re not behind — you’re documenting forward.",
  "Patience is a crop too.",
  "Harvest patience with your harvest data.",
  "Let go of what you can’t control — log what you can.",
  "Breathe out — the farm did its part.",
  "Inbox zero is optional; farm truth isn’t.",
  "Good evening to the grower who shows up.",
];

function buildPool(cores: string[], tails: string[], prefix: "morning" | "evening"): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let k = 0;
  for (const core of cores) {
    for (const tail of tails) {
      const icon = ICONS[k % ICONS.length];
      k++;
      const line =
        prefix === "morning"
          ? `Good morning ${icon} ${core}. ${tail}`
          : `Good evening ${icon} ${core}. ${tail}`;
      if (!seen.has(line)) {
        seen.add(line);
        out.push(line);
      }
      if (out.length >= 365) return out;
    }
  }
  let pad = 0;
  while (out.length < 365) {
    const icon = ICONS[pad % ICONS.length];
    const extra =
      prefix === "morning"
        ? `Good morning ${icon} Field check: crops, inputs, and costs — keep FarmVault current today. Pass ${pad + 1}.`
        : `Good evening ${icon} Quick recap: harvest, expenses, and stock — log before lights out. Pass ${pad + 1}.`;
    if (!seen.has(extra)) {
      seen.add(extra);
      out.push(extra);
    }
    pad++;
  }
  return out;
}

export const MORNING_GENERAL_POOL: string[] = buildPool(MORNING_CORE, MORNING_TAIL, "morning");
export const EVENING_GENERAL_POOL: string[] = buildPool(EVENING_CORE, EVENING_TAIL, "evening");

// ---------------------------------------------------------------------------
// Inactivity companion nudge pools — tiered by days inactive.
// Tone: warm, welcoming, never guilt-tripping. The farmer should feel supported.
// ---------------------------------------------------------------------------

/** 2 days inactive — gentle, curious, low-pressure. */
export const INACTIVITY_2D_POOL: string[] = [
  "🌱 Your farm journey is still here — ready when you are.",
  "🚜 A quick check-in keeps your farm story moving forward.",
  "🌾 It's a great day to log something. FarmVault remembers everything.",
  "📊 Your records are safe and complete. Let's add to them together.",
  "🌱 Every entry you make builds a clearer picture of your season.",
  "🚜 Your workspace is ready and waiting — come see what's changed.",
  "🌾 Small updates today make next season much easier to plan.",
  "📦 Step back in whenever you're ready. Your farm is always here.",
  "🌱 Progress happens one record at a time. Start with one small update.",
  "🚜 Let's pick up where you left off — your farm data is all here.",
];

/** 5 days inactive — warmer, personally acknowledging, still calm. */
export const INACTIVITY_5D_POOL: string[] = [
  "🌾 A few days away is natural. Your farm story is waiting for its next chapter.",
  "🌱 Farming is hard work in and out of the app. Whenever you're ready, we're here.",
  "🚜 Your farm records are safe and untouched — ready to continue.",
  "📊 Every farmer has busier seasons. Come back to FarmVault when the moment is right.",
  "🌾 Your workspace is exactly as you left it. Step back in and keep growing.",
  "🌱 Even a five-minute update can capture a whole day's worth of progress.",
  "🚜 Your farm data tells your story. Let's keep writing it together.",
  "📦 It's been a few days — and we've been thinking about your farm. Come on back.",
  "🌾 The best time to update your records is now. The second best was yesterday.",
  "🌱 We kept everything safe for you. Your farm is ready when you are.",
];

/** 7 days inactive — heartfelt, caring, hopeful. Reminds without pressure. */
export const INACTIVITY_7D_POOL: string[] = [
  "🌾 A week away — and your farm records are still here, complete and safe.",
  "🌱 Whatever kept you busy, we hope things are going well. FarmVault is ready.",
  "🚜 Real farming happens in the field, not just the app. Come back when you can.",
  "📊 Your farm data is preserved and waiting. Let's continue your journey.",
  "🌾 Consistency creates stronger farms. One update today is a step forward.",
  "🌱 Your farm deserves consistent records — and so does your peace of mind.",
  "🚜 We haven't forgotten about you or your farm. Everything is safe and ready.",
  "📦 It's been a week — a gentle reminder that your farm story is still unfolding.",
  "🌾 No matter how long the pause, your farm journey doesn't have to start over.",
  "🌱 Your workspace is intact. Your data is safe. You can pick up right where you left off.",
];

/** 14 days inactive — deeply personal, hopeful, no judgment. */
export const INACTIVITY_14D_POOL: string[] = [
  "🌾 It's been a while, and we've been thinking about you. Your farm is still here.",
  "🌱 Two weeks away — your workspace is unchanged, your data is complete, and we're still here.",
  "🚜 No matter how long the break, FarmVault is ready to help you pick up where you left off.",
  "📊 Every farmer has seasons of rest. Whenever you're ready to track again, we're here.",
  "🌾 Your farm data is safe, your records are intact. Come back whenever the time is right.",
  "🌱 We don't measure worth by how often you log in. When you're ready, we're ready.",
  "🚜 Your farm journey is not behind — it's just paused. Let's continue it together.",
  "📦 Two weeks is a long time in farming. We kept everything exactly as you left it.",
  "🌾 Growth comes in seasons. We'll be here at the start of yours — whenever that is.",
  "🌱 FarmVault is your farming companion for the long haul. Take your time, then come back.",
];

export type InactivityTier = "2d" | "5d" | "7d" | "14d";

export function inactivityPoolForTier(tier: InactivityTier): string[] {
  switch (tier) {
    case "2d":  return INACTIVITY_2D_POOL;
    case "5d":  return INACTIVITY_5D_POOL;
    case "7d":  return INACTIVITY_7D_POOL;
    case "14d": return INACTIVITY_14D_POOL;
  }
}

export function inactivityTierFromDays(days: number): InactivityTier | null {
  if (days >= 14) return "14d";
  if (days >= 7)  return "7d";
  if (days >= 5)  return "5d";
  if (days >= 2)  return "2d";
  return null;
}

export function inactivityTierSubject(tier: InactivityTier, farmName: string): string {
  const name = farmName.trim() || "your farm";
  switch (tier) {
    case "2d":  return `${name} — a quick check-in from FarmVault`;
    case "5d":  return `Your farm journey is still here`;
    case "7d":  return `We've been thinking about ${name}`;
    case "14d": return `A message from your farming companion`;
  }
}

/** Message template buckets (structure requested for product/docs). */
export function getFarmerMessageTemplateJson(): {
  morning: {
    general: string[];
    inventory: string[];
    expenses: string[];
    harvest: string[];
    cropStage: string[];
  };
  evening: {
    general: string[];
    inventory: string[];
    expenses: string[];
    harvest: string[];
    summary: string[];
  };
} {
  return {
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
      expenses: [
        "Good morning 💰 Your weekly expenses are KES {{amount}}.",
      ],
      harvest: [
        "Good morning 🌽 Harvest season is active. Track your yields.",
      ],
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
      inventory: [
        "Good evening 📦 You used {{amount}} {{item}} today. Inventory updated.",
      ],
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
  };
}

export function pickRotatingLine(
  pool: string[],
  dayOfYear: number,
  lastLine: string | null,
): string {
  if (pool.length === 0) return "Good morning 🌱 Plan today’s farm work in FarmVault.";
  let idx = Math.abs(dayOfYear) % pool.length;
  let line = pool[idx] ?? pool[0];
  let guard = 0;
  while (line === lastLine && pool.length > 1 && guard < pool.length + 2) {
    idx = (idx + 1) % pool.length;
    line = pool[idx] ?? pool[0];
    guard++;
  }
  return line;
}
