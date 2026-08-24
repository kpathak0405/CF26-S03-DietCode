/**
 * Pralayaant v2 — Clinical Cascade Field
 * ───────────────────────────────────────
 * Black-and-charcoal control field with:
 * - Resource inventory HUD (City Garage)
 * - Dual-timer deployment race visualization
 * - AI Triage Predictor (what-if engine)
 * - Sector-specific costed interventions with deployment delays
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import "./intervention.css";
import {
  AlertTriangle, ArrowRight, Battery, BrainCircuit, Bomb, Cable, Calculator,
  Check, ChevronRight, CircleDot, Clock3, Droplets, Link2Off, Network,
  Radio, RefreshCcw, Route, Truck, Unplug, Users, Wrench, X, Zap,
} from "lucide-react";
import LiveCityMap from "@/components/LiveCityMap";
import {
  DISASTER_PRESETS,
  getDownstreamNodeIds,
  getNodeOutDegree,
  getRemediesForNode,
  getResourceForNode,
  getRescueTimeForNode,
  getStatusLabel,
  simulateOutcome,
  type CityInventory,
  type DependencyEdge as SimulationEdge,
  type InfrastructureNode as SimulationNode,
  type NodeStatus,
  type ResourceType,
  type TriagePrediction,
  POPULATION_WEIGHT,
  useSimulationStore,
} from "@/lib/simulationStore";


const statusDetail: Record<NodeStatus, { eyebrow: string; copy: string }> = {
  operational: { eyebrow: "Nominal asset", copy: "This dependency is available and has no active local intervention." },
  buffering: { eyebrow: "Backup consumption", copy: "An upstream asset or dependency path is unavailable. Choose a sector-specific intervention before the reserve expires." },
  repairing: { eyebrow: "Deployment in progress", copy: "An emergency crew is en route. The backup battery is draining while the rescue team approaches — will they arrive in time?" },
  failed: { eyebrow: "Unavailable asset", copy: "This asset is offline. Apply an asset-specific intervention to restore it or establish temporary service." },
  recovered: { eyebrow: "Local mitigation applied", copy: "A selected intervention has restored this asset while the upstream disruption remains isolated." },
};

const formatDuration = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const formatCost = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const formatPopulation = (value: number) => value >= 1000 ? `${Math.round(value / 1000)}K` : String(value);



/** Icon per resource type for the inventory HUD */
const resourceIcon: Record<ResourceType, typeof Zap> = {
  generator: Zap,
  waterTanker: Droplets,
  commsSat: Radio,
  medUnit: Users,
  crewTeam: Truck,
};

