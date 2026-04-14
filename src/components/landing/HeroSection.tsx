import { ArrowRight, LayoutDashboard, MoveDown, MoveRight, NotebookText, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { getAppAuthUrl } from "@/lib/urls/domains";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[#1b261f] pt-28 pb-16 md:pt-32 md:pb-24">
      <div className="absolute inset-0">
        <OptimizedImage
          src="/landing/hero-bg.jpg"
          webpSrc="/landing/hero-bg.webp"
          priority
          alt="Farm background"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-black/30" />
      </div>

      <div className="container relative z-10 mx-auto px-4 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div>
            <h1
              className="max-w-xl text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl"
              style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
            >
              <span className="text-[#D4A937]">Farm Management</span>
              <br className="hidden sm:block" />
              <span> System in Africa</span>
            </h1>
            <p
              className="mt-4 max-w-xl text-base leading-relaxed text-gray-200 md:text-lg"
              style={{ textShadow: "0 2px 10px rgba(0,0,0,0.45)" }}
            >
              Track your farm operations clearly.
              <br />
              Record expenses, harvests, workers, inventory and anything You need to monitor on your farm
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" asChild className="h-12 rounded-md bg-[#D8B980] px-6 text-black hover:bg-[#c9aa74]">
                <a href={getAppAuthUrl("sign-up")} className="inline-flex items-center">
                  Start free trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="h-12 rounded-md border-[#86a883]/50 bg-[#2f4f39]/45 px-6 text-[#e8f3e8] hover:bg-[#2f4f39]/65"
              >
                <a href="/#product-proof" className="inline-flex items-center">
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  View demo
                </a>
              </Button>
            </div>
            <ul className="mt-8 space-y-2 text-sm leading-6 text-zinc-300/70">
              <li>Used by farmers and agribusiness teams in Kenya and across Africa</li>
            </ul>
            <div className="mt-4 hidden h-px w-40 bg-white/25 md:block" aria-hidden="true" />
          </div>

          <div className="relative mt-8">
            <OptimizedImage
              src="/landing/landing%20page%20mock.png"
              alt="FarmVault dashboard showing farm operations and finances"
              className="h-auto w-full drop-shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
            />
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-[900px]">
          <div className="mx-auto mb-10 max-w-3xl text-center">
            <h2 className="text-3xl font-bold leading-tight text-white md:text-4xl">
              From{" "}
              <span className="relative inline-block">
                notebooks
                <span
                  aria-hidden="true"
                  className="absolute -left-1 -right-1 -bottom-1 h-[2px] bg-[#D8B980] md:-bottom-1.5"
                  style={{ transform: "rotate(-1.6deg)" }}
                />
                <span
                  aria-hidden="true"
                  className="absolute -left-0.5 -right-0.5 bottom-0 h-[1px] bg-[#D8B980]/75 md:-bottom-0.5"
                  style={{ transform: "rotate(0.6deg)" }}
                />
              </span>{" "}
              to your <span className="text-[#D8B980]">Phone</span>
            </h2>
            <p className="mt-4 text-sm leading-7 text-gray-300 md:text-base">
              Do what you already do - just with less writing and clearer records.
            </p>
          </div>

          <div className="grid items-center gap-8 md:grid-cols-[1fr_auto_1fr] md:gap-10">
            <div className="mx-auto w-full max-w-sm rounded-xl border border-white/10 bg-black/35 p-5 text-left backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <NotebookText className="mt-0.5 h-7 w-7 shrink-0 text-gray-400" />
                <div>
                  <h3 className="text-lg font-medium text-zinc-100">Notebooks</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-300 md:text-base md:leading-7">
                    Writing everything in books
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300 md:text-base md:leading-7">
                    Hard to track and easy to lose records
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center text-[#D4A937]">
              <MoveRight className="hidden h-10 w-10 md:block" />
              <MoveDown className="h-10 w-10 md:hidden" />
            </div>

            <div className="mx-auto w-full max-w-sm rounded-xl border border-[#D4A937]/35 bg-black/35 p-5 text-left backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <Smartphone className="mt-0.5 h-7 w-7 shrink-0 text-[#D4A937]" />
                <div>
                  <h3 className="text-lg font-medium text-white">Farm<span className="text-[#D8B980]">Vault</span> on phone</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-200 md:text-base md:leading-7">
                    All records on your phone
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-200 md:text-base md:leading-7">
                    See everything clearly anytime
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-6 max-w-4xl text-center">
            <p className="text-xs leading-6 tracking-wide text-zinc-300/70 md:text-sm">
              Less writing <span className="px-2">•</span> See everything on your farm
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
