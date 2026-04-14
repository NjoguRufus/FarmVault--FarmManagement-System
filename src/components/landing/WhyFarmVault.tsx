export function WhyFarmVault() {
  return (
    <section id="trust" className="bg-[#fafaf7] py-16 md:py-24">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <h2 className="text-3xl font-bold leading-tight text-[#1f3a2d] md:text-4xl">
            Built for how farms actually run in Africa
          </h2>
          <p className="mt-4 text-base leading-7 text-[#5f6f63]">
            FarmVault is used on real farms where records affect cash flow, worker payments, and harvest planning.
          </p>
        </div>

        <div className="max-w-3xl space-y-10 md:space-y-12">
          {[
            {
              title: "Money moves every day",
              description:
                "From seed and fertilizer to transport and labor, expenses happen daily - not at the end of the month.",
            },
            {
              title: "Workers need tracking",
              description:
                "Attendance, tasks, and payments must be recorded clearly to avoid confusion and loss.",
            },
            {
              title: "Harvest determines everything",
              description:
                "What you harvest - and how much - affects your entire season’s outcome.",
            },
            {
              title: "Profit is not always obvious",
              description:
                "Without proper records, it’s hard to know what your farm is actually making.",
            },
          ].map((item) => (
            <article key={item.title} className="pl-4">
              <div className="mb-3 h-0.5 w-10 bg-[#D4A937]" />
              <h3 className="text-xl font-semibold leading-7 text-[#1f2937]">{item.title}</h3>
              <p className="mt-2 text-base leading-7 text-[#4b5563]">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
