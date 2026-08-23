/**
 * Clinical Cascade Field page: black-and-charcoal control field with map-like infrastructure positions and sector-specific costed interventions.
 * Structural surfaces remain neutral; amber, red, and green are reserved for live simulation state.
 */
import { useEffect, useMemo, useState } from "react";
import { Background, BackgroundVariant, MarkerType, ReactFlow, type Edge, type NodeMouseHandler } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./intervention.css";
import { AlertTriangle, ArrowRight, Bomb, Cable, Calculator, Check, ChevronRight, CircleDot, Clock3, Link2Off, Network, RefreshCcw, Route, Unplug, Wrench, X } from "lucide-react";
import InfrastructureNode, { type InfrastructureFlowNode } from "@/components/InfrastructureNode";
import { DISASTER_PRESETS, getDownstreamNodeIds, getNodeOutDegree, getRemediesForNode, getStatusLabel, type DependencyEdge as SimulationEdge, type InfrastructureNode as SimulationNode, type NodeStatus, useSimulationStore } from "@/lib/simulationStore";

const nodeTypes = { infrastructure: InfrastructureNode };

const statusDetail: Record<NodeStatus, { eyebrow: string; copy: string }> = {
  operational: { eyebrow: "Nominal asset", copy: "This dependency is available and has no active local intervention." },
  buffering: { eyebrow: "Backup consumption", copy: "An upstream asset or dependency path is unavailable. Choose a sector-specific intervention before the reserve expires." },
  failed: { eyebrow: "Unavailable asset", copy: "This asset is offline. Apply an asset-specific intervention to restore it or establish temporary service." },
  recovered: { eyebrow: "Local mitigation applied", copy: "A selected intervention has restored this asset while the upstream disruption remains isolated." },
};

const formatDuration = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const formatCost = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

const makeFlowNodes = (nodes: SimulationNode[]): InfrastructureFlowNode[] => nodes.map((node) => ({ id: node.id, type: "infrastructure", position: { x: node.x, y: node.y }, data: node, draggable: false, selectable: true }));

const edgeTone = (edge: SimulationEdge, nodes: SimulationNode[]) => {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (edge.status === "broken") return "#EF4444";
  if (source?.status === "failed") return "#F87171";
  if (target?.status === "buffering") return "#F59E0B";
  return "#787880";
};

