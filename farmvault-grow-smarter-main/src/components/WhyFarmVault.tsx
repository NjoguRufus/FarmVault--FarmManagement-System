import { Layers, BarChart3, Smartphone, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

const reasons = [
  {
    icon: Layers,
    title: "All-in-One System",
    description: "Crops, tasks, inventory, expenses, and sales in a single platform.",
    gradient: "from-primary to-primary-light",
  },
  {
    icon: BarChart3,
    title: "Data-Driven Decisions",
    description: "Real-time reports and analytics to maximize your farm's productivity.",
    gradient: "from-primary-light to-primary-glow",
  },
  {
    icon: Smartphone,
    title: "Mobile-First Design",
    description: "Access your farm data anywhere, anytime from your phone.",
    gradient: "from-gold to-gold-light",
  },
  {
    icon: ShieldCheck,
    title: "Secure Cloud-Based",
    description: "Your data is encrypted and safely stored in the cloud.",
    gradient: "from-primary to-primary-glow",
  },
];

const WhyFarmVault = () => {
  return (
    <section className="py-24 lg:py-32 bg-secondary/50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(145_63%_22%_/_0.03),_transparent_70%)]" />

      <div className="container mx-auto px-4 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-4 font-body">
            Why FarmVault
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-5 tracking-tight">
            Why Farmers Choose{" "}
            <span className="text-gradient-gold">FarmVault</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto font-body text-base font-light">
            Trusted by thousands of farmers across Africa.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {reasons.map((reason, i) => (
            <motion.div
              key={reason.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              whileHover={{ y: -6, transition: { duration: 0.3 } }}
              className="bg-card rounded-3xl p-7 text-center shadow-luxury hover:shadow-luxury-hover transition-all duration-500 group"
            >
              <div className={`bg-gradient-to-br ${reason.gradient} w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-glow-green group-hover:scale-110 transition-transform duration-300`}>
                <reason.icon className="h-7 w-7 text-primary-foreground" />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground mb-2 tracking-tight">{reason.title}</h3>
              <p className="text-sm text-muted-foreground font-body font-light leading-relaxed">{reason.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyFarmVault;
