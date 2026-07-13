import { motion } from "framer-motion";
import clsx from "clsx";
import { fadeUpItem } from "../../lib/motion";

export default function Card({ children, className, as: Comp = motion.div, animated = true, ...props }) {
  const motionProps = animated ? { variants: fadeUpItem } : {};
  return (
    <Comp
      className={clsx(
        "bg-surface border border-border rounded-2xl shadow-card dark:shadow-card-dark p-5",
        className
      )}
      {...motionProps}
      {...props}
    >
      {children}
    </Comp>
  );
}
