import React from "react";
import { Link } from "react-router-dom";
import { Quote } from "lucide-react";
import { Button } from "@/components/ui/button";

const TESTIMONIALS = [
  {
    quote: "FarmVault helped us see exactly where our money goes. We now know our cost per acre for tomatoes and can plan the next season properly.",
    name: "James K.",
    role: "Tomato farmer, Kiambu",
  },
  {
    quote: "Recording harvests and sales in one place has made it easier to work with our buyer. We have the records they need.",
    name: "Mary W.",
    role: "French beans grower",
  },
  {
    quote: "We use FarmVault for crop monitoring and expense tracking. It works on our phones in the field, which is what we needed.",
    name: "Peter M.",
    role: "Mixed farm, Rift Valley",
  },
];

export function HomeTestimonialsSection() {
  return (
    <section className="py-24 lg:py-32 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            What Farmers Say About FarmVault
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Kenyan farmers use FarmVault to plan crops, track costs and manage harvests. Here’s what they say.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="rounded-2xl border bg-card p-6 shadow-sm"
            >
              <Quote className="h-8 w-8 text-primary/50 mb-4" />
              <p className="text-muted-foreground italic mb-4">"{t.quote}"</p>
              <p className="font-medium text-foreground">{t.name}</p>
              <p className="text-sm text-muted-foreground">{t.role}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <p className="text-sm text-muted-foreground mb-4">
            Case studies and detailed success stories coming soon.
          </p>
          <Button asChild size="lg" className="rounded-xl">
            <Link to="/setup-company">Start Free Trial</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
