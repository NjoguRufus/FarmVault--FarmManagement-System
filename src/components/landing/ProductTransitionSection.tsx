import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAppAuthUrl } from "@/lib/urls/domains";

export function ProductTransitionSection() {
  return (
    <section className="bg-white py-14">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mt-4 text-center">
          <p className="text-sm leading-[1.4] tracking-[0.2px] text-gray-500">
            Expenses <span className="px-1.5">•</span> Harvest <span className="px-1.5">•</span> Workers{" "}
            <span className="px-1.5">•</span> Inventory <span className="px-1.5">•</span> Reports
          </p>

          <p className="mt-4 text-lg font-medium text-[#1f3a2d]">
            All your farm operations, in one system
          </p>

          <div className="mt-5">
            <Button
              asChild
              className="h-11 rounded-md bg-[#D8B980] px-6 font-medium text-black hover:bg-[#c9aa74]"
            >
              <a href={getAppAuthUrl("sign-up")} className="inline-flex items-center">
                Start free trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
