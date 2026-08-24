import React, { useState, useEffect, useRef } from "react";
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
  ChevronDown
} from "lucide-react";


export default function DashboardLayout() {
  const nodes = useSimulationStore((state) => state.nodes);
  const edges = useSimulationStore((state) => state.edges);
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
  const [isPresetsOpen, setIsPresetsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsPresetsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-[#0d1117] text-[#c9d1d9] font-sans select-none relative">
      
      {/* ── Top Bar (GitHub Dark Neumorphic Header) ── */}
      <header className="h-14 bg-[#0d1117] flex items-center justify-between px-6 z-40 text-[#8b949e] font-sans text-xs tracking-wide" style={{ boxShadow: '0 4px 10px #040609, 0 -2px 4px #161b22' }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[#ffffff] font-extrabold text-sm tracking-wide">
            <Crosshair size={16} className="text-[#58a6ff]" />
            <span>Urban Cascade Field // Live Metrics</span>
          </div>
          <span className="text-[#21262d]">|</span>
          <div className="flex items-center gap-2 text-[#8b949e] font-bold text-xs">
            <span className="h-2 w-2 rounded-full bg-[#3fb950] animate-ping" />
            <span>Nagpur Grid Sector 04</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Traffic / Gridlock Status */}
          {isGridlock ? (
            <div className="flex items-center gap-2 text-[#f85149] font-extrabold text-xs px-3.5 py-1.5 rounded-xl" style={{ boxShadow: 'inset 3px 3px 6px #080404, inset -3px -3px 6px #240c0c', background: '#1c0c0d' }}>
              <AlertTriangle size={13} className="animate-bounce" />
              <span>Gridlock Active (Transit ×{cityTrafficMultiplier})</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[#3fb950] font-extrabold text-xs">
              <Circle size={10} className="fill-[#3fb950]" />
              <span>System: Operational</span>
            </div>
          )}

          <span className="text-[#21262d]">|</span>

          {/* Strike Presets Dropdown Menu */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsPresetsOpen(!isPresetsOpen)}
              className="px-3.5 py-1.5 flex items-center gap-2 transition-all rounded-xl font-extrabold text-xs bg-[#0d1117] text-[#d29922] hover:text-[#ffffff]"
              style={{ boxShadow: '3px 3px 6px #040609, -3px -3px 6px #161b22' }}
            >
              <Flame size={14} className="text-[#d29922]" />
              <span>Strike Presets</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${isPresetsOpen ? "rotate-180" : ""}`} />
            </button>

            {isPresetsOpen && (
              <div 
                className="absolute right-0 mt-2 w-72 bg-[#0d1117] rounded-2xl p-3 z-50 space-y-2 border border-[#21262d]"
                style={{ boxShadow: '6px 6px 16px #040609, -6px -6px 16px #161b22' }}
              >
                <div className="text-[11px] font-extrabold text-[#8b949e] px-2 pb-2 border-b border-[#161b22] flex justify-between items-center">
                  <span>Disaster Scenarios</span>
                  <span className="text-[#58a6ff]">6 Presets</span>
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin">
                  {DISASTER_PRESETS.map((preset) => {
                    const isActive = activePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => {
                          applyPreset(preset.id);
                          setIsPresetsOpen(false);
                        }}
                        className={`w-full p-2.5 text-left rounded-xl transition-all flex items-center justify-between ${
                          isActive
                            ? "text-[#f85149] bg-[#1c0c0d]"
                            : "text-[#8b949e] hover:text-[#ffffff] hover:bg-[#161b22]"
                        }`}
                        style={isActive ? { boxShadow: 'inset 3px 3px 6px #080404, inset -3px -3px 6px #240c0c' } : {}}
                      >
                        <div>
                          <span className="text-[10px] text-[#58a6ff] font-extrabold block">{preset.code}</span>
                          <strong className="text-xs font-extrabold block text-[#ffffff]">{preset.label}</strong>
                        </div>
                        {isActive && <span className="text-[10px] font-black text-[#f85149]">Active</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <span className="text-[#21262d]">|</span>

          {/* Clock */}
          <div className="flex items-center gap-1.5 text-[#ffffff] font-extrabold text-xs">
            <Clock size={13} className="text-[#58a6ff]" />
            <span>{currentTime || "00:00:00 IST"}</span>
          </div>

          <span className="text-[#21262d]">|</span>

          {/* Master Sim Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isRunning)}
              className={`px-3.5 py-1.5 flex items-center gap-1.5 transition-all rounded-xl font-extrabold text-xs bg-[#0d1117] ${
                isRunning 
                  ? "text-[#58a6ff]" 
                  : "text-[#d29922]"
              }`}
              style={{ boxShadow: '3px 3px 6px #040609, -3px -3px 6px #161b22' }}
            >
              {isRunning ? <Pause size={12} /> : <Play size={12} />}
              <span>{isRunning ? "Pause" : "Resume"}</span>
            </button>
            <button
              onClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); reset(); }}
              className="px-3.5 py-1.5 text-[#8b949e] hover:text-[#ffffff] transition-all rounded-xl flex items-center gap-1.5 font-extrabold text-xs bg-[#0d1117]"
              style={{ boxShadow: '3px 3px 6px #040609, -3px -3px 6px #161b22' }}
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Command Center Stage ── */}
      <section className="flex flex-1 overflow-hidden relative">
        
        {/* ── Left Sidebar Panel ── */}
        <aside className="w-[440px] bg-[#0d1117] flex flex-col z-30 font-sans text-xs tracking-wide overflow-hidden" style={{ boxShadow: '6px 0 16px #040609' }}>
          
          <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
            
            {/* ── Block 1: Telemetry Scoreboard ── */}
            <section className="p-5 bg-[#0d1117] space-y-4 rounded-2xl" style={{ boxShadow: '6px 6px 14px #040609, -6px -6px 14px #161b22' }}>
              <div className="flex justify-between items-center text-[#8b949e] pb-2.5" style={{ borderBottom: '1px solid #161b22' }}>
                <span className="flex items-center gap-2 text-[#ffffff] font-extrabold text-sm tracking-wide">
                  <Activity size={17} className="text-[#3fb950]" />
                  Telemetry Scoreboard
                </span>
                <span className="text-xs font-bold text-[#58a6ff]">Live Feed</span>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="p-4 rounded-xl bg-[#0d1117]" style={{ boxShadow: 'inset 4px 4px 8px #040609, inset -4px -4px 8px #161b22' }}>
                  <span className="text-[11px] text-[#8b949e] font-extrabold block mb-1">People at Risk</span>
                  <strong className="text-lg font-black text-[#ffffff] tracking-wider">
                    {totalPeopleAffected.toLocaleString()}
                  </strong>
                </div>
                <div className="p-4 rounded-xl bg-[#0d1117]" style={{ boxShadow: 'inset 4px 4px 8px #040609, inset -4px -4px 8px #161b22' }}>
                  <span className="text-[11px] text-[#8b949e] font-extrabold block mb-1">Cascade Depth</span>
                  <strong className="text-lg font-black text-[#d29922] tracking-wider">
                    Level {cascadeDepth}
                  </strong>
                </div>
              </div>

              {/* Economic Loss Ticker */}
              <div className="p-4 rounded-xl flex justify-between items-center" style={{ boxShadow: 'inset 4px 4px 8px #080404, inset -4px -4px 8px #240c0c', background: '#1c0c0d' }}>
                <div>
                  <span className="text-[11px] text-[#ff7675] font-extrabold block">Total Economic Loss</span>
                  <strong className="text-xl font-black text-[#f85149] tracking-tight">
                    ₹{(totalFinancialLoss / 100000).toFixed(2)} Lakhs
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-[#8b949e] font-bold block">Peak Failures</span>
                  <span className="text-base font-black text-[#f85149]">{peakFailedCount} Assets</span>
                </div>
              </div>
            </section>

            {/* ── Block 2: Scenario Import / Export IO ── */}
            <section className="p-4 bg-[#0d1117] flex gap-3 rounded-2xl" style={{ boxShadow: '6px 6px 14px #040609, -6px -6px 14px #161b22' }}>
              <button
                onClick={handleExportJSON}
                className="flex-1 py-3 px-3 text-[#ffffff] hover:text-[#58a6ff] rounded-xl flex items-center justify-center gap-2 transition-all bg-[#0d1117] text-sm font-extrabold"
                style={{ boxShadow: '3px 3px 6px #040609, -3px -3px 6px #161b22' }}
              >
                <Download size={15} className="text-[#3fb950]" />
                <span>Export .JSON</span>
              </button>

              <label className="flex-1 py-3 px-3 text-[#ffffff] hover:text-[#58a6ff] rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all bg-[#0d1117] text-sm font-extrabold" style={{ boxShadow: '3px 3px 6px #040609, -3px -3px 6px #161b22' }}>
                <Upload size={15} className="text-[#58a6ff]" />
                <span>Load .JSON</span>
                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
              </label>
            </section>

          </div>

          {/* Left Footer System Readout */}
          <footer className="p-4 bg-[#0d1117] flex justify-between items-center text-xs font-extrabold text-[#8b949e]" style={{ boxShadow: 'inset 4px 4px 8px #040609, inset -4px -4px 8px #161b22' }}>
            <span>Grid Nodes: {nodes.length}</span>
            <span className="text-[#3fb950] font-black">Stability: {stabilityIndex}%</span>
          </footer>
        </aside>

        {/* ── Center Stage: Map Layer ── */}
        <div className="flex-1 h-full relative overflow-hidden bg-[#0d1117]">
          
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

          {/* Coordinate Watermarks */}
          <div className="absolute top-4 left-4 pointer-events-none text-[#484f58] font-mono text-[9px] z-20 px-3 py-1.5 rounded-xl bg-[#0d1117]" style={{ boxShadow: '3px 3px 6px #040609, -3px -3px 6px #161b22' }}>
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