export default function Home() {
  const nodes = useSimulationStore((state) => state.nodes);
  const edges = useSimulationStore((state) => state.edges);
  const inventory = useSimulationStore((state) => state.inventory);
  const selectedRemedies = useSimulationStore((state) => state.selectedRemedies);
  const blastNode = useSimulationStore((state) => state.blastNode);
  const applyRemedy = useSimulationStore((state) => state.applyRemedy);
  const breakEdge = useSimulationStore((state) => state.breakEdge);
  const repairEdge = useSimulationStore((state) => state.repairEdge);
  const applyPreset = useSimulationStore((state) => state.applyPreset);
  const reset = useSimulationStore((state) => state.reset);
  const tick = useSimulationStore((state) => state.tick);
  const activePresetId = useSimulationStore((state) => state.activePresetId);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [impactNodeId, setImpactNodeId] = useState<string | null>(null);
  const [isEstimatorOpen, setEstimatorOpen] = useState(false);
  const [triagePrediction, setTriagePrediction] = useState<TriagePrediction | null>(null);
  const [isTriageLoading, setTriageLoading] = useState(false);

  // Gamification States
  const [elapsedTime, setElapsedTime] = useState(0);
  const [hasStartedChallenge, setStartedChallenge] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [tick]);


  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const impactNode = nodes.find((node) => node.id === impactNodeId) ?? null;
  const failedNodes = nodes.filter((node) => node.status === "failed");
  const repairingNodes = nodes.filter((node) => node.status === "repairing");
  const brokenEdges = edges.filter((edge) => edge.status === "broken");
  const activeIncidents = failedNodes.length + brokenEdges.length;
  const healthyEdgeCount = edges.filter((edge) => edge.status === "operational").length;
  const activePreset = DISASTER_PRESETS.find((preset) => preset.id === activePresetId) ?? null;
  const selectedCost = selectedRemedies.reduce((total, remedy) => total + remedy.cost, 0);
  const nodeRemedies = selectedNode ? getRemediesForNode(selectedNode.id) : [];
  const totalInventory = Object.values(inventory).reduce((sum, slot) => sum + slot.available, 0);
  const maxInventory = Object.values(inventory).reduce((sum, slot) => sum + slot.max, 0);

  // Gamification Calculations
  const stabilityIndex = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (nodes.filter((n) => n.status === "operational" || n.status === "recovered").length / nodes.length) * 100
      )
    )
  );

  const remainingBudget = 1500000 - selectedCost;

  const totalPopulation = Object.values(POPULATION_WEIGHT).reduce((a, b) => a + b, 0);
  const securedPopulation = nodes
    .filter((n) => n.status === "operational" || n.status === "recovered")
    .reduce((acc, n) => acc + POPULATION_WEIGHT[n.id], 0);

  const gameScore = Math.max(0, Math.round(stabilityIndex * 150 - selectedCost / 2000 - elapsedTime * 3));

  const getGameRank = () => {
    if (stabilityIndex >= 90 && selectedCost <= 500000 && elapsedTime < 45) return { label: "S-Rank (Elite)", color: "#10B981" };
    if (stabilityIndex >= 75 && selectedCost <= 800000 && elapsedTime < 90) return { label: "A-Rank (Expert)", color: "#3B82F6" };
    if (stabilityIndex >= 50 && selectedCost <= 1200000) return { label: "B-Rank (Capable)", color: "#F59E0B" };
    return { label: "C-Rank (Disrupted)", color: "#EF4444" };
  };
  const rank = getGameRank();

  // Challenge Start Trigger
  useEffect(() => {
    if (activeIncidents > 0 && !hasStartedChallenge) {
      setStartedChallenge(true);
      setElapsedTime(0);
    }
  }, [activeIncidents, hasStartedChallenge]);

  // Challenge Timer
  useEffect(() => {
    let timerInterval: number;
    if (activeIncidents > 0 && hasStartedChallenge) {
      timerInterval = window.setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timerInterval);
  }, [activeIncidents, hasStartedChallenge]);

  // Game Victory/Defeat Checks
  const isCompleted = hasStartedChallenge && activeIncidents === 0 && repairingNodes.length === 0 && stabilityIndex === 100;
  const isLost = hasStartedChallenge && (stabilityIndex === 0 || nodes.find((n) => n.id === "hospital-icu")?.status === "failed");




  const impactedAssets = useMemo(() => {
    if (!impactNode) return [];
    const downstream = new Set(getDownstreamNodeIds(impactNode.id));
    return nodes.filter((node) => downstream.has(node.id) && (node.status === "buffering" || node.status === "failed" || node.status === "recovered" || node.status === "repairing"));
  }, [impactNode, nodes]);

  const onNodeClick = (clickedNodeId: string) => {
    setSelectedEdgeId(null); setImpactNodeId(null); setSelectedNodeId(clickedNodeId);
    setTriagePrediction(null); setTriageLoading(false);
  };
  const closeAllContexts = () => {
    setSelectedNodeId(null); setSelectedEdgeId(null); setImpactNodeId(null);
    setTriagePrediction(null); setTriageLoading(false);
  };
  const openImpact = (nodeId: string) => {
    setSelectedNodeId(null); setSelectedEdgeId(null); setImpactNodeId(nodeId);
    setTriagePrediction(null);
  };

  /** Run the AI triage prediction for the selected node */
  const runTriage = useCallback(() => {
    if (!selectedNode) return;
    setTriageLoading(true);
    // Run asynchronously so UI shows loading state
    requestAnimationFrame(() => {
      const prediction = simulateOutcome(selectedNode.id, nodes, edges);
      setTriagePrediction(prediction);
      setTriageLoading(false);
    });
  }, [selectedNode, nodes, edges]);

  /** Check if a restore remedy has available inventory */
  const getRemedyStock = (nodeId: string): { resourceType: ResourceType | null; available: number } => {
    const resourceType = getResourceForNode(nodeId);
    if (!resourceType) return { resourceType: null, available: 0 };
    return { resourceType, available: inventory[resourceType].available };
  };

  return (
    <main className="simulator-shell">
      <header className="simulator-header">
        <div className="brand-block"><img className="brand-mark" src="/manus-storage/urban-cascade-mark_e0d5502c.png" alt="Urban cascade simulation mark" /><div><p className="section-kicker">Municipal Systems · Nagpur Grid</p><h1>Cascade Field <span>/ Urban Infrastructure</span></h1></div></div>
        <div className="header-meta">
          <div className={`status-readout ${activeIncidents ? "status-alert" : ""}`}><span className="readout-led" /> {activeIncidents ? `${activeIncidents} active incident${activeIncidents === 1 ? "" : "s"}` : "Simulation ready"}</div>
          <span className="header-divider" />
          <div className="game-telemetry stability-hud">
            <span>STABILITY</span>
            <strong className={stabilityIndex < 50 ? "text-danger" : stabilityIndex < 85 ? "text-warning" : "text-success"}>
              {stabilityIndex}%
            </strong>
          </div>
          <span className="header-divider" />
          <div className="game-telemetry budget-hud">
            <span>BUDGET LEFT</span>
            <strong className={remainingBudget < 200000 ? "text-danger" : remainingBudget < 600000 ? "text-warning" : "text-success"}>
              {formatCost(remainingBudget)}
            </strong>
          </div>
          <span className="header-divider" />
          <div className="game-telemetry score-hud">
            <span>SCORE</span>
            <strong className="score-glow">{gameScore}</strong>
          </div>
          <span className="header-divider" />
          <div className="game-telemetry time-hud">
            <span>TIME</span>
            <strong>{formatDuration(elapsedTime)}</strong>
          </div>
          <span className="header-divider" />
          <div className="game-telemetry rank-hud">
            <span>RANK</span>
            <strong style={{ color: rank.color }}>{rank.label}</strong>
          </div>
        </div>
      </header>

      <section className="simulation-workspace" aria-label="Urban infrastructure dependency canvas">
        <aside className={`incident-rail ${activeIncidents ? "has-incidents" : ""}`} aria-label="Live incident alerts and field controls">
          <div className="rail-scenario-stamp"><i /><p>{activePreset ? "ACTIVE PRESET" : "LIVE FIELD"}<br />{activePreset?.label ?? "STATUS"}</p></div>

          {/* ── Inventory HUD (City Garage) ──────────────────────────────── */}
          <div className="inventory-hud" aria-label="City resource inventory">
            <div className="inventory-hud-title">
              <span>City Garage</span>
              <small>{totalInventory}/{maxInventory} AVAIL</small>
            </div>
            <div className="inventory-grid">
              {(Object.entries(inventory) as [ResourceType, CityInventory[ResourceType]][]).map(([type, slot]) => {
                const Icon = resourceIcon[type];
                return (
                  <div className={`inventory-slot ${slot.available === 0 ? "is-depleted" : ""}`} key={type}>
                    <Icon size={14} strokeWidth={2.2} />
                    <div className="inventory-slot-info">
                      <span className="inventory-slot-label">{slot.label}</span>
                      <span className="inventory-slot-count">{slot.available}/{slot.max}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="incident-rack-title"><div className="incident-heading"><AlertTriangle size={16} /><span>Live incident alerts</span></div><p>{activeIncidents ? "Select an event to inspect its impact." : "No asset or route failures in this scenario."}</p></div>

          <div className="preset-block" aria-label="Named disaster scenario presets"><div className="preset-title"><span>Disaster presets</span><small>APPLY SCENARIO</small></div><div className="preset-grid">{DISASTER_PRESETS.map((preset) => <button className={`preset-button ${activePresetId === preset.id ? "is-active" : ""}`} type="button" key={preset.id} onClick={() => { closeAllContexts(); setEstimatorOpen(false); applyPreset(preset.id); }}><span>{preset.code}</span><strong>{preset.label}</strong><small>{preset.effect}</small></button>)}</div></div>

          <div className="incident-list">
            {!activeIncidents && !repairingNodes.length && <div className="incident-empty"><CircleDot size={14} /> Field stable — select a node or dependency path to trigger a disruption.</div>}
            {failedNodes.map((node) => {
              const impactCount = nodes.filter((candidate) => getDownstreamNodeIds(node.id).includes(candidate.id) && candidate.status !== "operational").length;
              return (
                <button className="incident-card incident-node-card" type="button" key={node.id} onClick={() => openImpact(node.id)}>
                  <span className="incident-type">Asset failed</span>
                  <strong>{node.label}</strong>
                  <small>{node.assetId} · {impactCount} responding</small>
                  <ChevronRight size={17} />
                </button>
              );
            })}
            {repairingNodes.map((node) => (
              <button className="incident-card" style={{ borderLeftColor: "#3B82F6", background: "#0C1A2E" }} type="button" key={`repair-${node.id}`} onClick={() => { setSelectedEdgeId(null); setImpactNodeId(null); setSelectedNodeId(node.id); setTriagePrediction(null); }}>
                <span className="incident-type" style={{ color: "#60A5FA" }}>Deploying</span>
                <strong>{node.label}</strong>
                <small>{node.assetId} · ETA {formatDuration(node.rescueTimer)}</small>
                <ChevronRight size={17} />
              </button>
            ))}
            {brokenEdges.map((edge) => {
              const source = nodes.find((node) => node.id === edge.source);
              const target = nodes.find((node) => node.id === edge.target);
              return (
                <button className="incident-card incident-edge-card" type="button" key={edge.id} onClick={() => { setSelectedNodeId(null); setImpactNodeId(null); setSelectedEdgeId(edge.id); }}>
                  <span className="incident-type">Path ruptured</span>
                  <strong>{source?.label} <ArrowRight size={13} /> {target?.label}</strong>
                  <small>{edge.label} · inspect route</small>
                  <ChevronRight size={17} />
                </button>
              );
            })}
          </div>

          <button className="cost-estimate-trigger" type="button" onClick={() => { closeAllContexts(); setEstimatorOpen(true); }}><Calculator size={16} /><span><small>REMEDY COST ESTIMATE</small><strong>{selectedRemedies.length ? formatCost(selectedCost) : "Open estimator"}</strong></span><ChevronRight size={15} /></button>
          <div className="incident-integrity"><span>ROUTE INTEGRITY</span><strong>{healthyEdgeCount}/{edges.length}</strong><small>PATHWAYS INTACT</small></div>
          <button className="incident-reset" onClick={reset} type="button"><RefreshCcw size={15} /> Reset scenario</button>
        </aside>

        <div className="canvas-frame">
          <div className="canvas-topbar">
            <div className="canvas-label"><Route size={15} /> Real-Time GIS Dependency Field</div>
            <div className="state-key" aria-label="Node state legend">
              <span><i className="key-neutral" /> Operational</span>
              <span><i className="key-buffer" /> Buffering</span>
              <span><i className="key-deploying" /> Deploying</span>
              <span><i className="key-failed" /> Failed</span>
              <span><i className="key-recovered" /> Recovered</span>
            </div>
          </div>
          
          <LiveCityMap 
            onNodeClick={(id) => { setSelectedEdgeId(null); setImpactNodeId(null); setSelectedNodeId(id); }}
            onEdgeClick={(id) => { setSelectedNodeId(null); setImpactNodeId(null); setSelectedEdgeId(id); }}
          />

          {/* Victory / Defeat Overlay Screen */}
          {isCompleted && (
            <div className="game-overlay-banner victory-banner">
              <div className="banner-content animate-banner-slide">
                <div className="banner-title">MUNICIPAL GRID SECURED</div>
                <p className="banner-subtitle">Disaster cascade resolved successfully. All systems nominal.</p>
                
                <div className="game-stats-grid">
                  <div className="game-stat-card">
                    <span>FINAL SCORE</span>
                    <strong className="score-glow">{gameScore}</strong>
                  </div>
                  <div className="game-stat-card">
                    <span>RESPONSE RANK</span>
                    <strong style={{ color: rank.color }}>{rank.label}</strong>
                  </div>
                  <div className="game-stat-card">
                    <span>TIME ELAPSED</span>
                    <strong>{formatDuration(elapsedTime)}</strong>
                  </div>
                  <div className="game-stat-card">
                    <span>REMEDY EXPENSE</span>
                    <strong>{formatCost(selectedCost)}</strong>
                  </div>
                </div>
                
                <button className="banner-dismiss-btn" onClick={() => { setStartedChallenge(false); reset(); }}>
                  <RefreshCcw size={14} style={{ display: "inline", marginRight: 4 }} /> Reset & Play Again
                </button>
              </div>
            </div>
          )}

          {isLost && (
            <div className="game-overlay-banner defeat-banner">
              <div className="banner-content animate-banner-slide">
                <div className="banner-title">CRITICAL SYSTEM COLLAPSE</div>
                <p className="banner-subtitle">
                  {nodes.find(n => n.id === "hospital-icu")?.status === "failed" 
                    ? "Critical Failure: GMCH Hospital ICU power reserve depleted." 
                    : "Total Grid Loss: All municipal systems disrupted."}
                </p>
                
                <div className="game-stats-grid">
                  <div className="game-stat-card">
                    <span>STABILITY INDEX</span>
                    <strong style={{ color: "#EF4444" }}>{stabilityIndex}%</strong>
                  </div>
                  <div className="game-stat-card">
                    <span>SURVIVED FOR</span>
                    <strong>{formatDuration(elapsedTime)}</strong>
                  </div>
                  <div className="game-stat-card">
                    <span>SPENT IN VAIN</span>
                    <strong>{formatCost(selectedCost)}</strong>
                  </div>
                </div>
                
                <button className="banner-dismiss-btn retry" onClick={() => { setStartedChallenge(false); reset(); }}>
                  <RefreshCcw size={14} style={{ display: "inline", marginRight: 4 }} /> Retry Scenario
                </button>
              </div>
            </div>
          )}

          <div className="field-readout-deck" aria-label="Field context">
            <div><span>Asset field</span><strong>{String(nodes.length).padStart(2, "0")} live assets</strong></div>
            <div><span>Route integrity</span><strong>{healthyEdgeCount}/{edges.length} pathways</strong></div>
            <div><span>Interventions</span><strong>{selectedRemedies.length} costed actions</strong></div>
            <div><span>Resources</span><strong>{totalInventory}/{maxInventory} available</strong></div>
          </div>
          <div className="canvas-caption">Nagpur Municipal Base Layer · Live GeoJSON Feed</div>
        </div>
      </section>

      {/* ── Node Context Modal ─────────────────────────────────────────── */}
      {selectedNode && (
        <div className="context-overlay" role="presentation" onMouseDown={closeAllContexts}>
          <section className="node-context-modal" role="dialog" aria-modal="true" aria-labelledby="node-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="Close node context" onClick={closeAllContexts}><X size={18} /></button>

            <div className={`modal-status-line modal-${selectedNode.status}`}>
              <span>{statusDetail[selectedNode.status].eyebrow}</span>
              <span>{getStatusLabel(selectedNode.status)}</span>
            </div>

            <div className="modal-heading">
              <div>
                <p className="section-kicker">{selectedNode.sector} / {selectedNode.assetId}</p>
                <h2 id="node-modal-title">{selectedNode.label}</h2>
              </div>
              {selectedNode.status === "buffering" && (
                <div className="buffer-countdown"><Clock3 size={16} /> {formatDuration(selectedNode.buffer)}</div>
              )}
              {selectedNode.status === "repairing" && (
                <div className="rescue-countdown"><Truck size={16} /> {formatDuration(selectedNode.rescueTimer)}</div>
              )}
            </div>

            <p className="modal-copy">{statusDetail[selectedNode.status].copy}</p>

            {/* ── Data Grid ─────────────────────────────────────────────── */}
            <div className="modal-data-grid">
              <div><span>DEPENDENTS</span><strong>{getNodeOutDegree(selectedNode.id)}</strong></div>
              <div><span>STATE</span><strong>{getStatusLabel(selectedNode.status)}</strong></div>
              <div><span>SECTOR</span><strong>{selectedNode.sector}</strong></div>
            </div>

            {/* ── Repairing: show dual timer race status ─────────────────── */}
            {selectedNode.status === "repairing" && (
              <div className="modal-action-group">
                <p className="action-heading" style={{ color: "#60A5FA", display: "flex", alignItems: "center", gap: 6 }}><Truck size={14} /> deployment race in progress</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                  <div style={{ padding: "10px 12px", border: "1px solid #A16207", background: "#211806" }}>
                    <span style={{ color: "#8E8E96", font: '500 8px/1 "IBM Plex Mono",monospace', letterSpacing: ".08em", textTransform: "uppercase" as const }}>BACKUP REMAINING</span>
                    <strong style={{ display: "block", marginTop: 5, color: "#FBBF24", font: '600 18px/1 "Space Grotesk",sans-serif', letterSpacing: "-.04em" }}>{formatDuration(selectedNode.buffer)}</strong>
                  </div>
                  <div style={{ padding: "10px 12px", border: "1px solid #1E3A5F", background: "#0C1A2E" }}>
                    <span style={{ color: "#8E8E96", font: '500 8px/1 "IBM Plex Mono",monospace', letterSpacing: ".08em", textTransform: "uppercase" as const }}>RESCUE ETA</span>
                    <strong style={{ display: "block", marginTop: 5, color: "#60A5FA", font: '600 18px/1 "Space Grotesk",sans-serif', letterSpacing: "-.04em" }}>{formatDuration(selectedNode.rescueTimer)}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* ── Blast trigger ──────────────────────────────────────────── */}
            {getNodeOutDegree(selectedNode.id) > 0 && (
              <div className="modal-action-group fail-group">
                <p className="action-heading">Root disruption trigger</p>
                <button className="modal-action action-fail" type="button" disabled={selectedNode.status === "failed" || selectedNode.status === "repairing"} onClick={() => blastNode(selectedNode.id)}>
                  <Bomb size={17} />{selectedNode.status === "failed" ? "Node already failed" : selectedNode.status === "repairing" ? "Deployment in progress" : "BLAST / FAIL THIS NODE"}
                </button>
              </div>
            )}

            {/* ── Intervention options (with inventory awareness) ─────────── */}
            {(selectedNode.status === "buffering" || selectedNode.status === "failed") && (
              <div className="modal-action-group mitigation-group">
                <p className="action-heading"><Wrench size={14} /> {selectedNode.sector.toLowerCase()} intervention options</p>
                {nodeRemedies.map((remedy) => {
                  const stock = getRemedyStock(selectedNode.id);
                  const isRestore = remedy.effect === "restore";
                  const isDepleted = isRestore && stock.available <= 0;
                  const rescueEta = isRestore ? getRescueTimeForNode(selectedNode.id) : 0;
                  const isAffordable = remedy.cost <= remainingBudget;
                  const isDisabled = isDepleted || !isAffordable;

                  return (
                    <button
                      className={`remedy-row ${isRestore ? "remedy-restore" : "remedy-buffer"} ${isDepleted ? "remedy-depleted" : ""} ${!isAffordable ? "remedy-unaffordable" : ""}`}
                      type="button"
                      key={remedy.id}
                      disabled={isDisabled}
                      onClick={() => applyRemedy(selectedNode.id, remedy.id)}
                    >
                      <span>
                        <Wrench size={16} />
                        {remedy.label}
                        {isRestore && <span className="rescue-eta"><Truck size={9} /> ETA {rescueEta}s</span>}
                        {isRestore && (
                          <span className={`resource-badge ${stock.available > 0 ? "has-stock" : "no-stock"}`}>
                            <Battery size={9} /> {stock.available}/{inventory[stock.resourceType!].max}
                          </span>
                        )}
                        {!isAffordable && <span className="unaffordable-badge">OVER BUDGET</span>}
                      </span>
                      <b>{formatCost(remedy.cost)}</b>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── AI Triage Predictor ────────────────────────────────────── */}
            {(selectedNode.status === "buffering" || selectedNode.status === "failed") && nodeRemedies.some((r) => r.effect === "restore") && (
              <div className="triage-predictor">
                <div className="triage-header"><BrainCircuit size={14} /> AI Triage Predictor</div>
                {!triagePrediction && !isTriageLoading && (
                  <button className="triage-run-btn" type="button" onClick={runTriage}>
                    <BrainCircuit size={14} /> Predict deployment outcome
                  </button>
                )}
                {isTriageLoading && (
                  <div className="triage-loading"><BrainCircuit size={14} /> Computing cascade outcomes…</div>
                )}
                {triagePrediction && (
                  <div>
                    <p className="triage-body">
                      If you deploy here: <strong>{triagePrediction.savedCount}</strong> downstream node{triagePrediction.savedCount !== 1 ? "s" : ""} will be saved,
                      but <strong>{triagePrediction.lostCount}</strong> will fail elsewhere.
                    </p>
                    <div className="triage-stats">
                      <div className="triage-stat">
                        <span className="triage-stat-label">Nodes Saved</span>
                        <span className="triage-stat-value stat-saved">{triagePrediction.savedCount}</span>
                      </div>
                      <div className="triage-stat">
                        <span className="triage-stat-label">Nodes Lost</span>
                        <span className="triage-stat-value stat-lost">{triagePrediction.lostCount}</span>
                      </div>
                      <div className="triage-stat">
                        <span className="triage-stat-label">Population Impact</span>
                        <span className="triage-stat-value stat-impact">{formatPopulation(triagePrediction.impactScore)}</span>
                      </div>
                      <div className="triage-stat">
                        <span className="triage-stat-label">Blast Radius</span>
                        <span className="triage-stat-value stat-lost">{triagePrediction.affectedNodeIds.length} assets</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Edge Context Modal ─────────────────────────────────────────── */}
      {selectedEdge && (
        <div className="context-overlay" role="presentation" onMouseDown={closeAllContexts}>
          <section className="node-context-modal edge-context-modal" role="dialog" aria-modal="true" aria-labelledby="edge-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="Close path context" onClick={closeAllContexts}><X size={18} /></button>
            <div className={`modal-status-line ${selectedEdge.status === "broken" ? "modal-failed" : "modal-operational"}`}>
              <span>{selectedEdge.status === "broken" ? "Route rupture" : "Dependency pathway"}</span>
              <span>{selectedEdge.status === "broken" ? "Broken" : "Integral"}</span>
            </div>
            <div className="modal-heading"><div><p className="section-kicker">{selectedEdge.id.toUpperCase()}</p><h2 id="edge-modal-title">{selectedEdge.label}</h2></div><Cable className="path-icon" size={28} /></div>
            <p className="modal-copy">{selectedEdge.status === "broken" ? "This pathway is unavailable. Its target asset is consuming its backup buffer until the route is repaired or local mitigation succeeds." : "Select this dependency path to simulate an independent physical break, such as a pipeline rupture or transmission cable loss."}</p>
            <div className="route-pair">
              <div><span>SOURCE</span><strong>{nodes.find((node) => node.id === selectedEdge.source)?.label}</strong></div>
              <ArrowRight size={16} />
              <div><span>TARGET</span><strong>{nodes.find((node) => node.id === selectedEdge.target)?.label}</strong></div>
            </div>
            <div className="modal-action-group edge-action-group">
              {selectedEdge.status === "operational" ? (
                <><p className="action-heading">Physical disruption trigger</p><button className="modal-action action-fail" type="button" onClick={() => breakEdge(selectedEdge.id)}><Link2Off size={17} /> BREAK / RUPTURE THIS PATH</button></>
              ) : (
                <><p className="action-heading"><Unplug size={14} /> Route repair</p><button className="remedy-row remedy-restore" type="button" onClick={() => repairEdge(selectedEdge.id)}><span><Check size={17} /> Reconnect dependency path</span><b>REPAIR</b></button></>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ── Impact Modal ───────────────────────────────────────────────── */}
      {impactNode && (
        <div className="context-overlay" role="presentation" onMouseDown={closeAllContexts}>
          <section className="node-context-modal impact-modal" role="dialog" aria-modal="true" aria-labelledby="impact-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="Close incident impact" onClick={closeAllContexts}><X size={18} /></button>
            <div className="modal-status-line modal-failed"><span>Asset failure alert</span><span>{impactedAssets.length} responding</span></div>
            <div className="modal-heading"><div><p className="section-kicker">{impactNode.assetId} / {impactNode.sector}</p><h2 id="impact-modal-title">{impactNode.label}</h2></div><AlertTriangle className="impact-icon" size={28} /></div>
            <p className="modal-copy">This asset is offline. The following dependencies have entered an active response state as the disruption moves through the field.</p>
            <div className="impact-list">
              {impactedAssets.length ? impactedAssets.map((node) => (
                <button type="button" className={`impact-row impact-${node.status}`} key={node.id} onClick={() => { setImpactNodeId(null); setSelectedNodeId(node.id); setTriagePrediction(null); }}>
                  <span><i />{node.label}</span>
                  <b>{node.status === "buffering" ? `BUFFER · ${formatDuration(node.buffer)}` : node.status === "repairing" ? `DEPLOYING · ${formatDuration(node.rescueTimer)}` : getStatusLabel(node.status)}</b>
                  <ChevronRight size={15} />
                </button>
              )) : <div className="impact-empty"><Network size={16} /> No downstream asset has entered a response state.</div>}
            </div>
          </section>
        </div>
      )}

      {/* ── Cost Estimator Modal ────────────────────────────────────────── */}
      {isEstimatorOpen && (
        <div className="context-overlay cost-overlay" role="presentation" onMouseDown={() => setEstimatorOpen(false)}>
          <section className="cost-estimator-modal" role="dialog" aria-modal="true" aria-labelledby="cost-estimator-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="Close cost estimate" onClick={() => setEstimatorOpen(false)}><X size={18} /></button>
            <header className="cost-estimator-header">
              <div>
                <p className="section-kicker">Selected interventions / preliminary estimate</p>
                <h2 id="cost-estimator-title">Cost estimation</h2>
                <p>Only assets with a remedy you selected are included in this working estimate.</p>
              </div>
              <span className="estimator-count">{selectedRemedies.length} SELECTED</span>
            </header>
            {selectedRemedies.length ? (
              <>
                <div className="cost-summary">
                  <div><span>Selected nodes</span><strong>{selectedRemedies.length}</strong></div>
                  <div><span>Highest action</span><strong>{formatCost(Math.max(...selectedRemedies.map((item) => item.cost)))}</strong></div>
                  <div className="cost-total"><span>Effective total</span><strong>{formatCost(selectedCost)}</strong></div>
                </div>
                <div className="cost-line-list">
                  {selectedRemedies.map((item) => (
                    <article className="cost-line" key={`${item.nodeId}-${item.remedyId}`}>
                      <div className="cost-line-meta">
                        <span>{item.assetId} / {item.sector}</span>
                        <strong>{item.nodeLabel}</strong>
                        <p>{item.remedyLabel}</p>
                      </div>
                      <b>{formatCost(item.cost)}</b>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="cost-estimate-empty">
                <div>
                  <Calculator size={28} />
                  <strong>No remedies selected</strong>
                  <p>Trigger a disruption, open an affected asset, and choose one of its sector-specific interventions. Its cost will appear here.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
