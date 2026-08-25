import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
  useSimulationStore, 
  getRemediesForNode, 
  POPULATION_WEIGHT,
  ECONOMIC_COST_PER_HOUR,
  type InfrastructureNode,
  type ResourceType 
} from "@/lib/simulationStore";
import {
  logInterventionOnChain,
  getEtherscanLink,
  type TxStatus
} from "@/lib/web3Service";

import { 
  X, 
  Crosshair, 
  Zap, 
  Droplets, 
  Radio, 
  Heart, 
  Shield, 
  Activity, 
  Clock, 
  Flame,
  ShieldCheck,
  ExternalLink,
  Loader2
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

const statusColors: Record<string, { text: string; bg: string; label: string }> = {
  operational: {
    text: "text-[#3fb950]",
    bg: "bg-[#0d1e13]",
    label: "Online // Operational",
  },
  recovered: {
    text: "text-[#3fb950]",
    bg: "bg-[#0d1e13]",
    label: "Online // Recovered",
  },
  buffering: {
    text: "text-[#d29922]",
    bg: "bg-[#1c180e]",
    label: "Warning // Buffering",
  },
  failed: {
    text: "text-[#f85149]",
    bg: "bg-[#200f11]",
    label: "Offline // Destabilized",
  },
  repairing: {
    text: "text-[#58a6ff]",
    bg: "bg-[#0e1a24]",
    label: "En Route // Dispatched",
  },
};

const NODE_FUNCTIONS: Record<string, string> = {
  "power-substation": "Acts as the primary electrical transmission hub for Nagpur's Hingna industrial corridor and residential grid. Steps down extra-high voltage feeds and routes electricity to Gorewada treatment facilities, telecom exchanges, and secondary grids. A failure here triggers an immediate power cascade.",
  "water-treatment": "Purifies and pumps critical municipal water supply from the Gorewada reservoir. Relies heavily on the Hingna power substation to operate filter trains and heavy pump machinery. Directly delivers clean water to Seminary Hills booster stations, securing flow to GMCH Nagpur.",
  "telecom-exchange": "Anchors the core BSNL Sadar telecom communications exchange. Manages Nagpur's fiber-optic backhauls, emergency voice trunk lines, and metro signaling data paths. Operates under battery backup if power fails, but cascades rapidly once backup power depletes.",
  "metro-signals": "Controls the central Sitabuldi interchange transit network switching and automated rail signals. Synchronizes Nagpur's light rail flow to prevent collisions and minimize public transit delays. Delays in response are heavily amplified if city traffic is gridlocked.",
  "booster-pumps": "Maintains pressurized water flow across the regional Seminary Hills distribution pipeline. Compensates for gravity loss to ensure Nagpur's emergency services and GMCH medical facilities receive uninterrupted water supply. Overloading triggers pump overheating.",
  "hospital-icu": "Operates life-saving medical equipment, intensive care suites, and emergency treatment rooms at the Government Medical College & Hospital (GMCH) Nagpur. Requires uninterrupted water supply and electricity. Directly impacts human lives when operations degrade.",
  "emergency-dispatch": "Coordinates police, ambulance, and disaster response units citywide from the Civil Lines Command Centre. Acts as the nerve center for incident triage and emergency command communications. Completely dependent on active telecommunication fiber uplinks.",
  "fire-station": "Dispatches active fire suppression units, rescue vehicles, and emergency crew teams from the Ganjipeth Fire Station. Responds directly to civic distress calls and Nagpur's cascading emergencies. Relies on emergency dispatch channels to deploy rescue crews.",
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


  if (!node) return null;

  const Icon = sectorIcons[node.sector] || Shield;
  const statusConfig = statusColors[node.status] || statusColors.operational;
  const isFailed = node.status === "failed";
  const isBuffering = node.status === "buffering";
  const isRepairing = node.status === "repairing";
  const isOperational = node.status === "operational" || node.status === "recovered";


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



  return (
    <motion.aside
      className="absolute top-12 right-0 bottom-0 w-[400px] z-40 flex flex-col bg-[#0d1117] overflow-hidden rounded-l-2xl text-[#c9d1d9]"
      style={{ boxShadow: '-10px 0 24px #040609' }}
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 32 }}
    >
      {/* ── Top Header Bar ── */}
      <header className="flex items-center justify-between px-5 py-3.5 bg-[#0d1117]" style={{ boxShadow: '0 4px 8px #040609' }}>
        <div className="flex items-center gap-2">
          <Crosshair size={16} className="text-[#58a6ff]" />
          <span className="text-xs font-sans font-extrabold tracking-wide text-[#ffffff]">
            Target // {node.assetId}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl text-[#8b949e] hover:text-[#ffffff] transition-all active:scale-95 bg-[#0d1117]"
          style={{ boxShadow: '3px 3px 6px #040609, -3px -3px 6px #161b22' }}
        >
          <X size={16} />
        </button>
      </header>

      {/* ── Asset Title Banner ── */}
      <section className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Icon size={18} className={statusConfig.text} />
              <span className="text-xs font-sans font-extrabold tracking-wide text-[#58a6ff]">
                {node.sector.charAt(0) + node.sector.slice(1).toLowerCase()} Infrastructure
              </span>
            </div>
            <h2 className="text-xl font-sans font-black tracking-tight text-[#ffffff] mt-1">
              {node.label}
            </h2>
          </div>

          <span className={`px-3 py-1.5 text-xs font-sans font-extrabold tracking-wide rounded-xl ${statusConfig.text} ${statusConfig.bg}`} style={{ boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.4), inset -3px -3px 6px rgba(255,255,255,0.04)' }}>
            {statusConfig.label}
          </span>
        </div>
      </section>

      {/* ── Main Telemetry Deck (Scrollable) ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 font-sans scrollbar-thin">

        {/* ── Buffering Live Countdown Card (Yellow Alert State) ── */}
        {isBuffering && (
          <section
            className="p-4 bg-[#1c180e] border border-[#d29922]/40 space-y-3 rounded-2xl"
            style={{ boxShadow: 'inset 4px 4px 8px #0d0c07, inset -4px -4px 8px #2b2415' }}
          >
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-[#d29922] font-black text-xs uppercase tracking-wider">
                <Clock size={15} className="animate-spin text-[#ffffff]" />
                Backup Buffer Draining
              </span>
              <span className="text-xs font-black text-[#ffffff] font-mono px-2 py-0.5 rounded bg-[#2b2415] border border-[#ffffff]/40">
                {formatTimer(node.buffer)} 
              </span>
            </div>

            {/* Buffer Countdown Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-extrabold text-[#8b949e]">
                <span>RESERVE CAPACITY</span>
                <span>{Math.round(dangerRatio)}% REMAINING</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[#0d1117] border border-[#21262d] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#d29922] to-[#f85149] transition-all duration-1000"
                  style={{ width: `${Math.min(100, Math.max(0, dangerRatio))}%` }}
                />
              </div>
            </div>
            
            <p className="text-[10px] text-[#8b949e] font-medium leading-tight">
              Grid feed severed or load overloaded. Apply a solution before the buffer reaches 00:00 to prevent total asset failure.
            </p>
          </section>
        )}

        {/* ── Impact Metrics ── */}
        <section className="p-4 bg-[#0d1117] space-y-3 rounded-2xl" style={{ boxShadow: '6px 6px 14px #040609, -6px -6px 14px #161b22' }}>
          <span className="text-xs font-black tracking-wide text-[#ffffff] block">Asset Impact Profile</span>
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#0d1117]" style={{ boxShadow: 'inset 4px 4px 8px #040609, inset -4px -4px 8px #161b22' }}>
              <span className="text-[10px] text-[#8b949e] font-extrabold block mb-1">Population Served</span>
              <span className="text-[#ffffff] font-extrabold text-base">{(POPULATION_WEIGHT[node.id] || 0).toLocaleString()}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#0d1117]" style={{ boxShadow: 'inset 4px 4px 8px #040609, inset -4px -4px 8px #161b22' }}>
              <span className="text-[10px] text-[#8b949e] font-extrabold block mb-1">Asset Function & Role</span>
              <p className="text-[11px] leading-relaxed text-[#c9d1d9] font-normal mt-1">
                {NODE_FUNCTIONS[node.id] || "No description available for this infrastructure asset."}
              </p>
            </div>
          </div>
        </section>

      </div>

      {/* ── Action Deck ── */}
      <footer className="p-5 bg-[#0d1117] space-y-3 font-sans" style={{ boxShadow: '0 -4px 8px #040609' }}>
        {(isFailed || isBuffering) && (
          <>
            <span className="text-[10px] text-[#8b949e] font-extrabold uppercase block mb-1">Available Solutions</span>
            {remedies.map((remedy) => (
              <button
                key={remedy.id}
                onClick={() => applyRemedy(node.id, remedy.id)}
                className="w-full py-2.5 px-3 text-[#58a6ff] hover:text-[#79c0ff] text-xs font-extrabold tracking-wide transition-all rounded-xl flex items-center justify-between active:scale-[0.98] bg-[#0d1117] cursor-pointer"
                style={{ boxShadow: '4px 4px 8px #040609, -4px -4px 8px #161b22' }}
              >
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-[#d29922]" />
                  <span>
                    {remedy.label}
                    {isBuffering && remedy.bufferSeconds ? ` (+${remedy.bufferSeconds}s)` : ""}
                  </span>
                </div>
                <span className="text-[#3fb950] font-bold">
                  ₹{(remedy.cost / 1000).toFixed(0)}k
                </span>
              </button>
            ))}
          </>
        )}

        {isOperational && (
          <div className="py-2.5 px-3 text-center text-xs font-extrabold text-[#3fb950] bg-[#0d1e13] rounded-xl border border-[#3fb950]/20 mb-2">
            Asset Secure // Nominal Operating Status
          </div>
        )}

        {/* Manual Disruption Trigger Button */}
        {isOperational && (
          <button
            onClick={() => blastNode(node.id)}
            className="w-full py-3.5 px-4 text-[#ffffff] text-sm font-black tracking-widest transition-all rounded-xl flex items-center justify-center active:scale-[0.97] bg-[#da3633] hover:bg-[#b82a28] shadow-[0_4px_12px_rgba(218,54,51,0.4)]"
          >
            BLAST
          </button>
        )}
      </footer>
    </motion.aside>
  );
}
