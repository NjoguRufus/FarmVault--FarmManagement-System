import { Link } from "react-router-dom";
import { Check, ArrowRight, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SUBSCRIPTION_PLANS } from "@/config/plans";

export function PricingSection() {
  return (
    <section id="pricing" className="py-24 lg:py-32 bg-secondary/50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(145_63%_22%_/_0.03),_transparent_70%)]" />
      <div className="container mx-auto px-4 lg:px-8 relative">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }} className="text-center mb-20">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-4">Pricing</span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-5 tracking-tight">Simple, <span className="text-gradient-gold">Transparent</span> Pricing</h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-base font-light leading-relaxed">Same plans as in the app. Choose one to get started.</p>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {SUBSCRIPTION_PLANS.map((plan, i) => (
            <motion.div key={plan.value} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay: i * 0.1, duration: 0.5 }} className={"rounded-3xl p-8 transition-all duration-500 relative " + (plan.popular ? "bg-card shadow-luxury-hover border-2 border-primary/20" : "bg-card shadow-luxury border border-border")}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-semibold">
                    <Zap className="h-3 w-3" /> Most Popular
                  </span>
                </div>
              )}
              <h3 className="text-xl font-bold text-foreground mb-1 tracking-tight">{plan.name}</h3>
              <p className="text-sm text-muted-foreground mb-6 font-light">{plan.description}</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                <span className="text-sm text-muted-foreground font-light">{plan.period}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="gradient-primary rounded-full p-0.5 shrink-0"><Check className="h-3.5 w-3.5 text-primary-foreground" /></div>
                    {f}
                  </li>
                ))}
              </ul>
              <Button size="lg" asChild className={plan.popular ? "gradient-primary text-primary-foreground btn-luxury rounded-2xl w-full h-12" : "rounded-2xl w-full h-12 border-2 border-primary text-primary hover:bg-primary/5"}>
                <Link to="/choose-plan" state={{ plan: plan.value }} className="inline-flex items-center justify-center">Get Started <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