export default function Home() {
  const nodes = useSimulationStore((state) => state.nodes);
  const edges = useSimulationStore((state) => state.edges);
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

  useEffect(() => {
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [tick]);

  const flowNodes = useMemo(() => makeFlowNodes(nodes), [nodes]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const impactNode = nodes.find((node) => node.id === impactNodeId) ?? null;
  const failedNodes = nodes.filter((node) => node.status === "failed");
  const brokenEdges = edges.filter((edge) => edge.status === "broken");
  const activeIncidents = failedNodes.length + brokenEdges.length;
  const healthyEdgeCount = edges.filter((edge) => edge.status === "operational").length;
  const activePreset = DISASTER_PRESETS.find((preset) => preset.id === activePresetId) ?? null;
  const selectedCost = selectedRemedies.reduce((total, remedy) => total + remedy.cost, 0);
  const nodeRemedies = selectedNode ? getRemediesForNode(selectedNode.id) : [];

  const flowEdges = useMemo<Edge[]>(() => edges.map((edge) => {
    const tone = edgeTone(edge, nodes);
    const isBroken = edge.status === "broken";
    const sourceFailed = nodes.find((node) => node.id === edge.source)?.status === "failed";
    return { id: edge.id, source: edge.source, target: edge.target, label: isBroken ? `RUPTURE · ${edge.label}` : edge.label, type: "smoothstep", animated: !isBroken && !sourceFailed && nodes.find((node) => node.id === edge.target)?.status === "buffering", markerEnd: { type: MarkerType.ArrowClosed, color: tone }, interactionWidth: 28, style: { stroke: tone, strokeWidth: isBroken || sourceFailed ? 2.5 : 1.35, strokeDasharray: isBroken ? "9 6" : undefined, opacity: isBroken ? 0.96 : 1 }, labelStyle: { fill: isBroken ? "#F87171" : "#B4B4BB", fontSize: 9, fontFamily: "IBM Plex Mono, monospace", fontWeight: isBroken ? 600 : 500 }, labelBgStyle: { fill: isBroken ? "#210C0E" : "#101012", fillOpacity: 0.94 }, labelBgPadding: [4, 2] };
  }), [edges, nodes]);

  const impactedAssets = useMemo(() => {
    if (!impactNode) return [];
    const downstream = new Set(getDownstreamNodeIds(impactNode.id));
    return nodes.filter((node) => downstream.has(node.id) && (node.status === "buffering" || node.status === "failed" || node.status === "recovered"));
  }, [impactNode, nodes]);

  const onNodeClick: NodeMouseHandler<InfrastructureFlowNode> = (_, clickedNode) => { setSelectedEdgeId(null); setImpactNodeId(null); setSelectedNodeId(clickedNode.id); };
  const closeAllContexts = () => { setSelectedNodeId(null); setSelectedEdgeId(null); setImpactNodeId(null); };
  const openImpact = (nodeId: string) => { setSelectedNodeId(null); setSelectedEdgeId(null); setImpactNodeId(nodeId); };

  return (
    <main className="simulator-shell">
      <header className="simulator-header">
        <div className="brand-block"><img className="brand-mark" src="/manus-storage/urban-cascade-mark_e0d5502c.png" alt="Urban cascade simulation mark" /><div><p className="section-kicker">Municipal Systems</p><h1>Cascade Field <span>/ Urban Infrastructure</span></h1></div></div>
        <div className="header-meta"><div className={`status-readout ${activeIncidents ? "status-alert" : ""}`}><span className="readout-led" /> {activeIncidents ? `${activeIncidents} active incident${activeIncidents === 1 ? "" : "s"}` : "Simulation ready"}</div><span className="header-divider" /><span className="technical-id">{healthyEdgeCount}/{edges.length} PATHWAYS INTEGRAL</span></div>
      </header>

      <section className="simulation-workspace" aria-label="Urban infrastructure dependency canvas">
        <aside className={`incident-rail ${activeIncidents ? "has-incidents" : ""}`} aria-label="Live incident alerts and field controls">
          <div className="rail-scenario-stamp"><i /><p>{activePreset ? "ACTIVE PRESET" : "LIVE FIELD"}<br />{activePreset?.label ?? "STATUS"}</p></div>
          <div className="incident-rack-title"><div className="incident-heading"><AlertTriangle size={16} /><span>Live incident alerts</span></div><p>{activeIncidents ? "Select an event to inspect its impact." : "No asset or route failures in this scenario."}</p></div>
          <div className="preset-block" aria-label="Named disaster scenario presets"><div className="preset-title"><span>Disaster presets</span><small>APPLY SCENARIO</small></div><div className="preset-grid">{DISASTER_PRESETS.map((preset) => <button className={`preset-button ${activePresetId === preset.id ? "is-active" : ""}`} type="button" key={preset.id} onClick={() => { closeAllContexts(); setEstimatorOpen(false); applyPreset(preset.id); }}><span>{preset.code}</span><strong>{preset.label}</strong><small>{preset.effect}</small></button>)}</div></div>
          <div className="incident-list">
            {!activeIncidents && <div className="incident-empty"><CircleDot size={14} /> Field stable — select a node or dependency path to trigger a disruption.</div>}
            {failedNodes.map((node) => { const impactCount = nodes.filter((candidate) => getDownstreamNodeIds(node.id).includes(candidate.id) && candidate.status !== "operational").length; return <button className="incident-card incident-node-card" type="button" key={node.id} onClick={() => openImpact(node.id)}><span className="incident-type">Asset failed</span><strong>{node.label}</strong><small>{node.assetId} · {impactCount} responding</small><ChevronRight size={17} /></button>; })}
            {brokenEdges.map((edge) => { const source = nodes.find((node) => node.id === edge.source); const target = nodes.find((node) => node.id === edge.target); return <button className="incident-card incident-edge-card" type="button" key={edge.id} onClick={() => { setSelectedNodeId(null); setImpactNodeId(null); setSelectedEdgeId(edge.id); }}><span className="incident-type">Path ruptured</span><strong>{source?.label} <ArrowRight size={13} /> {target?.label}</strong><small>{edge.label} · inspect route</small><ChevronRight size={17} /></button>; })}
          </div>
          <button className="cost-estimate-trigger" type="button" onClick={() => { closeAllContexts(); setEstimatorOpen(true); }}><Calculator size={16} /><span><small>REMEDY COST ESTIMATE</small><strong>{selectedRemedies.length ? formatCost(selectedCost) : "Open estimator"}</strong></span><ChevronRight size={15} /></button>
          <div className="incident-integrity"><span>ROUTE INTEGRITY</span><strong>{healthyEdgeCount}/{edges.length}</strong><small>PATHWAYS INTACT</small></div>
          <button className="incident-reset" onClick={reset} type="button"><RefreshCcw size={15} /> Reset scenario</button>
        </aside>
        <div className="canvas-frame">
          <div className="coordinate-field" aria-hidden="true" /><div className="map-route-traces" aria-hidden="true" /><div className="canvas-asset canvas-grid-asset" aria-hidden="true" /><div className="canvas-asset canvas-sector-asset" aria-hidden="true" />
          <div className="canvas-topbar"><div className="canvas-label"><Route size={15} /> Directed dependency field</div><div className="state-key" aria-label="Node state legend"><span><i className="key-neutral" /> Operational</span><span><i className="key-buffer" /> Buffering</span><span><i className="key-failed" /> Failed</span><span><i className="key-recovered" /> Recovered</span></div></div>
          <ReactFlow className="cascade-flow" nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.16, minZoom: 0.31, maxZoom: 1.05 }} minZoom={0.28} maxZoom={1.25} onNodeClick={onNodeClick} onEdgeClick={(_, clickedEdge) => { setSelectedNodeId(null); setImpactNodeId(null); setSelectedEdgeId(clickedEdge.id); }} onPaneClick={closeAllContexts} nodesDraggable={false} nodesConnectable={false} elementsSelectable proOptions={{ hideAttribution: true }}><Background color="#3F3F46" gap={24} size={1} variant={BackgroundVariant.Dots} /></ReactFlow>
          <div className="field-readout-deck" aria-label="Field context"><div><span>Asset field</span><strong>{String(nodes.length).padStart(2, "0")} live assets</strong></div><div><span>Route integrity</span><strong>{healthyEdgeCount}/{edges.length} pathways</strong></div><div><span>Interventions</span><strong>{selectedRemedies.length} costed actions</strong></div></div><div className="canvas-caption">Municipal base layer · irregular coordinate field</div>
        </div>
      </section>

      {selectedNode && <div className="context-overlay" role="presentation" onMouseDown={closeAllContexts}><section className="node-context-modal" role="dialog" aria-modal="true" aria-labelledby="node-modal-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="Close node context" onClick={closeAllContexts}><X size={18} /></button><div className={`modal-status-line modal-${selectedNode.status}`}><span>{statusDetail[selectedNode.status].eyebrow}</span><span>{getStatusLabel(selectedNode.status)}</span></div><div className="modal-heading"><div><p className="section-kicker">{selectedNode.sector} / {selectedNode.assetId}</p><h2 id="node-modal-title">{selectedNode.label}</h2></div>{selectedNode.status === "buffering" && <div className="buffer-countdown"><Clock3 size={16} /> {formatDuration(selectedNode.buffer)}</div>}</div><p className="modal-copy">{statusDetail[selectedNode.status].copy}</p><div className="modal-data-grid"><div><span>DEPENDENTS</span><strong>{getNodeOutDegree(selectedNode.id)}</strong></div><div><span>STATE</span><strong>{getStatusLabel(selectedNode.status)}</strong></div><div><span>SECTOR</span><strong>{selectedNode.sector}</strong></div></div>{getNodeOutDegree(selectedNode.id) > 0 && <div className="modal-action-group fail-group"><p className="action-heading">Root disruption trigger</p><button className="modal-action action-fail" type="button" disabled={selectedNode.status === "failed"} onClick={() => blastNode(selectedNode.id)}><Bomb size={17} />{selectedNode.status === "failed" ? "Node already failed" : "BLAST / FAIL THIS NODE"}</button></div>}{(selectedNode.status === "buffering" || selectedNode.status === "failed") && <div className="modal-action-group mitigation-group"><p className="action-heading"><Wrench size={14} /> {selectedNode.sector.toLowerCase()} intervention options</p>{nodeRemedies.map((remedy) => <button className={`remedy-row ${remedy.effect === "restore" ? "remedy-restore" : "remedy-buffer"}`} type="button" key={remedy.id} onClick={() => applyRemedy(selectedNode.id, remedy.id)}><span><Wrench size={16} /> {remedy.label}</span><b>{formatCost(remedy.cost)}</b></button>)}</div>}</section></div>}

      {selectedEdge && <div className="context-overlay" role="presentation" onMouseDown={closeAllContexts}><section className="node-context-modal edge-context-modal" role="dialog" aria-modal="true" aria-labelledby="edge-modal-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="Close path context" onClick={closeAllContexts}><X size={18} /></button><div className={`modal-status-line ${selectedEdge.status === "broken" ? "modal-failed" : "modal-operational"}`}><span>{selectedEdge.status === "broken" ? "Route rupture" : "Dependency pathway"}</span><span>{selectedEdge.status === "broken" ? "Broken" : "Integral"}</span></div><div className="modal-heading"><div><p className="section-kicker">{selectedEdge.id.toUpperCase()}</p><h2 id="edge-modal-title">{selectedEdge.label}</h2></div><Cable className="path-icon" size={28} /></div><p className="modal-copy">{selectedEdge.status === "broken" ? "This pathway is unavailable. Its target asset is consuming its backup buffer until the route is repaired or local mitigation succeeds." : "Select this dependency path to simulate an independent physical break, such as a pipeline rupture or transmission cable loss."}</p><div className="route-pair"><div><span>SOURCE</span><strong>{nodes.find((node) => node.id === selectedEdge.source)?.label}</strong></div><ArrowRight size={16} /><div><span>TARGET</span><strong>{nodes.find((node) => node.id === selectedEdge.target)?.label}</strong></div></div><div className="modal-action-group edge-action-group">{selectedEdge.status === "operational" ? <><p className="action-heading">Physical disruption trigger</p><button className="modal-action action-fail" type="button" onClick={() => breakEdge(selectedEdge.id)}><Link2Off size={17} /> BREAK / RUPTURE THIS PATH</button></> : <><p className="action-heading"><Unplug size={14} /> Route repair</p><button className="remedy-row remedy-restore" type="button" onClick={() => repairEdge(selectedEdge.id)}><span><Check size={17} /> Reconnect dependency path</span><b>REPAIR</b></button></>}</div></section></div>}

      {impactNode && <div className="context-overlay" role="presentation" onMouseDown={closeAllContexts}><section className="node-context-modal impact-modal" role="dialog" aria-modal="true" aria-labelledby="impact-modal-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="Close incident impact" onClick={closeAllContexts}><X size={18} /></button><div className="modal-status-line modal-failed"><span>Asset failure alert</span><span>{impactedAssets.length} responding</span></div><div className="modal-heading"><div><p className="section-kicker">{impactNode.assetId} / {impactNode.sector}</p><h2 id="impact-modal-title">{impactNode.label}</h2></div><AlertTriangle className="impact-icon" size={28} /></div><p className="modal-copy">This asset is offline. The following dependencies have entered an active response state as the disruption moves through the field.</p><div className="impact-list">{impactedAssets.length ? impactedAssets.map((node) => <button type="button" className={`impact-row impact-${node.status}`} key={node.id} onClick={() => { setImpactNodeId(null); setSelectedNodeId(node.id); }}><span><i />{node.label}</span><b>{node.status === "buffering" ? `BUFFER · ${formatDuration(node.buffer)}` : getStatusLabel(node.status)}</b><ChevronRight size={15} /></button>) : <div className="impact-empty"><Network size={16} /> No downstream asset has entered a response state.</div>}</div></section></div>}

      {isEstimatorOpen && <div className="context-overlay cost-overlay" role="presentation" onMouseDown={() => setEstimatorOpen(false)}><section className="cost-estimator-modal" role="dialog" aria-modal="true" aria-labelledby="cost-estimator-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="Close cost estimate" onClick={() => setEstimatorOpen(false)}><X size={18} /></button><header className="cost-estimator-header"><div><p className="section-kicker">Selected interventions / preliminary estimate</p><h2 id="cost-estimator-title">Cost estimation</h2><p>Only assets with a remedy you selected are included in this working estimate.</p></div><span className="estimator-count">{selectedRemedies.length} SELECTED</span></header>{selectedRemedies.length ? <><div className="cost-summary"><div><span>Selected nodes</span><strong>{selectedRemedies.length}</strong></div><div><span>Highest action</span><strong>{formatCost(Math.max(...selectedRemedies.map((item) => item.cost)))}</strong></div><div className="cost-total"><span>Effective total</span><strong>{formatCost(selectedCost)}</strong></div></div><div className="cost-line-list">{selectedRemedies.map((item) => <article className="cost-line" key={`${item.nodeId}-${item.remedyId}`}><div className="cost-line-meta"><span>{item.assetId} / {item.sector}</span><strong>{item.nodeLabel}</strong><p>{item.remedyLabel}</p></div><b>{formatCost(item.cost)}</b></article>)}</div></> : <div className="cost-estimate-empty"><div><Calculator size={28} /><strong>No remedies selected</strong><p>Trigger a disruption, open an affected asset, and choose one of its sector-specific interventions. Its cost will appear here.</p></div></div>}</section></div>}
    </main>
  );
}
