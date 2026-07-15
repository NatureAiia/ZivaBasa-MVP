import { motion } from "framer-motion";
import { HardHat, ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import ClarityRing from "../components/common/ClarityRing";
import Button from "../components/common/Button";
import { MODELS } from "../components/layout/Sidebar";

export default function InDevelopment() {
  const { slug } = useParams();
  const name = MODELS.find((m) => m.slug === slug)?.name || "This module";

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="max-w-md w-full text-center flex flex-col items-center gap-5"
      >
        <div className="relative">
          <ClarityRing mode="loading" size={72} strokeWidth={5} color="indigo" />
          <HardHat size={22} className="absolute inset-0 m-auto text-indigo" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">{name} is still in development</h1>
          <p className="mt-2 text-sm text-ink-muted leading-relaxed">
            This module hasn't been built yet. ZivaBasa is the only fully working module on
            ChiedzaAI right now — everything else in the sidebar is a placeholder for what's
            coming next.
          </p>
        </div>
        <Link to="/models/zivabasa">
          <Button variant="secondary" className="mt-2">
            <ArrowLeft size={15} /> Go to ZivaBasa
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}
