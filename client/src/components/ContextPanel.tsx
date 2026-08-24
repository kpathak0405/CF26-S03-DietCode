import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { 
  useSimulationStore, 
  getRemediesForNode, 
  simulateOutcome,
  POPULATION_WEIGHT,
  ECONOMIC_COST_PER_HOUR,
  type InfrastructureNode,
  type ResourceType 
} from "@/lib/simulationStore";
import { 
  X, 
  Crosshair, 
  AlertTriangle, 
  Zap, 
  Droplets, 
  Radio, 
  Heart, 
  Shield, 
  Activity, 
  Gauge, 
  Clock, 
  Flame,
  Radio as SignalIcon
} from "lucide-react";

interface ContextPanelProps {
  selectedNodeId: string;
  onClose: () => void;
}

const sectorIcons: Record<string, typeof Zap> = {
  POWER: Zap,
  WATER: Droplets,
  COMMS: Radio,
  MOBILITY: Activity,
  HEALTH: Heart,
  CIVIC: Shield,
};

const statusColors: Record<string, { text: string; border: string; glow: string; label: string }> = {
  operational: {
    text: "text-[#00FF66]",
    border: "border-[#00FF66]",
    glow: "shadow-[0_0_12px_rgba(0,255,102,0.4)]",
    label: "ONLINE // OPERATIONAL",
  },
  recovered: {
    text: "text-[#00FF66]",
    border: "border-[#00FF66]",
    glow: "shadow-[0_0_12px_rgba(0,255,102,0.4)]",
    label: "ONLINE // RECOVERED",
  },
  buffering: {
    text: "text-[#FF9900]",
    border: "border-[#FF9900]",
    glow: "shadow-[0_0_12px_rgba(255,153,0,0.4)]",
    label: "WARN // BUFFERING",
  },
  failed: {
    text: "text-[#FF0033]",
    border: "border-[#FF0033]",
    glow: "shadow-[0_0_12px_rgba(255,0,51,0.5)]",
    label: "OFFLINE // DESTABILIZED",
  },
  repairing: {
    text: "text-[#00E5FF]",
    border: "border-[#00E5FF]",
    glow: "shadow-[0_0_12px_rgba(0,229,255,0.4)]",
    label: "EN ROUTE // DISPATCHED",
  },
};

