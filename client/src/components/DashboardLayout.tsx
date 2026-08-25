import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { 
  useSimulationStore, 
  DISASTER_PRESETS,
  exportAfterActionReport,
  loadScenarioFromJSON,
  type HistoryLogItem
} from "@/lib/simulationStore";
import LiveCityMap from "./LiveCityMap";
import ContextPanel from "./ContextPanel";
import { getEtherscanLink, logInterventionOnChain, type TxStatus } from "@/lib/web3Service";
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
  ChevronDown,
  History,
  Coins,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
  Loader2
} from "lucide-react";


export default function DashboardLayout() {
  const nodes = useSimulationStore((state) => state.nodes);
  const edges = useSimulationStore((state) => state.edges);
  const activePresetId = useSimulationStore((state) => state.activePresetId);
  const history = useSimulationStore((state) => state.history);
  const updateHistoryTxHash = useSimulationStore((state) => state.updateHistoryTxHash);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<TxStatus>("idle");
  const [verifyError, setVerifyError] = useState<{ id: string; msg: string } | null>(null);

  const handleVerifyPayment = async (item: HistoryLogItem) => {
    setVerifyingId(item.id);
    setVerifyError(null);
    const res = await logInterventionOnChain(
      {
        nodeId: item.nodeId,
        assetId: item.assetId,
        sector: item.sector,
        actionType: "SOLUTION",
        title: item.title,
        cost: item.cost,
      },
      (status) => setVerifyStatus(status)
    );

    if (res.status === "confirmed" && res.txHash) {
      updateHistoryTxHash(item.id, res.txHash, "confirmed");
    } else if (res.error) {
      setVerifyError({ id: item.id, msg: res.error });
    }
    setVerifyingId(null);
    setVerifyStatus("idle");
  };

  const totalPeopleAffected = useSimulationStore((state) => state.totalPeopleAffected);
  const totalFinancialLoss = useSimulationStore((state) => state.totalFinancialLoss);
  const cascadeDepth = useSimulationStore((state) => state.cascadeDepth);
  const peakFailedCount = useSimulationStore((state) => state.peakFailedCount);
  const totalSpentOnRemedies = history.reduce((sum, item) => sum + item.cost, 0);
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
      <header className="h-18 bg-[#0d1117] flex items-center justify-between px-6 z-40 text-[#8b949e] font-sans text-l tracking-wide" style={{ boxShadow: '0 4px 10px #040609, 0 -2px 4px #161b22' }}>
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2 text-[#ffffff] font-extrabold text-sm tracking-wide">
            <Crosshair size={30} className="text-[#58a6ff]" />
            <span>Pralayaant</span>
          </div>
          <span className="text-[#21262d]">|</span>
          <div className="flex items-center gap-2 text-[#8b949e] font-bold text-xs">
            <span className="h-2 w-1 rounded-full bg-[#3fb950] animate-ping" />
            <span>Nagpur Grid Sector</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Traffic / Gridlock Status */}
          

          <span className="text-[#21262d]">|</span>

          {/* Strike Presets Dropdown Menu */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsPresetsOpen(!isPresetsOpen)}
              className="px-3.5 py-1.5 flex items-center gap-2 transition-all rounded-xl font-extrabold text-xs bg-[#0d1117] text-[#ffffff] hover:text-[#ffffff]"
              style={{ boxShadow: '3px 3px 6px #040609, -3px -3px 6px #161b22' }}
            >
              <Flame size={14} className="text-[#d29925]" />
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
                  Analytics 
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
                  <span className="text-[11px] text-[#8b949e] font-extrabold block mb-1">Cascade Level</span>
                  <strong className="text-lg font-black text-[#ffffff] tracking-wider">
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
                  
                  <span className="text-base font-black text-[#f85149]">{peakFailedCount} Assets</span>
                </div>
              </div>
            </section>

            {/* ── Block 2: Operations & Solutions History ── */}
            <section className="p-5 bg-[#0d1117] space-y-4 rounded-2xl" style={{ boxShadow: '6px 6px 14px #040609, -6px -6px 14px #161b22' }}>
              <div className="flex justify-between items-center text-[#8b949e] pb-2.5" style={{ borderBottom: '1px solid #161b22' }}>
                <span className="flex items-center gap-2 text-[#ffffff] font-extrabold text-sm tracking-wide">
                  <History size={17} className="text-[#58a6ff]" />
                  Operations History
                </span>
                <span className="text-xs font-bold text-[#3fb950] px-2 py-0.5 rounded-full bg-[#0d1e13]">
                  {history.length} {history.length === 1 ? "Entry" : "Entries"}
                </span>
              </div>

              {/* Total Amount Spent Metric */}
              <div className="p-3.5 rounded-xl bg-[#0d1117] flex justify-between items-center" style={{ boxShadow: 'inset 4px 4px 8px #040609, inset -4px -4px 8px #161b22' }}>
                <div className="flex items-center gap-2 text-[#8b949e]">
                  <Coins size={15} className="text-[#d29922]" />
                  <span className="text-[11px] font-extrabold">Total Amount Spent</span>
                </div>
                <strong className="text-sm font-black text-[#3fb950]">
                  {totalSpentOnRemedies >= 100000 
                    ? `₹${(totalSpentOnRemedies / 100000).toFixed(2)} Lakhs` 
                    : `₹${totalSpentOnRemedies.toLocaleString("en-IN")}`}
                </strong>
              </div>

              {/* History Log Feed */}
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
                {history.length === 0 ? (
                  <div className="p-4 rounded-xl text-center border border-dashed border-[#21262d] bg-[#0d1117] space-y-1">
                    <span className="text-xs font-bold text-[#8b949e] block">No Operations Recorded</span>
                    <p className="text-[10px] text-[#484f58]">
                      Select an asset node on the map to trigger disruption or deploy solutions.
                    </p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-[#0d1117] space-y-2 text-xs transition-all border border-[#161b22]"
                      style={{ boxShadow: 'inset 2px 2px 4px #040609, inset -2px -2px 4px #161b22' }}
                    >
                      {/* Header Row: Node Label & Sector Badge */}
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className="text-xs font-black text-[#ffffff] truncate">
                            {item.nodeLabel}
                          </span>
                          <span className="text-[9px] font-extrabold text-[#58a6ff] bg-[#0e1a24] px-1.5 py-0.5 rounded border border-[#58a6ff]/20">
                            {item.assetId}
                          </span>
                        </div>

                        <span
                          className={`px-2 py-0.5 text-[9px] font-black rounded-full uppercase tracking-wider shrink-0 ${
                            item.actionType === "SOLUTION"
                              ? "bg-[#0d1e13] text-[#3fb950] border border-[#3fb950]/30"
                              : "bg-[#200f11] text-[#f85149] border border-[#f85149]/30"
                          }`}
                        >
                          {item.actionType === "SOLUTION" ? "Solution" : "Disruption"}
                        </span>
                      </div>

                      {/* Solution / Operation Title */}
                      <div className="flex items-center justify-between text-[#c9d1d9] font-extrabold text-[11px] pt-1">
                        <span className="flex items-center gap-1.5 text-[#e6edf3]">
                          {item.actionType === "SOLUTION" ? (
                            <CheckCircle2 size={13} className="text-[#3fb950]" />
                          ) : (
                            <Flame size={13} className="text-[#f85149]" />
                          )}
                          {item.title}
                        </span>
                        {item.bufferSeconds && (
                          <span className="text-[10px] text-[#d29922] font-bold">
                            +{item.bufferSeconds}s Buffer
                          </span>
                        )}
                      </div>

                      {/* Footer Row: Timestamp, Verification & Amount Spent */}
                      <div className="pt-2 border-t border-[#161b22] space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] text-[#8b949e] font-bold">
                          <div className="flex items-center gap-1">
                            <Clock size={11} className="text-[#8b949e]" />
                            <span>{item.timestamp}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[#8b949e] font-normal mr-1">Amount Spent:</span>
                            <strong className={item.cost > 0 ? "text-[#3fb950] font-black text-xs" : "text-[#8b949e]"}>
                              {item.cost > 0 ? `₹${item.cost.toLocaleString("en-IN")}` : "₹0"}
                            </strong>
                          </div>
                        </div>

                        {/* Blockchain Payment Verification — Only for Solution / Repairing Tasks */}
                        {item.actionType === "SOLUTION" && (
                          <div className="pt-1 flex items-center justify-between">
                            {item.txHash ? (
                              <a
                                href={getEtherscanLink(item.txHash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[9px] text-[#3fb950] bg-[#0d1e13] px-2 py-1 rounded-lg border border-[#3fb950]/30 hover:underline font-extrabold"
                              >
                                <ShieldCheck size={11} />
                                <span>Verified on Etherscan ({item.txHash.slice(0, 6)}...{item.txHash.slice(-4)})</span>
                                <ExternalLink size={9} />
                              </a>
                            ) : (
                              <button
                                onClick={() => handleVerifyPayment(item)}
                                disabled={verifyingId === item.id}
                                className="py-1 px-2.5 rounded-lg bg-[#0e1a24] border border-[#58a6ff]/30 text-[#58a6ff] hover:text-[#79c0ff] hover:border-[#58a6ff]/60 text-[10px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                              >
                                {verifyingId === item.id ? (
                                  <>
                                    <Loader2 size={11} className="animate-spin text-[#58a6ff]" />
                                    <span>
                                      {verifyStatus === "connecting" && "Connecting..."}
                                      {verifyStatus === "awaiting_signature" && "Approve in MetaMask..."}
                                      {verifyStatus === "mining" && "Confirming..."}
                                      {(verifyStatus === "idle" || verifyStatus === "confirmed" || verifyStatus === "error") && "Verifying..."}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck size={11} className="text-[#58a6ff]" />
                                    <span>Verify Payment on Chain</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}

                        {verifyError?.id === item.id && (
                          <p className="text-[9px] text-[#f85149] font-medium leading-tight pt-0.5">
                            {verifyError.msg}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* ── Pinned Scenario Import / Export IO (Silent & Elegant) ── */}
          <div className="p-3.5 border-t border-[#21262d] bg-[#0d1117] space-y-2">
            <span className="text-[9px] text-[#8b949e] font-bold uppercase tracking-wider block text-center opacity-60">Data Exchange</span>
            <div className="flex gap-2.5">
              <button
                onClick={handleExportJSON}
                className="flex-1 py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all bg-[#0d1117] border border-[#21262d] text-[#8b949e] hover:text-[#58a6ff] hover:border-[#30363d] text-xs font-extrabold active:scale-95 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.02)]"
              >
                <Download size={13} className="opacity-80" />
                <span>Export JSON</span>
              </button>

              <label
                className="flex-1 py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all bg-[#0d1117] border border-[#21262d] text-[#8b949e] hover:text-[#58a6ff] hover:border-[#30363d] text-xs font-extrabold active:scale-95 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.02)]"
              >
                <Upload size={13} className="opacity-80" />
                <span>Load JSON</span>
                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
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
