export interface LearnTopicData {
  slug: string;
  title: string;
  metaDescription: string;
  intro: string;
  sections: Array<{ title: string; paragraphs: string[] }>;
  solutionParagraphs: string[];
  /** Extra internal learn slugs to link at end */
  relatedSlugs?: string[];
}

export const LEARN_HUB_PATH = "/learn";
export const LEARN_MASTER_PATH = "/learn/farm-management";

export const LEARN_CORE_SLUGS = [
  "crop-management",
  "farm-worker-management",
  "harvest-tracking",
  "farm-expense-management",
  "farm-inventory-management",
  "multi-farm-management",
  "agriculture-analytics",
  "farm-record-keeping",
  "farm-planning",
  "irrigation-management",
] as const;

export const LEARN_CROP_SLUGS = [
  "maize-farming-management",
  "avocado-farming-management",
  "vegetable-farming-management",
  "poultry-farming-management",
  "dairy-farming-management",
  "greenhouse-farming-management",
] as const;

export const LEARN_HOWTO_SLUGS = [
  "how-to-track-farm-workers",
  "how-to-manage-farm-expenses",
  "how-to-track-harvest-yield",
  "how-to-manage-multiple-farms",
  "how-to-manage-crop-stages",
] as const;

export type LearnTopicSlug =
  | (typeof LEARN_CORE_SLUGS)[number]
  | (typeof LEARN_CROP_SLUGS)[number]
  | (typeof LEARN_HOWTO_SLUGS)[number];

const K =
  "In Kenya, rainfed and irrigated systems, small plots and commercial blocks often sit side by side—clear records help you survive price swings and weather shocks.";

