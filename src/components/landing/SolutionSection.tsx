import { motion } from "framer-motion";
import { CheckCircle2, Truck, Users, Package, Receipt, BarChart3 } from "lucide-react";

const solutions = [
  {
    icon: Truck,
    title: "Track daily harvest collections",
    description: "Record every harvest accurately and monitor output per picker.",
  },
  {
    icon: Users,
    title: "Monitor picker performance and payouts",
    description: "Track worker productivity and manage payments fairly.",
  },
  {
    icon: Package,
    title: "Manage farm inventory",
    description: "Keep track of fertilizers, pesticides, fuel, and tools.",
  },
  {
    icon: Receipt,
    title: "Record and track expenses automatically",
    description: "See exactly where your money goes on the farm.",
  },
  {
    icon: BarChart3,
    title: "View reports and make better decisions",
    description: "Use real data to understand farm performance.",
  },
];

export function SolutionSection() {
  return (
    <section className="py-20 lg:py-28 bg-background relative overflow-hidden">
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
      
      <div className="container mx-auto px-4 lg:px-8 relative">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-4">
              The Solution
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 tracking-tight">
              How FarmVault <span className="text-gradient-gold">Helps</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              FarmVault simplifies farm operations by giving you full control.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {solutions.map((solution, i) => (
              <motion.div
                key={solution.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                className="bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-luxury transition-shadow duration-300"
              >
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4 shadow-glow-green">
                  <solution.icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{solution.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{solution.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