export default function ContextPanel({ selectedNodeId, onClose }: ContextPanelProps) {
  const nodes = useSimulationStore((state) => state.nodes);
  const edges = useSimulationStore((state) => state.edges);
  const inventory = useSimulationStore((state) => state.inventory);
  const blastNode = useSimulationStore((state) => state.blastNode);
  const applyRemedy = useSimulationStore((state) => state.applyRemedy);
  const cityTrafficMultiplier = useSimulationStore((state) => state.cityTrafficMultiplier);

  const node = nodes.find((n) => n.id === selectedNodeId);
  const remedies = getRemediesForNode(selectedNodeId);

  // Predictive Triage lookahead
  const triage = useMemo(() => {
    if (!node) return null;
    return simulateOutcome(node.id, nodes, edges);
  }, [node, nodes, edges]);

  if (!node) return null;

  const Icon = sectorIcons[node.sector] || Shield;
  const statusConfig = statusColors[node.status] || statusColors.operational;
  const isFailed = node.status === "failed";
  const isBuffering = node.status === "buffering";
  const isRepairing = node.status === "repairing";
  const isOperational = node.status === "operational" || node.status === "recovered";

  // Capacity Load calculations
  const loadPercentage = node.capacity > 0 
    ? Math.round((node.currentLoad / node.capacity) * 100) 
    : 0;
  const isOverloaded = node.currentLoad > node.capacity;

  // Format seconds to MM:SS
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Timers ratios
  const dangerRatio = node.baseBuffer > 0 ? (node.buffer / node.baseBuffer) * 100 : 0;
  const rescueRatio = node.maxRescueTime > 0 
    ? ((node.maxRescueTime - node.rescueTimer) / node.maxRescueTime) * 100 
    : 0;

  // Primary restore remedy
  const restoreRemedy = remedies.find((r) => r.effect === "restore") || remedies[0];
  const bufferRemedy = remedies.find((r) => r.effect === "buffer");

  return (
    <motion.aside
      className="absolute top-10 right-0 bottom-0 w-[400px] z-40 flex flex-col bg-black/90 backdrop-blur-xl border-l border-zinc-800 rounded-none shadow-[0_0_40px_rgba(0,0,0,0.8)] overflow-hidden"
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 32 }}
    >
      {/* Corner Bracket Reticles */}
      <div className="corner-bracket corner-tl" />
      <div className="corner-bracket corner-bl" />

      {/* ── Top Header Bar ── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-[#070709]">
        <div className="flex items-center gap-2">
          <Crosshair size={14} className="text-[#00E5FF] animate-pulse" />
          <span className="text-[10px] font-mono font-bold tracking-widest text-zinc-400 uppercase">
            TARGET // {node.assetId}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-none border border-zinc-800 bg-[#0d0d10] text-zinc-400 hover:text-white hover:border-zinc-600 hover:bg-zinc-800 transition-all active:scale-95"
        >
          <X size={14} />
        </button>
      </header>

      {/* ── Asset Title Banner ── */}
      <section className="px-5 py-4 border-b border-zinc-800/80 bg-zinc-950/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Icon size={16} className={statusConfig.text} />
              <span className="text-[10px] font-mono font-bold tracking-widest text-zinc-500 uppercase">
                {node.sector} INFRASTRUCTURE
              </span>
            </div>
            <h2 className="text-base font-mono font-bold tracking-tight text-zinc-100 uppercase mt-1">
              {node.label}
            </h2>
          </div>

          <span className={`px-2 py-1 text-[9px] font-mono font-bold tracking-widest uppercase border rounded-none ${statusConfig.text} ${statusConfig.border} ${statusConfig.glow} bg-black/60`}>
            {statusConfig.label}
          </span>
        </div>
      </section>

      {/* ── Main Telemetry Deck (Scrollable) ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 font-mono scrollbar-thin">
        
        {/* ── Telemetry Box 1: Load Capacity Meter ── */}
        <section className="p-3.5 border border-zinc-800 bg-[#0b0b0e] space-y-2.5 rounded-none relative">
          <div className="flex justify-between items-center text-[10px] tracking-widest uppercase text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Gauge size={12} className={isOverloaded ? "text-[#FF0033]" : "text-[#00E5FF]"} />
              LOAD UTILIZATION
            </span>
            <span className={isOverloaded ? "text-[#FF0033] font-bold" : "text-zinc-200"}>
              {node.currentLoad} / {node.capacity} MW ({loadPercentage}%)
            </span>
          </div>

          {/* Thin Horizontal Progress Gauge */}
          <div className="h-1.5 w-full bg-zinc-900 border border-zinc-800 rounded-none overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isOverloaded
                  ? "bg-[#FF0033] shadow-[0_0_8px_#FF0033]"
                  : loadPercentage > 85
                  ? "bg-[#FF9900]"
                  : "bg-[#00FF66]"
              }`}
              style={{ width: `${Math.min(100, loadPercentage)}%` }}
            />
          </div>

          {isOverloaded && (
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#FF0033] bg-[#FF0033]/10 border border-[#FF0033]/30 p-1.5">
              <AlertTriangle size={11} className="animate-pulse" />
              <span>CAPACITY EXCEEDED // SIBLING OVERLOAD RISK</span>
            </div>
          )}
        </section>

        {/* ── Telemetry Box 2: Critical Dual Timers ── */}
        {(isBuffering || isRepairing) && (
          <section className="p-3.5 border border-zinc-800 bg-[#0b0b0e] space-y-3 rounded-none">
            <div className="flex justify-between items-center text-[10px] tracking-widest uppercase text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Clock size={12} className="text-[#FF9900]" />
                CRITICAL TIMERS
              </span>
              {cityTrafficMultiplier > 1 && (
                <span className="text-[9px] text-[#FF0033] animate-pulse">
                  GRIDLOCK {cityTrafficMultiplier}×
                </span>
              )}
            </div>

            {/* Danger Timer Bar */}
            {isBuffering && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold text-[#FF0033]">
                  <span>BATTERY RESERVE DEPLETION</span>
                  <span className="text-sm tracking-wider">{formatTimer(node.buffer)}</span>
                </div>
                <div className="h-1 w-full bg-zinc-900 border border-zinc-800 rounded-none overflow-hidden">
                  <div
                    className="h-full bg-[#FF0033] shadow-[0_0_6px_#FF0033] transition-all duration-1000"
                    style={{ width: `${dangerRatio}%` }}
                  />
                </div>
              </div>
            )}

            {/* Rescue Timer Bar */}
            {isRepairing && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold text-[#00E5FF]">
                  <span>CREW EN ROUTE ETA</span>
                  <span className="text-sm tracking-wider">{formatTimer(node.rescueTimer)}</span>
                </div>
                <div className="h-1 w-full bg-zinc-900 border border-zinc-800 rounded-none overflow-hidden">
                  <div
                    className="h-full bg-[#00E5FF] shadow-[0_0_6px_#00E5FF] transition-all duration-1000"
                    style={{ width: `${rescueRatio}%` }}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Telemetry Box 3: Predictive AI Triage Matrix ── */}
        {triage && (isFailed || isBuffering) && (
          <section className="p-3.5 border border-zinc-800 bg-[#0b0b0e] space-y-2.5 rounded-none">
            <span className="text-[10px] tracking-widest uppercase text-zinc-400 block flex items-center gap-1.5">
              <Activity size={12} className="text-[#00FF66]" />
              AI FORESIGHT // TRIAGE PREDICTOR
            </span>
            <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
              <div className="p-2 border border-zinc-800 bg-black/60">
                <span className="text-[8px] text-zinc-500 uppercase block">PROJECTED SAVED</span>
                <strong className="text-base text-[#00FF66] font-bold">{triage.savedCount} ASSETS</strong>
              </div>
              <div className="p-2 border border-zinc-800 bg-black/60">
                <span className="text-[8px] text-zinc-500 uppercase block">PROJECTED LOST</span>
                <strong className="text-base text-[#FF0033] font-bold">{triage.lostCount} ASSETS</strong>
              </div>
            </div>
            <div className="flex justify-between items-center text-[9px] text-zinc-400 border-t border-zinc-800 pt-2">
              <span>PROJECTED LOSS SAVED</span>
              <span className="text-[#00FF66] font-bold">₹{(triage.financialImpact / 100000).toFixed(1)}L SAVED</span>
            </div>
          </section>
        )}

        {/* ── Telemetry Box 4: Impact Metrics ── */}
        <section className="p-3.5 border border-zinc-800 bg-[#0b0b0e] space-y-2 rounded-none">
          <span className="text-[10px] tracking-widest uppercase text-zinc-400 block">ASSET IMPACT PROFILE</span>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="p-2 border border-zinc-800/80 bg-zinc-950/40">
              <span className="text-[8px] text-zinc-500 uppercase block">POPULATION SERVED</span>
              <span className="text-zinc-200 font-bold">{(POPULATION_WEIGHT[node.id] || 0).toLocaleString()}</span>
            </div>
            <div className="p-2 border border-zinc-800/80 bg-zinc-950/40">
              <span className="text-[8px] text-zinc-500 uppercase block">ECONOMIC BURN RATE</span>
              <span className="text-[#FF9900] font-bold">₹{((ECONOMIC_COST_PER_HOUR[node.id] || 0) / 100000).toFixed(1)}L / HR</span>
            </div>
          </div>
        </section>

      </div>

      {/* ── Action Deck ── */}
      <footer className="p-5 border-t border-zinc-800 bg-[#070709] space-y-2 font-mono">
        {/* Hardware Switch Deploy Button */}
        {restoreRemedy && (
          <button
            onClick={() => applyRemedy(node.id, restoreRemedy.id)}
            disabled={!isFailed && !isBuffering}
            className={`w-full py-3 px-4 border text-[11px] font-bold uppercase tracking-widest transition-all duration-150 rounded-none flex items-center justify-center gap-2 ${
              (isFailed || isBuffering)
                ? "border-[#00E5FF] text-[#00E5FF] bg-transparent hover:bg-[#00E5FF] hover:text-black hover:shadow-[0_0_15px_rgba(0,229,255,0.6)] active:scale-[0.98]"
                : isOperational
                ? "border-zinc-800 text-zinc-600 bg-zinc-950 cursor-not-allowed"
                : isRepairing
                ? "border-cyan-800 text-cyan-500 bg-cyan-950/20 cursor-wait"
                : "border-rose-900 text-rose-500/60 bg-rose-950/20 cursor-not-allowed"
            }`}
          >
            <SignalIcon size={14} />
            {isOperational
              ? "ASSET SECURE // NOMINAL"
              : isRepairing
              ? "REPAIR CREW DISPATCHED"
              : `DEPLOY: ${restoreRemedy.label}`}
          </button>
        )}

        {/* Secondary Buffer Remedy Button */}
        {bufferRemedy && (isFailed || isBuffering) && (
          <button
            onClick={() => applyRemedy(node.id, bufferRemedy.id)}
            className="w-full py-2 px-3 border border-amber-500/50 text-amber-400 bg-amber-950/20 hover:bg-amber-500 hover:text-black text-[10px] font-bold uppercase tracking-widest transition-all rounded-none flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Clock size={12} />
            {bufferRemedy.label} (+{bufferRemedy.bufferSeconds}s)
          </button>
        )}

        {/* Manual Disruption Trigger Button */}
        {isOperational && (
          <button
            onClick={() => blastNode(node.id)}
            className="w-full py-2 px-3 border border-rose-900/60 text-rose-400 bg-rose-950/20 hover:bg-rose-900 hover:text-white hover:border-rose-600 text-[10px] font-bold uppercase tracking-widest transition-all rounded-none flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Flame size={12} />
            TRIGGER FIELD STRIKE (BLAST NODE)
          </button>
        )}
      </footer>
    </motion.aside>
  );
}