const LEARN_BY_SLUG: Record<LearnTopicSlug, LearnTopicData> = {
  "crop-management": {
    slug: "crop-management",
    title: "Crop management for Kenyan farms",
    metaDescription:
      "Crop management in Kenya: stages, scouting, and records. How FarmVault supports planning, tracking, and reporting for African farms.",
    intro: `Crop management is the day-to-day discipline of matching varieties, planting windows, nutrition, protection, and labour to a realistic harvest plan. ${K}`,
    sections: [
      {
        title: "What crop management includes",
        paragraphs: [
          "Strong crop management covers land preparation, planting density, growth stages, pest and disease vigilance, and harvest readiness. Each decision should be traceable: which block, which variety, which cost centre.",
          "For export vegetables near Nairobi or Nakuru, buyers often expect spray windows, cold-chain timing, and grade-out rates to be explainable. For maize in transitional areas, the focus may be on input timing and moisture at harvest.",
        ],
      },
      {
        title: "Kenya context",
        paragraphs: [
          "Kenyan growers juggle erratic rainfall, input price volatility, and labour peaks during picking. Digital records reduce the risk of repeating costly mistakes next season.",
          "Linking field notes to expenses and harvest weight turns anecdotes into trends you can defend to a financier or cooperative manager.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault lets you structure production as projects with stages, attach operations, and keep harvest and cost data adjacent to the same crop record—so agronomy and finance stay aligned.",
      "Whether you farm tomatoes, French beans, or maize, you can standardise how the team logs activities and review performance from a phone or laptop.",
    ],
    relatedSlugs: ["farm-planning", "how-to-manage-crop-stages", "agriculture-analytics"],
  },
  "farm-worker-management": {
    slug: "farm-worker-management",
    title: "Farm worker management in Kenya",
    metaDescription:
      "Manage farm workers in Kenya: attendance, tasks, and fair payouts. FarmVault aligns labour records with harvest and operations.",
    intro: `Farm worker management is about clarity—who worked, on which block, producing what output. ${K}`,
    sections: [
      {
        title: "Why labour records matter",
        paragraphs: [
          "Disputes over piece rates, casual vs permanent roles, and NSSF-related documentation are common pain points. A simple, consistent log reduces friction and builds trust with your team.",
          "During peak harvest, chaos is expensive: duplicated picking, missed quality checks, or late transport all show up as shrinkage.",
        ],
      },
      {
        title: "Practices that work on Kenyan farms",
        paragraphs: [
          "Many successful farms combine team leaders, daily tallies, and visible targets (crates, kilograms, or rows). The method matters less than discipline and a single place to reconcile numbers.",
          "Mobile-friendly tools help supervisors update records at the field edge instead of retyping notebooks at night.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault supports structured employee profiles and workflows tied to harvest and operations so managers can connect people to outcomes.",
      "Use the platform to reduce duplicate data entry between the field notebook and the office spreadsheet.",
    ],
    relatedSlugs: ["how-to-track-farm-workers", "harvest-tracking", "farm-record-keeping"],
  },
  "harvest-tracking": {
    slug: "harvest-tracking",
    title: "Harvest tracking for growers",
    metaDescription:
      "Harvest tracking in Kenya: weights, grades, logistics. How FarmVault records collections and links them to sales and costs.",
    intro: `Harvest tracking closes the loop between field production and revenue. ${K}`,
    sections: [
      {
        title: "Core harvest metrics",
        paragraphs: [
          "At minimum, track date, quantity, quality or grade, picker or team attribution, and destination (packhouse, broker, direct sale).",
          "For perishable crops, time-of-day and temperature breaks often explain losses—note them even qualitatively at first.",
        ],
      },
      {
        title: "Kenyan supply chains",
        paragraphs: [
          "Many horticulture growers sell through brokers or aggregators; reconciling what left the farm versus what was paid requires trustworthy tallies.",
          "Smallholders may pool harvest through a cooperative—transparent records protect everyone.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault provides harvest and collection workflows that adapt to crop type, helping you see daily output and relate it to labour and inputs.",
      "When you can compare harvest to expenses, you get a clearer picture of margin per crop—not guesswork.",
    ],
    relatedSlugs: ["how-to-track-harvest-yield", "farm-worker-management", "agriculture-analytics"],
  },
  "farm-expense-management": {
    slug: "farm-expense-management",
    title: "Farm expense management",
    metaDescription:
      "Farm expense management in Kenya: categories, approvals, and true cost per crop. FarmVault tracks spending in KES against projects.",
    intro: `Expense management turns receipts into decisions. Without it, you cannot know true cost per kilogram or per bag. ${K}`,
    sections: [
      {
        title: "Categories that matter",
        paragraphs: [
          "Split costs across inputs, labour, machinery, services, finance charges, and overheads. Tag them to a project or block whenever possible.",
          "Kenyan farms often face cash timing issues—knowing burn rate per week prevents running out of money before harvest.",
        ],
      },
      {
        title: "From shoebox to system",
        paragraphs: [
          "Start with consistent categories even if amounts are approximate at first; refine as the team builds habit.",
          "Digital logs beat paper when M-Pesa and bank transfers need to be reconciled with field purchases.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault expense modules let you record spending in KES, associate it with crops or projects, and review summaries for management.",
      "Pair expenses with harvest records to see profitability trends season over season.",
    ],
    relatedSlugs: ["how-to-manage-farm-expenses", "farm-record-keeping", "agriculture-analytics"],
  },
  "farm-inventory-management": {
    slug: "farm-inventory-management",
    title: "Farm inventory management",
    metaDescription:
      "Farm inventory management: seeds, fertiliser, chemicals, fuel. FarmVault helps Kenyan farms track stock and reduce waste.",
    intro: `Inventory management prevents stock-outs during critical sprays and reduces theft and expiry losses. ${K}`,
    sections: [
      {
        title: "What to track",
        paragraphs: [
          "Track quantities on hand, lot or batch where relevant, storage location, and withdrawal per application or field operation.",
          "High-value chemicals and fertigation inputs deserve tighter controls than bulk dry fertiliser—adapt rigour to risk.",
        ],
      },
      {
        title: "Kenya-specific notes",
        paragraphs: [
          "Lead times for certain agrochemicals or specialised seed can be long; safety stock should reflect supplier reliability.",
          "Coastal humidity and upcountry cold nights both affect storage—your records should flag degraded stock when quality drops.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault inventory features support categories, suppliers, and usage tied to operations so you see what was applied where.",
      "Better stock visibility reduces emergency purchases at premium prices.",
    ],
    relatedSlugs: ["farm-expense-management", "irrigation-management", "crop-management"],
  },
  "multi-farm-management": {
    slug: "multi-farm-management",
    title: "Multi-farm management",
    metaDescription:
      "Manage multiple farms or blocks from one workspace. FarmVault for Kenyan agribusinesses and dispersed land holdings.",
    intro: `Multi-farm management is about governance: consistent reporting without losing local detail. ${K}`,
    sections: [
      {
        title: "When you need multi-site structure",
        paragraphs: [
          "If you operate several leases, an owned farm plus outgrowers, or distinct enterprises (dairy vs horticulture), you need roll-up dashboards and per-site profit and loss clarity.",
          "Delegation matters—site managers need autonomy while headquarters keeps standards.",
        ],
      },
      {
        title: "Africa-wide relevance",
        paragraphs: [
          "Regional growers often expand opportunistically; software should flex with new plots without forcing a rebuild of your chart of accounts.",
          "Consistent crop naming and units (kg, bags, crates) prevent apples-to-oranges comparisons.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault organises production into projects under a company so you can add farms or blocks as you grow.",
      "Leadership can review performance across sites while teams stay focused on their daily workflows.",
    ],
    relatedSlugs: ["how-to-manage-multiple-farms", "agriculture-analytics", "farm-planning"],
  },
  "agriculture-analytics": {
    slug: "agriculture-analytics",
    title: "Agriculture analytics on the farm",
    metaDescription:
      "Agriculture analytics: turn farm data into yield, cost, and margin insight. FarmVault reporting for Kenya.",
    intro: `Analytics is only as good as consistent capture in the field. ${K}`,
    sections: [
      {
        title: "Metrics worth watching",
        paragraphs: [
          "Cost per kg produced, labour hours per hectare, input cost as a percent of revenue, and grade-out or rejection rates are universal starters.",
          "Add water use per unit yield where irrigation is material to your cost structure.",
        ],
      },
      {
        title: "From spreadsheets to decisions",
        paragraphs: [
          "Many Kenyan farms already have data—it is fragmented. Centralising harvest, expenses, and inventory unlocks charts that managers actually use weekly.",
          "Seasonal comparison (this long rains vs last) is more actionable than single snapshots.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault reporting connects operations, harvest, and finance modules so summaries reflect real activity.",
      "Use analytics to prioritise capital—where a borehole, cold room, or variety change pays back fastest.",
    ],
    relatedSlugs: ["farm-record-keeping", "harvest-tracking", "farm-expense-management"],
  },
  "farm-record-keeping": {
    slug: "farm-record-keeping",
    title: "Farm record keeping",
    metaDescription:
      "Farm record keeping in Kenya: compliance, traceability, and learning. FarmVault as a digital farm register.",
    intro: `Records protect you in disputes, audits, and when you want credit. ${K}`,
    sections: [
      {
        title: "Minimum viable records",
        paragraphs: [
          "Keep planting and variety history, all input applications with dates, harvest outturn, sales, and labour payments.",
          "Photos and short notes capture issues that numbers alone miss—pest patches, hail, or irrigation failures.",
        ],
      },
      {
        title: "Why digitise now",
        paragraphs: [
          "Paper degrades and is hard to search; phones are everywhere even on remote shambas.",
          "Digital records make it easier to work with agronomists, insurers, and buyers who want evidence.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault gives a structured place for crop, financial, and operational history instead of scattered files.",
      "Export and reporting options support sharing summaries without exposing sensitive commercial detail unnecessarily.",
    ],
    relatedSlugs: ["farm-planning", "farm-expense-management", "how-to-manage-farm-expenses"],
  },
  "farm-planning": {
    slug: "farm-planning",
    title: "Farm planning",
    metaDescription:
      "Farm planning: seasons, budgets, and crop mix for Kenya. FarmVault links plans to execution and actuals.",
    intro: `Planning aligns land, water, labour, and capital to a calendar you can execute. ${K}`,
    sections: [
      {
        title: "Plan before you plant",
        paragraphs: [
          "Start with market and agronomic fit, then budget inputs and labour peaks, then stress-test cash flow week by week.",
          "Scenario planning—early rain vs late rain—reduces panic decisions.",
        ],
      },
      {
        title: "Kenyan seasonality",
        paragraphs: [
          "Long and short rains, plus irrigated pockets, create overlapping labour demand; planning shows conflicts early.",
          "County extension and neighbour benchmarks help sanity-check yield assumptions.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault connects projects and budgets so planned versus actual becomes visible during the season.",
      "Adjust plans when reality diverges—drought, price spikes, or pest pressure—using live records.",
    ],
    relatedSlugs: ["crop-management", "farm-expense-management", "multi-farm-management"],
  },
  "irrigation-management": {
    slug: "irrigation-management",
    title: "Irrigation management",
    metaDescription:
      "Irrigation management in Kenya: scheduling, costs, and records. FarmVault helps log water-related operations and spend.",
    intro: `Irrigation turns yield stability into a finance problem—pumps, power, and maintenance add up fast. ${K}`,
    sections: [
      {
        title: "Operational focus",
        paragraphs: [
          "Track pump hours, energy source costs, maintenance events, and application timing by block.",
          "Align irrigation with growth stage—vegetative vs fruit-fill needs different strategies.",
        ],
      },
      {
        title: "Water risk in Kenya",
        paragraphs: [
          "Basin closures, groundwater licensing, and electricity reliability vary by county; records support compliance conversations.",
          "Efficiency upgrades (drip vs flood) should be justified with yield and labour data.",
        ],
      },
    ],
    solutionParagraphs: [
      "Log irrigation-related activities and costs in FarmVault alongside crop projects to see water spend per output unit.",
      "Pair with analytics to decide when infrastructure investment is justified.",
    ],
    relatedSlugs: ["farm-expense-management", "agriculture-analytics", "crop-management"],
  },
  "maize-farming-management": {
    slug: "maize-farming-management",
    title: "Maize farming management in Kenya",
    metaDescription:
      "Maize farming management: agronomy, costs, and harvest records. FarmVault for Kenyan maize growers.",
    intro: `Maize remains central to food security and farm income across Kenya; margin is won on yield, moisture, and input discipline. ${K}`,
    sections: [
      {
        title: "Key management levers",
        paragraphs: [
          "Variety choice, planting date, plant population, weed control, stalk borer management, and harvest moisture drive outcomes.",
          "Post-harvest losses from poor drying and storage erase field gains—record storage outcomes too.",
        ],
      },
      {
        title: "Economics",
        paragraphs: [
          "Track fertiliser and seed cost per acre against realised bags per acre; regional averages from neighbours are a starting point, not your truth.",
          "Forward selling and NCPB dynamics affect timing—keep sales records aligned with harvest batches.",
        ],
      },
    ],
    solutionParagraphs: [
      "Use FarmVault to budget maize blocks, log expenses, and record harvest weights or bag counts for true per-acre performance.",
      "Compare seasons to see whether agronomic changes paid off.",
    ],
    relatedSlugs: ["crop-management", "farm-expense-management", "harvest-tracking"],
  },
  "avocado-farming-management": {
    slug: "avocado-farming-management",
    title: "Avocado farming management",
    metaDescription:
      "Avocado farm management in Kenya: orchard records, costs, and traceability. FarmVault for export-oriented growers.",
    intro: `Kenya's avocado sector rewards traceability, grade, and consistent supply. ${K}`,
    sections: [
      {
        title: "Orchard operations",
        paragraphs: [
          "Track tree age blocks, irrigation, nutrition programmes, and phytosanitary applications with dates and rates.",
          "Export markets demand defensible spray and harvest histories.",
        ],
      },
      {
        title: "Harvest and pack-out",
        paragraphs: [
          "Grade-out percentages and reject reasons should be logged to improve agronomy and picking training.",
          "Labour for picking and hauling is a major cost—tie it to kilograms harvested.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault helps maintain structured records per orchard block with expenses and activities aligned to harvest batches.",
      "Stronger records support premium market access and faster responses to buyer audits.",
    ],
    relatedSlugs: ["harvest-tracking", "farm-worker-management", "farm-record-keeping"],
  },
  "vegetable-farming-management": {
    slug: "vegetable-farming-management",
    title: "Vegetable farming management",
    metaDescription:
      "Vegetable farm management in Kenya: French beans, cabbages, and more. FarmVault for intensive horticulture.",
    intro: `Vegetable farming in Kenya is high-turnover and high-risk—speed and accuracy matter. ${K}`,
    sections: [
      {
        title: "Operational rhythm",
        paragraphs: [
          "Succession planting, daily harvest, and strict spray intervals create heavy coordination load.",
          "Quality and food safety expectations from export and premium local buyers require traceability.",
        ],
      },
      {
        title: "Cost control",
        paragraphs: [
          "Labour and logistics often dominate; track cost per crate or per kilogram, not only per acre.",
          "Cold chain and reject rates belong in your performance picture.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault supports crop projects, harvest logging, and expenses suited to fast-moving vegetable operations.",
      "Managers can see daily output versus cost drivers during the season—not only after closure.",
    ],
    relatedSlugs: ["harvest-tracking", "crop-management", "greenhouse-farming-management"],
  },
  "poultry-farming-management": {
    slug: "poultry-farming-management",
    title: "Poultry farming management",
    metaDescription:
      "Poultry farm management: flocks, feed, mortality, and costs. FarmVault for structured Kenyan poultry records.",
    intro: `Poultry rewards tight batch economics—small errors in mortality or feed conversion erase margin. ${K}`,
    sections: [
      {
        title: "What to log",
        paragraphs: [
          "Batch start dates, bird numbers, daily mortality, feed consumption, and vaccinations or treatments.",
          "Weigh samples where possible to track growth curves against breed standards.",
        ],
      },
      {
        title: "Kenya market context",
        paragraphs: [
          "Feed price volatility and day-old chick availability drive planning; keep supplier and price history.",
          "Regulatory and biosecurity expectations are rising for commercial units.",
        ],
      },
    ],
    solutionParagraphs: [
      "Use FarmVault projects to represent batches, with expenses for feed, chicks, and labour and notes for health events.",
      "Analytics over batches reveal whether operational changes improved margin.",
    ],
    relatedSlugs: ["farm-expense-management", "farm-record-keeping", "agriculture-analytics"],
  },
  "dairy-farming-management": {
    slug: "dairy-farming-management",
    title: "Dairy farming management",
    metaDescription:
      "Dairy farm management in Kenya: milk production, feed, and costs. FarmVault for enterprise-style records.",
    intro: `Dairy is a cashflow business—daily milk sales hide creeping feed and health costs. ${K}`,
    sections: [
      {
        title: "Daily discipline",
        paragraphs: [
          "Milk volumes, quality penalties, concentrate use, forage costs, and vet events should flow into one financial picture.",
          "Breeding and calving intervals drive long-term yield—track them alongside lactation curves.",
        ],
      },
      {
        title: "Kenyan processors",
        paragraphs: [
          "Processor pricing and deductions vary; reconcile deliveries to statements.",
          "Seasonal forage gaps push farms toward silage and concentrates—cost those shifts explicitly.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault can structure dairy as ongoing operations with expense and activity logging, supporting management review in KES.",
      "Combine operational notes with financial tags for clearer cost per litre trends.",
    ],
    relatedSlugs: ["farm-expense-management", "farm-record-keeping", "multi-farm-management"],
  },
  "greenhouse-farming-management": {
    slug: "greenhouse-farming-management",
    title: "Greenhouse farming management",
    metaDescription:
      "Greenhouse farm management in Kenya: climate control, inputs, and labour intensity. FarmVault records.",
    intro: `Greenhouses amplify both yield potential and capital-at-risk. ${K}`,
    sections: [
      {
        title: "Intensity factors",
        paragraphs: [
          "Higher planting density and year-round production increase labour, IPM, and energy or irrigation monitoring needs.",
          "Structure maintenance (polythene, nets, gutters) is a real cost line—don’t bury it in “misc.”",
        ],
      },
      {
        title: "Kenya adoption",
        paragraphs: [
          "Flower and vegetable growers near urban markets use tunnels and greenhouses to capture premium prices.",
          "Record climate incidents and production drops to justify infrastructure upgrades.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault helps track dense production cycles with crop stages, expenses, and harvest suitable for greenhouse turnover.",
      "Compare greenhouse blocks to open-field projects where you run both.",
    ],
    relatedSlugs: ["vegetable-farming-management", "irrigation-management", "agriculture-analytics"],
  },
  "how-to-track-farm-workers": {
    slug: "how-to-track-farm-workers",
    title: "How to track farm workers",
    metaDescription:
      "How to track farm workers in Kenya: step-by-step practices and software. FarmVault for labour and harvest attribution.",
    intro: `Reliable worker tracking blends culture and system: people need to see fairness. ${K}`,
    sections: [
      {
        title: "Steps that scale",
        paragraphs: [
          "1) Define roles and supervisors. 2) Choose units—hours, rows, crates, or kilograms. 3) Log daily with team leads. 4) Reconcile before pay day. 5) Review exceptions (zero output days, absences).",
          "Start simple; add detail once the team trusts the process.",
        ],
      },
      {
        title: "Kenya tips",
        paragraphs: [
          "Blend M-Pesa payment references with farm tallies to reduce “we paid but didn’t produce” gaps.",
          "Train pickers on why records matter—quality and fairness improve together.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault aligns worker-related workflows with operational and harvest data so you reconcile faster.",
      "Digital history reduces reliance on disputed notebook pages.",
    ],
    relatedSlugs: ["farm-worker-management", "harvest-tracking"],
  },
  "how-to-manage-farm-expenses": {
    slug: "how-to-manage-farm-expenses",
    title: "How to manage farm expenses",
    metaDescription:
      "How to manage farm expenses in Kenya: categories, routines, and tools. FarmVault expense tracking in KES.",
    intro: `Expense management is habit plus visibility. ${K}`,
    sections: [
      {
        title: "A practical workflow",
        paragraphs: [
          "Set categories, assign owners (who can spend), capture receipts or M-Pesa messages same-day, and review weekly with the farm manager.",
          "Tag every significant cost to a crop or project—even rough allocation beats none.",
        ],
      },
      {
        title: "Kenya cash realities",
        paragraphs: [
          "Many purchases are cash or mobile money; photograph receipts and note vendor—audits start messy otherwise.",
          "Watch FX if you import inputs; record landed cost, not invoice price only.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault centralises expenses in KES with project linkage and summaries management can trust.",
      "Pair with harvest to answer whether spend actually bought yield.",
    ],
    relatedSlugs: ["farm-expense-management", "farm-record-keeping"],
  },
  "how-to-track-harvest-yield": {
    slug: "how-to-track-harvest-yield",
    title: "How to track harvest yield",
    metaDescription:
      "How to track harvest yield on Kenyan farms: weights, grades, and reconciliation. FarmVault harvest tools.",
    intro: `Yield tracking is the scoreboard for agronomy and labour. ${K}`,
    sections: [
      {
        title: "Build the habit",
        paragraphs: [
          "Use consistent scales, zero before weighing, and photograph dubious readings. Log gross and net if you deduct crates or soil.",
          "For graded produce, track class A/B/reject separately—your revenue model depends on it.",
        ],
      },
      {
        title: "Reconcile sales",
        paragraphs: [
          "Compare farm exit weights to buyer receipts within 24–48 hours while memories are fresh.",
          "Investigate shrink patterns—field, transport, or packhouse.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault harvest features help you capture daily collections and relate them to crops and workers.",
      "Trend lines emerge automatically when data is consistent.",
    ],
    relatedSlugs: ["harvest-tracking", "agriculture-analytics"],
  },
  "how-to-manage-multiple-farms": {
    slug: "how-to-manage-multiple-farms",
    title: "How to manage multiple farms",
    metaDescription:
      "How to manage multiple farms or blocks: governance, standards, and software. FarmVault multi-site workspace.",
    intro: `Multi-farm success is standards plus local ownership. ${K}`,
    sections: [
      {
        title: "Playbook approach",
        paragraphs: [
          "Publish minimum record standards (what must be logged daily), chart of accounts for expenses, and naming conventions for projects.",
          "Review weekly dashboards; intervene on outliers, not every small variance.",
        ],
      },
      {
        title: "East Africa context",
        paragraphs: [
          "Road networks and phone coverage vary; choose tools that work offline-tolerant browsers where possible.",
          "Local managers need authority to buy inputs within limits—document thresholds.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault’s company and project model scales as you add land or enterprises without losing history.",
      "Leadership sees consolidated performance; sites keep operational detail.",
    ],
    relatedSlugs: ["multi-farm-management", "farm-planning"],
  },
  "how-to-manage-crop-stages": {
    slug: "how-to-manage-crop-stages",
    title: "How to manage crop stages",
    metaDescription:
      "How to manage crop stages from planting to harvest in Kenya. FarmVault crop projects and stage tracking.",
    intro: `Crop stages translate agronomy into a timeline the whole team can follow. ${K}`,
    sections: [
      {
        title: "Define stages clearly",
        paragraphs: [
          "Use agronomically meaningful names (establishment, vegetative, flowering, fruit-fill, maturity) and tie each to scouting tasks and input windows.",
          "Avoid jargon only the agronomist understands—field teams execute what they understand.",
        ],
      },
      {
        title: "Measure progress",
        paragraphs: [
          "Dates matter: emergence, first flower, 50% flowering, and expected harvest help you compare varieties and blocks.",
          "Photograph pest or disease stages for advisors who cannot visit daily.",
        ],
      },
    ],
    solutionParagraphs: [
      "FarmVault supports crop projects with stage-oriented planning so operations align with plant development.",
      "Historical stage timelines improve next season’s calendar planning.",
    ],
    relatedSlugs: ["crop-management", "farm-planning"],
  },
};

export function getLearnTopic(slug: string): LearnTopicData | null {
  return LEARN_BY_SLUG[slug as LearnTopicSlug] ?? null;
}

export function getAllLearnTopicSlugs(): LearnTopicSlug[] {
  return [
    ...LEARN_CORE_SLUGS,
    ...LEARN_CROP_SLUGS,
    ...LEARN_HOWTO_SLUGS,
  ];
}
