import { motion } from "framer-motion";
import { AlertTriangle, FileX, Users, Package, DollarSign } from "lucide-react";

const problems = [
  {
    icon: FileX,
    text: "Lost or inaccurate harvest records",
  },
  {
    icon: Users,
    text: "Difficulty tracking labor and picker payments",
  },
  {
    icon: Package,
    text: "Poor inventory control for fertilizers and chemicals",
  },
  {
    icon: DollarSign,
    text: "Unclear farm expenses and reduced profitability",
  },
];

export function ProblemSection() {
  return (
    <section className="py-20 lg:py-28 bg-secondary/30 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(0_0%_0%_/_0.02),_transparent_60%)]" />
      
      <div className="container mx-auto px-4 lg:px-8 relative">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-4">
              The Challenge
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 tracking-tight">
              Why Farms Need <span className="text-gradient-gold">Better Tracking</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Managing a farm without proper tracking often leads to:
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-4 mb-10">
            {problems.map((problem, i) => (
              <motion.div
                key={problem.text}
                initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="flex items-center gap-4 bg-card rounded-2xl p-5 border border-border shadow-sm"
              >
                <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                  <problem.icon className="h-6 w-6 text-destructive" />
                </div>
                <p className="text-base text-foreground font-medium">{problem.text}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="bg-card rounded-2xl p-6 md:p-8 border border-border text-center"
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <span className="text-sm font-semibold text-amber-600 uppercase tracking-wide">Common Problem</span>
            </div>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Many farms still rely on <strong className="text-foreground">notebooks, phone calls, or memory</strong> — which leads to mistakes and lost revenue.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
