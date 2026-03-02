import React from "react";
import { Link } from "react-router-dom";
import { Phone, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const PHONE = "0714 748299";
const PHONE_LINK = "tel:+254714748299";

export function PersistentCtaBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-lg lg:hidden">
      <div className="container mx-auto px-4 py-3 flex items-center justify-center gap-2">
        <Button size="sm" asChild className="rounded-xl flex-1">
          <Link to="/setup-company">
            Start Free Trial <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild className="rounded-xl flex-1">
          <a href={PHONE_LINK}>
            <Phone className="mr-1 h-3.5 w-3.5" /> Call
          </a>
        </Button>
      </div>
    </div>
  );
}
