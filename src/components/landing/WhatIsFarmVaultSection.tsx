import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export function WhatIsFarmVaultSection() {
  return (
    <section className="py-20 lg:py-28 bg-background relative overflow-hidden">
      <div className="absolute top-0 left-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px]" />
      
      <div className="container mx-auto px-4 lg:px-8 relative">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 tracking-tight">
              What is <span className="text-gradient-gold">FarmVault</span>?
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="prose prose-lg prose-neutral dark:prose-invert max-w-none"
          >
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              FarmVault is a <strong className="text-foreground">farm management system</strong> that helps farmers track and manage all farm operations in one place.
            </p>
            
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              From harvest collection and labor tracking to inventory and expenses, FarmVault gives farmers a clear view of what is happening on their farm every day.
            </p>

            <div className="bg-secondary/30 rounded-2xl p-6 md:p-8 border border-border">
              <p className="text-base text-muted-foreground leading-relaxed m-0">
                Instead of relying on manual records or guesswork, farmers can use <strong className="text-foreground">real-time data</strong> to improve efficiency and increase profits.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
