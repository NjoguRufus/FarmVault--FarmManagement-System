import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

const realWorldFeatures = [
  "Complex harvest workflows (French beans, vegetables, and more)",
  "Labor tracking and picker payout management",
  "Daily field activity logging",
  "Practical inventory management for real farm inputs",
  "Expense tracking that matches how farms actually spend",
];

export function RealWorldSection() {
  return (
    <section className="py-20 lg:py-28 bg-background relative overflow-hidden">
      <div className="absolute top-1/2 left-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px] -translate-y-1/2" />
      
      <div className="container mx-auto px-4 lg:px-8 relative">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-4">
                Why It Works
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6 tracking-tight">
                Built from <span className="text-gradient-gold">Real Farm Experience</span>
              </h2>
              
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                <p className="text-lg text-muted-foreground leading-relaxed mb-6">
                  FarmVault is not just another agriculture app.
                </p>
                
                <p className="text-base text-muted-foreground leading-relaxed mb-8">
                  It is built from real farming operations, including complex harvest workflows like French beans, labor tracking, picker payouts, and daily field activities.
                </p>

                <div className="bg-secondary/30 rounded-2xl p-6 border border-border">
                  <p className="text-base text-foreground font-medium m-0">
                    This makes FarmVault <strong>practical, realistic, and useful</strong> on actual farms.
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="space-y-4"
            >
              {realWorldFeatures.map((feature, i) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                  className="flex items-start gap-4 bg-card rounded-xl p-4 border border-border"
                >
                  <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0 shadow-glow-green">
                    <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <p className="text-base text-foreground font-medium pt-1">{feature}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
