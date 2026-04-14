import { BarChart3, ClipboardList, Coins, Leaf, Sprout, Users } from "lucide-react";

const farmFlowSteps = [
  {
    icon: Sprout,
    title: "Start a farm project",
    description: "Set up your farm, crops, and season before operations begin.",
  },
  {
    icon: ClipboardList,
    title: "Track daily operations",
    description: "Log activities happening on the farm each day.",
  },
  {
    icon: Coins,
    title: "Record expenses",
    description: "Capture spending on seed, fertilizer, labor, fuel, and transport.",
  },
  {
    icon: Users,
    title: "Manage workers",
    description: "Track attendance, assign tasks, and manage payments.",
  },
  {
    icon: Leaf,
    title: "Record harvest",
    description: "Log output by crop and unit as harvesting happens.",
  },
  {
    icon: BarChart3,
    title: "Monitor profit",
    description: "See total costs, sales, and profit clearly.",
  },
];

export function SolutionSection() {
  return (
    <section id="practical-features" className="bg-[#fafaf7] py-16 md:py-24">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <h2 className="text-3xl font-bold leading-tight text-[#1f3a2d] md:text-4xl">
            How Your Farm Runs with <span className="text-[#D8B980]">FarmVault</span>
          </h2>
          <p className="mt-4 text-base leading-7 text-[#6B7280]">
            From setting up a project to tracking profit, FarmVault follows every step of your farm operations.
          </p>
        </div>

        <div className="relative">
          <div className="absolute bottom-3 left-5 top-3 w-px bg-[rgba(47,111,78,0.3)] md:left-[22px]" aria-hidden="true" />

          <div className="space-y-12 md:space-y-14">
            {farmFlowSteps.map((step) => (
              <article key={step.title} className="flex items-start gap-3">
                <div className="relative z-10 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(47,111,78,0.2)] bg-[rgba(47,111,78,0.1)] text-[#2F6F4E] transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:bg-[rgba(47,111,78,0.15)] md:h-11 md:w-11">
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="pt-0.5">
                  <h3 className="text-xl font-semibold leading-7 text-[#1F2937]">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-2xl text-base leading-7 text-[#6B7280]">
                    {step.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
