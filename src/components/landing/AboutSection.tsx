import { Link } from "react-router-dom";
import { Target, Heart, Globe, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const values = [
  { icon: Target, title: "Mission", text: "To empower African farmers with simple, powerful tools for planning, operations, and growth." },
  { icon: Heart, title: "Passion", text: "We believe agriculture is the backbone of economies. We build technology that puts farmers first." },
  { icon: Globe, title: "Impact", text: "From smallholder farms to cooperatives, FarmVault helps digitize and scale operations sustainably." },
];

export function AboutSection() {
  return (
    <section id="about" className="py-24 lg:py-32 bg-background relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
      <div className="container mx-auto px-4 lg:px-8 relative">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }} className="text-center mb-20">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-4">About us</span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-5 tracking-tight">Built for <span className="text-gradient-gold">Farmers</span>, by People Who Care</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base font-light leading-relaxed">FarmVault is the all-in-one farm management system designed for African agriculture. We combine crop planning, operations, inventory, expenses, and harvest sales in one place so you can focus on growing.</p>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {values.map((val, i) => (
            <motion.div key={val.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay: i * 0.1, duration: 0.5 }} className="bg-card rounded-3xl p-6 shadow-luxury hover:shadow-luxury-hover transition-all duration-500">
              <div className="gradient-primary w-12 h-12 rounded-xl flex items-center justify-center mb-4 shadow-glow-green">
                <val.icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2 tracking-tight">{val.title}</h3>
              <p className="text-sm text-muted-foreground font-light leading-relaxed">{val.text}</p>
            </motion.div>
          ))}
        </div>
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center">
          <Button size="lg" asChild className="gradient-primary text-primary-foreground btn-luxury rounded-2xl px-8 h-12">
            <Link to="/choose-plan" className="inline-flex items-center">Join FarmVault <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
