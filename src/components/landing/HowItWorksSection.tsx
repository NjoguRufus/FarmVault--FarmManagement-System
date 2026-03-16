import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Sprout,
  Wallet,
  ClipboardList,
  Package2,
  BarChart3,
  ArrowRight,
} from "lucide-react";

const stepItems = [
  {
    id: 1,
    title: "1. See Your Crop Progress Clearly",
    text: "Add your crop and planting date. FarmVault shows you the current stage and what comes next.",
    value: "You always know what should be happening on your farm today.",
    icon: Sprout,
    image: "/landing/how-it-works-crop.png",
  },
  {
    id: 2,
    title: "2. Track Your Season Budget",
    text: "Record your expenses as they happen. Watch your remaining balance update automatically.",
    value: "No more wondering where the money went.",
    icon: Wallet,
    image: "/landing/how-it-works-budget.png",
  },
  {
    id: 3,
    title: "3. Manage Your Team & Daily Work",
    text: "Record activities, approvals, and payments in one place.",
    value: "Even when you're not on the farm, you stay in control.",
    icon: ClipboardList,
    image: "/landing/how-it-works-operations.png",
  },
  {
    id: 4,
    title: "4. Monitor Stock & Farm Inputs",
    text: "See what you bought, what was used, and what is remaining.",
    value: "Avoid shortages and avoid wasting money.",
    icon: Package2,
    image: "/landing/how-it-works-stock.png",
  },
  {
    id: 5,
    title: "5. Record Harvest in Any Unit",
    text: "Track harvest in kg, crates, bags, pieces, tonnes, or any unit you use.",
    value: "See your total output, sales, and real profit clearly.",
    icon: BarChart3,
    image: "/landing/how-it-works-harvest.png",
  },
];

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="py-24 lg:py-32 bg-background relative overflow-hidden"
    >
      <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-gold/5 rounded-full blur-[80px]" />
      <div className="container mx-auto px-4 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14 md:mb-20"
        >
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-3">
            Simple, calm control
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 tracking-tight">
            From Planting to Profit{" "}
            <span className="text-gradient-gold">— In 5 Clear Steps</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base md:text-lg leading-relaxed">
            FarmVault helps you plan, run, and track your farm without confusion.
          </p>
        </motion.div>

        <div className="space-y-12 md:space-y-16">
          {stepItems.map((step, index) => {
            const isEven = index % 2 === 1;
            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className={`grid items-center gap-8 lg:gap-12 ${
                  isEven ? "md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)]" : "md:grid-cols-2"
                }`}
              >
                <div
                  className={`space-y-4 md:space-y-5 ${
                    isEven ? "md:order-2" : "md:order-1"
                  }`}
                >
                  <div className="inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary uppercase tracking-wide">
                    <step.icon className="h-4 w-4" />
                    Step {step.id}
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-sm md:text-base text-muted-foreground">
                    {step.text}
                  </p>
                  <div className="inline-flex items-center rounded-xl border border-fv-gold/40 bg-fv-gold-soft/20 px-4 py-2 text-xs md:text-sm text-foreground max-w-md">
                    <span className="font-semibold mr-2 text-fv-olive">
                      Value:
                    </span>
                    <span>{step.value}</span>
                  </div>
                </div>

                <div
                  className={`relative md:order-2 ${
                    isEven ? "md:order-1" : "md:order-2"
                  }`}
                >
                  <div className="relative rounded-2xl border border-border/70 bg-muted/40 overflow-hidden shadow-[0_18px_40px_rgba(9,35,24,0.28)]">
                    <div className="absolute inset-0 bg-gradient-to-tr from-fv-gold-soft/20 via-transparent to-primary/10 pointer-events-none" />
                    <img
                      src={step.image}
                      alt={step.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-16 md:mt-20 text-center space-y-4"
        >
          <p className="text-lg md:text-xl font-semibold text-foreground">
            Farming is hard work. Managing it should not be.
          </p>
          <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
            Start your 7-day free trial and see your farm inside FarmVault.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
            <Button
              size="lg"
              asChild
              className="gradient-primary text-primary-foreground btn-luxury rounded-2xl px-8 h-12 shadow-[0_18px_40px_rgba(9,35,24,0.35)]"
            >
              <a href="https://app.farmvault.africa/signup" className="inline-flex items-center">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <a
              href="https://app.farmvault.africa"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Open Dashboard
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
