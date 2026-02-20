import { Link } from "react-router-dom";
import { ClipboardList, BarChart3, CreditCard, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const steps = [
  { icon: ClipboardList, title: "Sign up and set up your farm", description: "Create your account, add your company, and define your first project by crop and season." },
  { icon: BarChart3, title: "Track operations daily", description: "Log work, labour, expenses, and inventory. Monitor crop stages and harvests in one dashboard." },
  { icon: CreditCard, title: "Get insights and grow", description: "Use reports and analytics to make better decisions and scale your farm profitably." },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 lg:py-32 bg-background relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-gold/5 rounded-full blur-[80px]" />
      <div className="container mx-auto px-4 lg:px-8 relative">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-20">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-4">Simple process</span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-5 tracking-tight">How It <span className="text-gradient-gold">Works</span></h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-base font-light leading-relaxed">Get from sign-up to full farm visibility in three straightforward steps.</p>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
          {steps.map((step, i) => (
            <motion.div key={step.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15, duration: 0.5 }} className="relative text-center">
              <div className="gradient-primary w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-glow-green">
                <step.icon className="h-8 w-8 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3 tracking-tight">{step.title}</h3>
              <p className="text-muted-foreground text-sm font-light leading-relaxed max-w-xs mx-auto">{step.description}</p>
            </motion.div>
          ))}
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mt-14">
          <Button size="lg" asChild className="gradient-primary text-primary-foreground btn-luxury rounded-2xl px-8 h-12">
            <Link to="/choose-plan" className="inline-flex items-center">Get Started <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
