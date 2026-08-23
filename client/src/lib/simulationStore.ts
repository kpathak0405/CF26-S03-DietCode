/**
 * Clinical Cascade Field logic: deterministic dependencies, sector-specific interventions, and selected-cost tracking.
 */
import { create } from "zustand";

export type NodeStatus = "operational" | "buffering" | "failed" | "recovered";
export type EdgeStatus = "operational" | "broken";
export type RemedyEffect = "buffer" | "restore";

export type InfrastructureNode = {
  id: string;
  assetId: string;
  label: string;
  sector: "POWER" | "WATER" | "HEALTH" | "MOBILITY" | "COMMS" | "CIVIC";
  x: number;
  y: number;
  baseBuffer: number;
  buffer: number;
  status: NodeStatus;
};

export type DependencyEdge = { id: string; source: string; target: string; label: string; status: EdgeStatus };

export type RemedyOption = {
  id: string;
  label: string;
  cost: number;
  effect: RemedyEffect;
  bufferSeconds?: number;
};

export type AppliedRemedy = {
  nodeId: string;
  assetId: string;
  nodeLabel: string;
  sector: InfrastructureNode["sector"];
  remedyId: string;
  remedyLabel: string;
  cost: number;
};

export type DisasterPreset = {
  id: "substation-flashover" | "water-main-rupture" | "telecom-blackout" | "seismic-corridor";
  code: string;
  label: string;
  effect: string;
  failedNodeIds: string[];
  brokenEdgeIds: string[];
};

const BASE_DEPENDENCY_EDGES: DependencyEdge[] = [
  { id: "e-power-water", source: "power-substation", target: "water-treatment", label: "grid feed", status: "operational" },
  { id: "e-power-comms", source: "power-substation", target: "telecom-exchange", label: "grid feed", status: "operational" },
  { id: "e-power-mobility", source: "power-substation", target: "metro-signals", label: "grid feed", status: "operational" },
  { id: "e-water-pumps", source: "water-treatment", target: "booster-pumps", label: "treated supply", status: "operational" },
  { id: "e-water-hospital", source: "water-treatment", target: "hospital-icu", label: "critical supply", status: "operational" },
  { id: "e-comms-hospital", source: "telecom-exchange", target: "hospital-icu", label: "data uplink", status: "operational" },
  { id: "e-comms-dispatch", source: "telecom-exchange", target: "emergency-dispatch", label: "voice/data", status: "operational" },
  { id: "e-hospital-dispatch", source: "hospital-icu", target: "emergency-dispatch", label: "bed status", status: "operational" },
  { id: "e-pumps-fire", source: "booster-pumps", target: "fire-station", label: "pressure line", status: "operational" },
  { id: "e-dispatch-fire", source: "emergency-dispatch", target: "fire-station", label: "dispatch signal", status: "operational" },
];

const INITIAL_NODES: InfrastructureNode[] = [
  { id: "power-substation", assetId: "PWR-01", label: "Power Substation", sector: "POWER", x: 95, y: 360, baseBuffer: 0, buffer: 0, status: "operational" },
  { id: "water-treatment", assetId: "WTR-11", label: "Water Treatment", sector: "WATER", x: 390, y: 90, baseBuffer: 55, buffer: 55, status: "operational" },
  { id: "telecom-exchange", assetId: "COM-07", label: "Telecom Exchange", sector: "COMMS", x: 320, y: 555, baseBuffer: 65, buffer: 65, status: "operational" },
  { id: "metro-signals", assetId: "MOB-03", label: "Metro Signal Grid", sector: "MOBILITY", x: 145, y: 705, baseBuffer: 40, buffer: 40, status: "operational" },
  { id: "booster-pumps", assetId: "WTR-14", label: "Booster Pumps", sector: "WATER", x: 735, y: 180, baseBuffer: 35, buffer: 35, status: "operational" },
  { id: "hospital-icu", assetId: "HLT-02", label: "Hospital ICU", sector: "HEALTH", x: 670, y: 405, baseBuffer: 80, buffer: 80, status: "operational" },
  { id: "emergency-dispatch", assetId: "CIV-09", label: "Emergency Dispatch", sector: "CIVIC", x: 1075, y: 245, baseBuffer: 60, buffer: 60, status: "operational" },
  { id: "fire-station", assetId: "CIV-21", label: "Fire Station 7", sector: "CIVIC", x: 915, y: 650, baseBuffer: 45, buffer: 45, status: "operational" },
];

