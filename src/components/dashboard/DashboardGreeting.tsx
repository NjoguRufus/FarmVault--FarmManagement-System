import React from 'react';
import { motion } from 'framer-motion';
import { getGreetingText } from '@/lib/getTimeGreeting';

interface DashboardGreetingProps {
  firstName: string | null;
  className?: string;
}

export function DashboardGreeting({ firstName, className = '' }: DashboardGreetingProps) {
  const greeting = getGreetingText(firstName);
  // Split so we can animate the wave separately
  const textPart = greeting.replace(' 👋', '');
  const showWave = greeting.includes('👋');

  return (
    <motion.h2
      className={`text-xl sm:text-2xl font-semibold text-foreground ${className}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {textPart}
      {showWave && (
        <motion.span
          className="inline-block ml-0.5"
          initial={{ scale: 0.8, rotate: -15 }}
          animate={{
            scale: 1,
            rotate: 0,
            transition: { delay: 0.2, type: 'spring', stiffness: 400, damping: 15 },
          }}
        >
          👋
        </motion.span>
      )}
    </motion.h2>
  );
}
