import { motion } from "framer-motion";
import { Link } from "react-router-dom";

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

            <div className="rounded-2xl border border-border bg-muted/20 p-6 md:p-8 mb-8 text-left">
              <h3 className="text-lg font-semibold text-foreground mb-4">FarmVault helps farmers</h3>
              <ul className="space-y-3 text-muted-foreground list-none m-0 p-0">
                <li>
                  <Link to="/learn/farm-worker-management" className="text-primary font-medium hover:underline">
                    Track workers
                  </Link>{" "}
                  and field teams with clear records
                </li>
                <li>
                  <Link to="/learn/harvest-tracking" className="text-primary font-medium hover:underline">
                    Track harvest
                  </Link>{" "}
                  and collections against projects
                </li>
                <li>
                  <Link to="/learn/farm-expense-management" className="text-primary font-medium hover:underline">
                    Manage expenses
                  </Link>{" "}
                  in KES with categories you control
                </li>
                <li>
                  <Link to="/learn/farm-inventory-management" className="text-primary font-medium hover:underline">
                    Manage inventory
                  </Link>{" "}
                  for inputs and tools
                </li>
                <li>
                  <Link to="/learn/agriculture-analytics" className="text-primary font-medium hover:underline">
                    Analyze farm performance
                  </Link>{" "}
                  with reports tied to real operations
                </li>
              </ul>
              <p className="text-sm text-muted-foreground mt-4 mb-0">
                Browse all topics in the{" "}
                <Link to="/learn" className="text-primary font-medium hover:underline">
                  Learn hub
                </Link>
                .
              </p>
            </div>

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