export const REMEDIES_BY_NODE: Record<string, RemedyOption[]> = {
  "power-substation": [
    { id: "mobile-transformer", label: "Deploy mobile transformer", cost: 420000, effect: "restore" },
    { id: "island-priority-feeder", label: "Island priority feeder", cost: 185000, effect: "buffer", bufferSeconds: 180 },
  ],
  "water-treatment": [
    { id: "membrane-skid", label: "Deploy membrane treatment skid", cost: 310000, effect: "restore" },
    { id: "chlorination-train", label: "Run emergency chlorination train", cost: 155000, effect: "buffer", bufferSeconds: 120 },
  ],
  "telecom-exchange": [
    { id: "satellite-backhaul", label: "Activate satellite backhaul", cost: 160000, effect: "restore" },
    { id: "carrier-reroute", label: "Reroute carrier fibre", cost: 72000, effect: "buffer", bufferSeconds: 150 },
  ],
  "metro-signals": [
    { id: "signal-generator", label: "Install portable signal generator", cost: 95000, effect: "restore" },
    { id: "manual-control", label: "Deploy manual intersection control", cost: 28000, effect: "buffer", bufferSeconds: 90 },
  ],
  "booster-pumps": [
    { id: "pressure-pump", label: "Truck-mounted pressure pump", cost: 125000, effect: "restore" },
    { id: "gravity-bypass", label: "Open gravity-fed bypass", cost: 60000, effect: "buffer", bufferSeconds: 120 },
  ],
  "hospital-icu": [
    { id: "icu-microgrid", label: "Engage ICU microgrid", cost: 275000, effect: "restore" },
    { id: "sterile-reserve", label: "Draw sterile water reserve", cost: 82000, effect: "buffer", bufferSeconds: 180 },
  ],
  "emergency-dispatch": [
    { id: "command-vehicle", label: "Stand up mobile command vehicle", cost: 118000, effect: "restore" },
    { id: "mutual-aid-console", label: "Transfer to mutual-aid console", cost: 48000, effect: "buffer", bufferSeconds: 135 },
  ],
  "fire-station": [
    { id: "tanker-shuttle", label: "Deploy tanker shuttle", cost: 86000, effect: "restore" },
    { id: "county-channel", label: "Switch to county radio channel", cost: 24000, effect: "buffer", bufferSeconds: 120 },
  ],
};

export const DISASTER_PRESETS: DisasterPreset[] = [
  { id: "substation-flashover", code: "P-01", label: "Substation flashover", effect: "power loss", failedNodeIds: ["power-substation"], brokenEdgeIds: [] },
  { id: "water-main-rupture", code: "W-02", label: "Water main rupture", effect: "2 routes lost", failedNodeIds: [], brokenEdgeIds: ["e-water-pumps", "e-water-hospital"] },
  { id: "telecom-blackout", code: "C-03", label: "Telecom blackout", effect: "relay outage", failedNodeIds: ["telecom-exchange"], brokenEdgeIds: [] },
  { id: "seismic-corridor", code: "X-04", label: "Seismic corridor", effect: "compound strike", failedNodeIds: ["power-substation"], brokenEdgeIds: ["e-water-hospital"] },
];

const cloneInitialNodes = () => INITIAL_NODES.map((node) => ({ ...node }));
const cloneInitialEdges = () => BASE_DEPENDENCY_EDGES.map((edge) => ({ ...edge }));
const incomingEdgesFor = (nodeId: string, edges: DependencyEdge[]) => edges.filter((edge) => edge.target === nodeId);
const childIdsFor = (nodeId: string) => BASE_DEPENDENCY_EDGES.filter((edge) => edge.source === nodeId).map((edge) => edge.target);

const hasIncomingDisruption = (node: InfrastructureNode, nodes: InfrastructureNode[], edges: DependencyEdge[]) =>
  incomingEdgesFor(node.id, edges).some((edge) => edge.status === "broken" || nodes.find((candidate) => candidate.id === edge.source)?.status === "failed");

const recalculateDependents = (nodes: InfrastructureNode[], edges: DependencyEdge[]): InfrastructureNode[] =>
  nodes.map<InfrastructureNode>((node) => {
    if (node.status === "failed" || node.status === "recovered") return node;
    const isDisrupted = hasIncomingDisruption(node, nodes, edges);
    if (isDisrupted && node.status === "operational") return { ...node, status: "buffering", buffer: node.baseBuffer };
    if (!isDisrupted && node.status === "buffering") return { ...node, status: "operational", buffer: node.baseBuffer };
    return node;
  });

