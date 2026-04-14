import React from "react";
import { Phone, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAppAuthUrl } from "@/lib/urls/domains";

const PHONE_LINK = "tel:+254714748299";

export function PersistentCtaBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#D8B980]/35 bg-[#1f2c23] lg:hidden">
      <div className="container mx-auto px-4 py-3 flex items-center justify-center gap-2">
        <Button size="sm" asChild className="flex-1 rounded-md bg-[#D8B980] text-black hover:bg-[#c9aa74]">
          <a href={getAppAuthUrl("sign-up")}>
            Start free Trial <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </a>
        </Button>
        <Button size="sm" variant="outline" asChild className="flex-1 rounded-md border-zinc-200/40 bg-transparent text-zinc-100">
          <a href={PHONE_LINK}>
            <Phone className="mr-1 h-3.5 w-3.5" /> Call
          </a>
        </Button>
      </div>
    </div>
  );
}
