import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, Send } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const contactItems = [
  { icon: Phone, label: "Phone", value: "+254 700 123 456" },
  { icon: Mail, label: "Email", value: "hello@farmvault.co.ke" },
  { icon: MapPin, label: "Office", value: "Nairobi, Kenya" },
];

export function ContactSection() {
  return (
    <section id="contact" className="py-24 lg:py-32 bg-secondary/50 relative overflow-hidden">
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px]" />

      <div className="container mx-auto px-4 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-4">
            Get in touch
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-5 tracking-tight">
            <span className="text-gradient-gold">Contact</span> Us
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-base font-light leading-relaxed">
            Have questions or need help getting started? We’re here for you.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto bg-card rounded-3xl shadow-luxury p-8 md:p-10"
        >
          <div className="grid sm:grid-cols-3 gap-6 mb-10">
            {contactItems.map((item) => (
              <div key={item.label} className="flex flex-col items-center text-center sm:items-start sm:text-left">
                <div className="gradient-primary w-10 h-10 rounded-xl flex items-center justify-center mb-3">
                  <item.icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{item.label}</p>
                <p className="text-sm font-medium text-foreground">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-8">
            <p className="text-sm text-muted-foreground text-center mb-6 font-light">
              Prefer to get started right away? Create your account and set up your farm in minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" asChild className="gradient-primary text-primary-foreground btn-luxury rounded-2xl px-8 h-12">
                <Link to="/choose-plan" className="inline-flex items-center justify-center">
                  Get Started
                  <Send className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="rounded-2xl px-8 h-12 border-2 border-primary text-primary hover:bg-primary/5">
                <Link to="/login" className="inline-flex items-center justify-center">Login</Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