type SimulationState = {
  nodes: InfrastructureNode[];
  edges: DependencyEdge[];
  activePresetId: DisasterPreset["id"] | null;
  selectedRemedies: AppliedRemedy[];
  tick: () => void;
  blastNode: (nodeId: string) => void;
  applyRemedy: (nodeId: string, remedyId: string) => void;
  breakEdge: (edgeId: string) => void;
  repairEdge: (edgeId: string) => void;
  applyPreset: (presetId: DisasterPreset["id"]) => void;
  reset: () => void;
};

export const useSimulationStore = create<SimulationState>((set) => ({
  nodes: cloneInitialNodes(),
  edges: cloneInitialEdges(),
  activePresetId: null,
  selectedRemedies: [],
  tick: () => set((state) => {
    const ticked = state.nodes.map<InfrastructureNode>((node) => {
      if (node.status !== "buffering") return node;
      const nextBuffer = Math.max(0, node.buffer - 1);
      return nextBuffer === 0 ? { ...node, status: "failed", buffer: 0 } : { ...node, buffer: nextBuffer };
    });
    return { nodes: recalculateDependents(ticked, state.edges) };
  }),
  blastNode: (nodeId) => set((state) => {
    const failed = state.nodes.map<InfrastructureNode>((node) => node.id === nodeId ? { ...node, status: "failed", buffer: 0 } : node);
    return { nodes: recalculateDependents(failed, state.edges), activePresetId: null };
  }),
  applyRemedy: (nodeId, remedyId) => set((state) => {
    const target = state.nodes.find((node) => node.id === nodeId);
    const remedy = REMEDIES_BY_NODE[nodeId]?.find((candidate) => candidate.id === remedyId);
    if (!target || !remedy || (target.status !== "buffering" && target.status !== "failed")) return {};
    const updatedNodes = state.nodes.map<InfrastructureNode>((node) => {
      if (node.id !== nodeId) return node;
      if (remedy.effect === "restore") return { ...node, status: "recovered", buffer: 0 };
      return { ...node, status: "buffering", buffer: Math.max(node.buffer, 0) + (remedy.bufferSeconds ?? 0) };
    });
    const applied: AppliedRemedy = { nodeId, assetId: target.assetId, nodeLabel: target.label, sector: target.sector, remedyId: remedy.id, remedyLabel: remedy.label, cost: remedy.cost };
    return { nodes: recalculateDependents(updatedNodes, state.edges), selectedRemedies: [...state.selectedRemedies.filter((item) => item.nodeId !== nodeId), applied], activePresetId: null };
  }),
  breakEdge: (edgeId) => set((state) => {
    const edges = state.edges.map((edge) => edge.id === edgeId ? { ...edge, status: "broken" as EdgeStatus } : edge);
    return { edges, nodes: recalculateDependents(state.nodes, edges), activePresetId: null };
  }),
  repairEdge: (edgeId) => set((state) => {
    const edges = state.edges.map((edge) => edge.id === edgeId ? { ...edge, status: "operational" as EdgeStatus } : edge);
    return { edges, nodes: recalculateDependents(state.nodes, edges), activePresetId: null };
  }),
  applyPreset: (presetId) => set(() => {
    const preset = DISASTER_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) return { nodes: cloneInitialNodes(), edges: cloneInitialEdges(), activePresetId: null, selectedRemedies: [] };
    const edges = cloneInitialEdges().map((edge) => preset.brokenEdgeIds.includes(edge.id) ? { ...edge, status: "broken" as EdgeStatus } : edge);
    const seededNodes = cloneInitialNodes().map<InfrastructureNode>((node) => preset.failedNodeIds.includes(node.id) ? { ...node, status: "failed", buffer: 0 } : node);
    return { edges, nodes: recalculateDependents(seededNodes, edges), activePresetId: preset.id, selectedRemedies: [] };
  }),
  reset: () => set({ nodes: cloneInitialNodes(), edges: cloneInitialEdges(), activePresetId: null, selectedRemedies: [] }),
}));

export const getRemediesForNode = (nodeId: string) => REMEDIES_BY_NODE[nodeId] ?? [];
export const getNodeOutDegree = (nodeId: string) => childIdsFor(nodeId).length;

export const getDownstreamNodeIds = (nodeId: string) => {
  const discovered = new Set<string>();
  const frontier = [...childIdsFor(nodeId)];
  while (frontier.length) {
    const next = frontier.shift();
    if (!next || discovered.has(next)) continue;
    discovered.add(next);
    frontier.push(...childIdsFor(next));
  }
  return Array.from(discovered);
};

export const getStatusLabel = (status: NodeStatus) => ({ operational: "Operational", buffering: "Buffering", failed: "Failed", recovered: "Recovered" })[status];
