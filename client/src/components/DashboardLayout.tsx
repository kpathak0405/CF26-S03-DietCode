import React, { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { 
  useSimulationStore, 
  DISASTER_PRESETS,
  exportAfterActionReport,
  loadScenarioFromJSON
} from "@/lib/simulationStore";
import LiveCityMap from "./LiveCityMap";
import ContextPanel from "./ContextPanel";
import { 
  Activity, 
  Shield, 
  RotateCcw, 
  AlertTriangle, 
  Play, 
  Pause, 
  Crosshair, 
  Flame, 
  Download, 
  Upload,
  Clock,
  Circle,
  Zap,
  Droplets,
  Radio,
  Heart,
  Users
} from "lucide-react";

export default function DashboardLayout() {
  const nodes = useSimulationStore((state) => state.nodes);
  const edges = useSimulationStore((state) => state.edges);
  const inventory = useSimulationStore((state) => state.inventory);
  const activePresetId = useSimulationStore((state) => state.activePresetId);
  const totalPeopleAffected = useSimulationStore((state) => state.totalPeopleAffected);
  const totalFinancialLoss = useSimulationStore((state) => state.totalFinancialLoss);
  const cascadeDepth = useSimulationStore((state) => state.cascadeDepth);
  const peakFailedCount = useSimulationStore((state) => state.peakFailedCount);
  const cityTrafficMultiplier = useSimulationStore((state) => state.cityTrafficMultiplier);
  
  const tick = useSimulationStore((state) => state.tick);
  const reset = useSimulationStore((state) => state.reset);
  const applyPreset = useSimulationStore((state) => state.applyPreset);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [isRunning, setIsPlaying] = useState<boolean>(true);

  // Clock Ticker for ICCC Top Bar
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-IN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
        " IST"
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Main simulation tick loop
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      tick();
    }, 1000);
    return () => clearInterval(interval);
  }, [tick, isRunning]);

  // Handle JSON Scenario download
  const handleExportJSON = () => {
    exportAfterActionReport();
  };

  // Handle JSON Scenario upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        loadScenarioFromJSON(json);
      } catch (err) {
        console.error("Failed to parse scenario JSON", err);
      }
    };
    reader.readAsText(file);
  };

  const isGridlock = cityTrafficMultiplier > 1;
  const failedNodesCount = nodes.filter((n) => n.status === "failed").length;
  const operationalCount = nodes.filter((n) => n.status === "operational" || n.status === "recovered").length;
  const stabilityIndex = nodes.length > 0 ? Math.round((operationalCount / nodes.length) * 100) : 100;

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-[#050505] text-zinc-100 font-sans select-none relative">
      
      {/* ── Top Bar (Military Status Header) ── */}
      <header className="h-10 border-b border-zinc-800/80 bg-black flex items-center justify-between px-4 z-40 text-zinc-400 font-mono text-[10px] tracking-widest uppercase">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-zinc-100 font-bold">
            <Crosshair size={13} className="text-[#00E5FF] animate-pulse" />
            <span>URBAN CASCADE FIELD // LIVE METRICS</span>
          </div>
          <span className="text-zinc-700">|</span>
          <div className="flex items-center gap-1.5 text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00FF66] animate-ping" />
            <span>NAGPUR GRID SECTOR 04</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Traffic / Gridlock Status */}
          {isGridlock ? (
            <div className="flex items-center gap-1.5 text-[#FF0033] font-bold bg-[#FF0033]/10 px-2 py-0.5 border border-[#FF0033]/30">
              <AlertTriangle size={11} className="animate-bounce" />
              <span>GRIDLOCK ACTIVE (TRANSIT ×{cityTrafficMultiplier})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[#00FF66]">
              <Circle size={8} className="fill-[#00FF66]" />
              <span>SYSTEM: OPERATIONAL</span>
            </div>
          )}

          <span className="text-zinc-700">|</span>

          {/* Clock */}
          <div className="flex items-center gap-1 text-zinc-300">
            <Clock size={11} className="text-zinc-500" />
            <span>{currentTime || "00:00:00 IST"}</span>
          </div>

          <span className="text-zinc-700">|</span>

          {/* Master Sim Controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsPlaying(!isRunning)}
              className={`px-2 py-0.5 border flex items-center gap-1 transition-all rounded-none ${
                isRunning 
                  ? "border-cyan-500/40 text-[#00E5FF] bg-cyan-950/20 hover:bg-cyan-500 hover:text-black" 
                  : "border-amber-500/40 text-[#FF9900] bg-amber-950/20 hover:bg-amber-500 hover:text-black"
              }`}
            >
              {isRunning ? <Pause size={10} /> : <Play size={10} />}
              <span>{isRunning ? "PAUSE" : "RESUME"}</span>
            </button>
            <button
              onClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); reset(); }}
              className="px-2 py-0.5 border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:border-zinc-600 transition-all rounded-none flex items-center gap-1"
            >
              <RotateCcw size={10} />
              <span>RESET</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Command Center Stage ── */}
      <section className="flex flex-1 overflow-hidden relative">
        
        {/* ── Left HUD Panel (w-96, Glassmorphism, Sharp Hairline Borders) ── */}
        <aside className="w-96 border-r border-zinc-800 bg-black/85 backdrop-blur-md flex flex-col z-30 font-mono text-[10px] tracking-widest overflow-hidden rounded-none">
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            
            {/* ── Block 1: Telemetry Scoreboard ── */}
            <section className="p-3 border border-zinc-800/80 bg-[#09090b]/80 space-y-2 rounded-none">
              <div className="flex justify-between items-center text-zinc-400 border-b border-zinc-800/60 pb-1.5">
                <span className="flex items-center gap-1.5 text-zinc-300 font-bold">
                  <Activity size={12} className="text-[#00FF66]" />
                  TELEMETRY SCOREBOARD
                </span>
                <span className="text-zinc-500">LIVE FEED</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 border border-zinc-800/60 bg-black/50">
                  <span className="text-[8px] text-zinc-500 uppercase block">PEOPLE AT RISK</span>
                  <strong className="text-sm font-bold text-zinc-100 tracking-wider">
                    {totalPeopleAffected.toLocaleString()}
                  </strong>
                </div>
                <div className="p-2 border border-zinc-800/60 bg-black/50">
                  <span className="text-[8px] text-zinc-500 uppercase block">CASCADE DEPTH</span>
                  <strong className="text-sm font-bold text-[#FF9900] tracking-wider">
                    LEVEL {cascadeDepth}
                  </strong>
                </div>
              </div>

              {/* Economic Loss Ticker */}
              <div className="p-2.5 border border-rose-950/60 bg-rose-950/20 flex justify-between items-center">
                <div>
                  <span className="text-[8px] text-rose-400 uppercase block">TOTAL ECONOMIC LOSS</span>
                  <strong className="text-base font-bold text-[#FF0033] tracking-tight">
                    ₹{(totalFinancialLoss / 100000).toFixed(2)} LAKHS
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-[8px] text-zinc-500 uppercase block">PEAK FAILURES</span>
                  <span className="text-xs font-bold text-rose-400">{peakFailedCount} ASSETS</span>
                </div>
              </div>
            </section>

            {/* ── Block 2: City Garage (Inventory Metrics) ── */}
            <section className="p-3 border border-zinc-800/80 bg-[#09090b]/80 space-y-2.5 rounded-none">
              <div className="flex justify-between items-center text-zinc-400 border-b border-zinc-800/60 pb-1.5">
                <span className="flex items-center gap-1.5 text-zinc-300 font-bold">
                  <Shield size={12} className="text-[#00E5FF]" />
                  CITY GARAGE INVENTORY
                </span>
                <span className="text-zinc-500">DISPATCH READY</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 border border-zinc-800/60 bg-black/40 flex justify-between items-center">
                  <div>
                    <span className="text-[8px] text-zinc-500 block">DIESEL GENSETS</span>
                    <span className="text-zinc-300 font-bold">POWER SEC</span>
                  </div>
                  <strong className="text-sm text-zinc-100 font-bold">{inventory.generator.available}/{inventory.generator.max}</strong>
                </div>

                <div className="p-2 border border-zinc-800/60 bg-black/40 flex justify-between items-center">
                  <div>
                    <span className="text-[8px] text-zinc-500 block">WATER BOWSERS</span>
                    <span className="text-zinc-300 font-bold">WATER SEC</span>
                  </div>
                  <strong className="text-sm text-zinc-100 font-bold">{inventory.waterTanker.available}/{inventory.waterTanker.max}</strong>
                </div>

                <div className="p-2 border border-zinc-800/60 bg-black/40 flex justify-between items-center">
                  <div>
                    <span className="text-[8px] text-zinc-500 block">SAT RELAYS</span>
                    <span className="text-zinc-300 font-bold">COMMS SEC</span>
                  </div>
                  <strong className="text-sm text-zinc-100 font-bold">{inventory.commsSat.available}/{inventory.commsSat.max}</strong>
                </div>

                <div className="p-2 border border-zinc-800/60 bg-black/40 flex justify-between items-center">
                  <div>
                    <span className="text-[8px] text-zinc-500 block">MED SQUADS</span>
                    <span className="text-zinc-300 font-bold">HEALTH SEC</span>
                  </div>
                  <strong className="text-sm text-zinc-100 font-bold">{inventory.medUnit.available}/{inventory.medUnit.max}</strong>
                </div>
              </div>
            </section>

            {/* ── Block 3: Disaster Presets Triggers ── */}
            <section className="p-3 border border-zinc-800/80 bg-[#09090b]/80 space-y-2 rounded-none">
              <div className="flex justify-between items-center text-zinc-400 border-b border-zinc-800/60 pb-1.5">
                <span className="flex items-center gap-1.5 text-zinc-300 font-bold">
                  <Flame size={12} className="text-[#FF9900]" />
                  STRIKE PRESETS (CASCADE INJECTION)
                </span>
                <span className="text-zinc-500">6 SCENARIOS</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {DISASTER_PRESETS.map((preset) => {
                  const isActive = activePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset.id)}
                      className={`p-2 text-left border rounded-none transition-all ${
                        isActive
                          ? "border-[#FF0033] bg-[#FF0033]/15 text-rose-300 shadow-[0_0_8px_rgba(255,0,51,0.3)]"
                          : "border-zinc-800/80 bg-black/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                      }`}
                    >
                      <span className="text-[8px] text-zinc-500 block">{preset.code}</span>
                      <strong className="text-[10px] font-bold block truncate mt-0.5">{preset.label}</strong>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── Block 4: Scenario Import / Export IO ── */}
            <section className="p-2.5 border border-zinc-800/80 bg-[#09090b]/80 flex gap-2 rounded-none">
              <button
                onClick={handleExportJSON}
                className="flex-1 py-1.5 px-2 border border-zinc-800 bg-black text-zinc-400 hover:text-white hover:border-zinc-600 rounded-none flex items-center justify-center gap-1.5 transition-all"
              >
                <Download size={11} />
                <span>EXPORT .JSON</span>
              </button>

              <label className="flex-1 py-1.5 px-2 border border-zinc-800 bg-black text-zinc-400 hover:text-white hover:border-zinc-600 rounded-none flex items-center justify-center gap-1.5 cursor-pointer transition-all">
                <Upload size={11} />
                <span>LOAD .JSON</span>
                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
              </label>
            </section>

          </div>

          {/* Left Footer System Readout */}
          <footer className="p-3 border-t border-zinc-800 bg-black/90 flex justify-between items-center text-[9px] text-zinc-600">
            <span>GRID NODES: {nodes.length}</span>
            <span className="text-[#00FF66]">STABILITY: {stabilityIndex}%</span>
          </footer>
        </aside>

        {/* ── Center Stage: Map Layer with Cinematic Vignette & Scanlines ── */}
        <div className="flex-1 h-full relative overflow-hidden bg-[#050505]">
          
          {/* Real-Time Live City Map (MapLibre + Framer Motion Markers) */}
          <LiveCityMap
            selectedNodeId={selectedNodeId}
            onNodeClick={(id) => {
              setSelectedEdgeId(null);
              setSelectedNodeId(id);
            }}
            onEdgeClick={(id) => {
              setSelectedNodeId(null);
              setSelectedEdgeId(id);
            }}
          />

          {/* Vignette Overlay (Blends edges into sidebars) */}
          <div className="hud-vignette absolute inset-0 pointer-events-none z-10" />

          {/* Scanline CRT Monitor Overlay */}
          <div className="hud-scanlines absolute inset-0 pointer-events-none z-10 opacity-35" />

          {/* Tactical Crosshair Watermarks */}
          <div className="absolute top-4 left-4 pointer-events-none text-zinc-700 font-mono text-[9px] z-20">
            <span>LAT 21.1458° N // LNG 79.0882° E</span>
          </div>

          {/* ── Right Action Panel (Context Drawer via Framer Motion) ── */}
          <AnimatePresence mode="wait">
            {selectedNodeId && (
              <ContextPanel
                selectedNodeId={selectedNodeId}
                onClose={() => setSelectedNodeId(null)}
              />
            )}
          </AnimatePresence>
        </div>

      </section>
    </main>
  );
}
