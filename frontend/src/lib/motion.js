/*
  Shared Framer Motion variants — origin-kit-style spring physics (not linear/ease-in-out),
  centralized so every card, list, and panel moves with the same personality instead of each
  component inventing its own timing.
*/

export const spring = { type: "spring", stiffness: 380, damping: 32, mass: 0.9 };
export const springSoft = { type: "spring", stiffness: 260, damping: 30, mass: 1 };

// Staggered fade-up reveal for lists of cards/messages
export const staggerContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.02 },
  },
};

export const fadeUpItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: spring },
};

// Panel entrance (sidebar slide, tab content swap)
export const slideIn = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0, transition: springSoft },
  exit: { opacity: 0, x: -8, transition: { duration: 0.15 } },
};

export const fadeScale = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: springSoft },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.12 } },
};

// Magnetic hover for primary buttons / chips
export const magneticHover = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.03, y: -2, transition: spring },
  tap: { scale: 0.97, y: 0, transition: { duration: 0.1 } },
};
