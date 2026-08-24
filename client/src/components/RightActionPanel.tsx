import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { useSimStore } from "@/lib/useSimStore";
import { X, Shield, AlertTriangle, Hammer, Users, Activity, Clock } from "lucide-react";

interface RightActionPanelProps {
  selectedNodeId: string;
  onClose: () => void;
}

export default function RightActionPanel({ selectedNodeId, onClose }: RightActionPanelProps) {
  const node = useSimStore((state) => state.nodes[selectedNodeId]);
  const inventory = useSimStore((state) => state.inventory);
  const deployResource = useSimStore((state) => state.deployResource);
  const simulateFuture = useSimStore((state) => state.simulateFuture);

  // Run predictive triage outcome projection
  const prediction = useMemo(() => {
    if (!node) return null;
    return simulateFuture(node.id);
  }, [node, simulateFuture]);

  if (!node) return null;

  const isHealthy = node.status === "HEALTHY";
  const isRepairing = node.status === "REPAIRING";
  const isBuffering = node.status === "BUFFERING";
  const isFailed = node.status === "FAILED";

  // Disable rule: can't deploy if healthy, already repairing, or out of crews
  const canDeploy = (isFailed || isBuffering) && inventory.crews > 0;

  // Danger bar ratio calculation
  const dangerRatio = node.baseDangerDuration > 0
    ? (node.dangerTimer / node.baseDangerDuration) * 100
    : 0;

  // Rescue bar ratio calculation (crew travel progress)
  const rescueRatio = node.baseRescueDuration > 0
    ? ((node.baseRescueDuration - node.rescueTimer) / node.baseRescueDuration) * 100
    : 0;

  const statusColors = {
    HEALTHY: "text-[#00FF66] border-[#00FF66] bg-[#00FF66]/10",
    BUFFERING: "text-[#FF9900] border-[#FF9900] bg-[#FF9900]/10",
    FAILED: "text-[#FF0033] border-[#FF0033] bg-[#FF0033]/10",
    REPAIRING: "text-[#00E5FF] border-[#00E5FF] bg-[#00E5FF]/10",
  };

  return (
    <motion.div
      className="absolute top-16 right-4 bottom-16 w-96 z-40 flex flex-col rounded-lg border border-zinc-800 bg-[#09090b]/95 shadow-2xl backdrop-blur-xl"
      initial={{ x: "110%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "110%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
    >
      {/* ── Header Area ── */}
      <header className="flex justify-between items-start p-5 border-b border-zinc-800 bg-zinc-950/40 rounded-t-lg">
        <div>
          <span className="text-[9px] font-bold font-mono tracking-widest text-zinc-500 uppercase">
            {node.sector} Node // {node.id}
          </span>
          <h2 className="text-xl font-bold font-sans tracking-tight text-white mt-1">
            {node.label}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded border border-zinc-800 bg-[#121214] text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 active:scale-95 transition-all"
        >
          <X size={15} />
        </button>
      </header>

      {/* ── Status Banner ── */}
      <section className="px-5 py-4 border-b border-zinc-800/60 bg-zinc-950/20">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold font-mono text-zinc-400 tracking-wider">ASSET SIGNAL STATE</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${statusColors[node.status]}`}>
            {node.status}
          </span>
        </div>
      </section>

      {/* ── Content Area ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
        {/* ── Dual Progress Bars (Only when REPAIRING) ── */}
        {isRepairing && (
          <article className="space-y-4 p-4 rounded border border-cyan-500/20 bg-cyan-950/10">
            <h3 className="flex items-center gap-2 text-[10px] font-bold font-mono text-cyan-400 uppercase tracking-widest">
              <Hammer size={12} className="animate-spin" /> Repair Dispatch Active
            </h3>
            
            {/* Top Bar (Danger / Battery Depletion countdown) */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[9px] font-bold font-mono text-rose-400">
                <span>BACKUP BATTERY RESERVES</span>
                <span>{node.dangerTimer}s LEFT</span>
              </div>
              <div className="h-2 w-full rounded bg-zinc-900 border border-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded bg-[#FF0033] transition-all duration-1000"
                  style={{ width: `${dangerRatio}%` }}
                />
              </div>
            </div>

            {/* Bottom Bar (Rescue / Crew Travel progress) */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[9px] font-bold font-mono text-cyan-400">
                <span>RESCUE TEAM TRAVEL EN ROUTE</span>
                <span>ETA {node.rescueTimer}s</span>
              </div>
              <div className="h-2 w-full rounded bg-zinc-900 border border-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded bg-[#00E5FF] transition-all duration-1000"
                  style={{ width: `${rescueRatio}%` }}
                />
              </div>
            </div>
          </article>
        )}

        {/* ── Buffering Warning ── */}
        {isBuffering && (
          <article className="p-4 rounded border border-amber-500/25 bg-amber-950/10 space-y-3">
            <h3 className="flex items-center gap-2 text-[10px] font-bold font-mono text-amber-500 uppercase tracking-widest animate-pulse">
              <AlertTriangle size={13} /> Reserves Consuming
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Target node has lost grid feed. Local battery capacity is draining. Apply crew dispatch immediately.
            </p>
            <div className="flex items-center gap-2.5">
              <Clock size={14} className="text-amber-500" />
              <span className="text-sm font-bold font-mono text-amber-500">
                CRITICAL THRESHOLD: {node.dangerTimer}s
              </span>
            </div>
          </article>
        )}

        {/* ── Failed State Warning ── */}
        {isFailed && (
          <article className="p-4 rounded border border-rose-500/25 bg-rose-950/10 space-y-2">
            <h3 className="flex items-center gap-2 text-[10px] font-bold font-mono text-rose-500 uppercase tracking-widest">
              <AlertTriangle size={13} /> Grid Failure Confirmed
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This node has suffered total power loss and is propagating cascades down related edges. Bootstrapping requires a crew tanker deployment.
            </p>
          </article>
        )}

        {/* ── Predictive Triage Outcomes (AI Time Machine) ── */}
        {prediction && (isFailed || isBuffering) && (
          <section className="space-y-3 p-4 rounded border border-zinc-800 bg-zinc-950/40">
            <h3 className="flex items-center gap-2 text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-widest">
              <Activity size={12} /> Predictive Triage (Foresight)
            </h3>
            <p className="text-[11px] text-zinc-400">
              Projected outcomes if crew is dispatched to this node:
            </p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2 border border-zinc-800 bg-[#0e0e11]">
                <span className="text-[8px] font-bold font-mono text-zinc-500 block uppercase">SAVED ASSETS</span>
                <strong className="text-lg font-bold font-mono text-[#00FF66]">
                  {prediction.savedNodeIds.length}
                </strong>
              </div>
              <div className="p-2 border border-zinc-800 bg-[#0e0e11]">
                <span className="text-[8px] font-bold font-mono text-zinc-500 block uppercase">LOST ASSETS</span>
                <strong className="text-lg font-bold font-mono text-[#FF0033]">
                  {prediction.lostNodeIds.length}
                </strong>
              </div>
            </div>
            <div className="flex justify-between items-center text-[10px] font-bold font-mono text-zinc-500 border-t border-zinc-800/60 pt-2 mt-1">
              <span>PROJECTED STABILITY</span>
              <span className={prediction.finalStabilityIndex > 70 ? "text-[#00FF66]" : "text-[#FF9900]"}>
                {prediction.finalStabilityIndex}%
              </span>
            </div>
          </section>
        )}
      </div>

      {/* ── Action Deployment Area ── */}
      <footer className="p-5 border-t border-zinc-800 bg-zinc-950/40 rounded-b-lg">
        <button
          onClick={() => deployResource(node.id)}
          disabled={!canDeploy}
          className="w-full py-3 flex items-center justify-center gap-2 rounded font-mono font-bold text-xs uppercase tracking-widest border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed
            enabled:border-cyan-500 enabled:bg-cyan-500/10 enabled:text-[#00E5FF] enabled:hover:bg-cyan-500 enabled:hover:text-black enabled:active:scale-[0.98] enabled:hover:shadow-[0_0_15px_rgba(0,229,255,0.3)]"
        >
          <Users size={14} />
          {node.status === "HEALTHY" 
            ? "SYSTEM NOMINAL" 
            : node.status === "REPAIRING" 
            ? "REPAIR IN PROGRESS"
            : inventory.crews <= 0
            ? "NO CREWS AVAILABLE"
            : "DEPLOY REPAIR CREW"}
        </button>
      </footer>
    </motion.div>
  );
}
