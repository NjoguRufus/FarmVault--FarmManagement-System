import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAppAuthUrl } from "@/lib/urls/domains";

export function CtaSection() {
  return (
    <section id="cta" className="bg-white py-16 md:py-24">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="rounded-xl border border-[#d8b980]/45 bg-white p-8 text-center md:p-12">
          <h2 className="text-3xl font-bold leading-tight text-[#1f3a2d] md:text-4xl">
            Start With This <span className="text-[#D8B980]">Season</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#5f6f63]">
            Add your projects, log expenses in KES, record harvest, and track worker activity. FarmVault will show your season performance and profit clearly.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild className="h-12 rounded-md bg-[#D8B980] px-6 text-black hover:bg-[#c9aa74]">
              <a href={getAppAuthUrl("sign-up")} className="inline-flex items-center">
                Create account
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-12 rounded-md border-[#1f3a2d]/30 bg-transparent px-6 text-[#1f3a2d] hover:bg-[#f7f8f6]"
            >
              <a href={getAppAuthUrl("sign-in")}>Sign in</a>
            </Button>
          </div>
        </div>
      </div>
    </section>

  );
}
