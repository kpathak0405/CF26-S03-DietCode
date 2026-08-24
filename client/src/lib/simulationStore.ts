/**
 * Pralayaant Simulation Engine v2
 * ─────────────────────────────────
 * Deterministic cascade logic with resource scarcity, dual-timer deployment races,
 * sector-specific interventions, and a pure predictive "what-if" engine.
 */
import { create } from "zustand";

// ─── Status & Type Definitions ───────────────────────────────────────────────

export type NodeStatus = "operational" | "buffering" | "repairing" | "failed" | "recovered";
export type EdgeStatus = "operational" | "broken";
export type RemedyEffect = "buffer" | "restore";
export type ResourceType = "generator" | "waterTanker" | "commsSat" | "medUnit" | "crewTeam";

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
  /** Seconds remaining until rescue crew arrives. 0 = no active deployment. */
  rescueTimer: number;
  /** Max rescue time for this node (used to calculate progress bar width). */
  maxRescueTime: number;
  /** Which resource was committed to this node, if any. */
  deployedResource: ResourceType | null;
};

export type DependencyEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  status: EdgeStatus;
};

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

export type InventorySlot = {
  label: string;
  available: number;
  max: number;
};

export type CityInventory = Record<ResourceType, InventorySlot>;

export type TriagePrediction = {
  savedCount: number;
  lostCount: number;
  impactScore: number;
  affectedNodeIds: string[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

/** Which resource type each node requires for a "restore" remedy deployment. */
const RESOURCE_MAPPING: Record<string, ResourceType> = {
  "power-substation": "generator",
  "water-treatment": "waterTanker",
  "telecom-exchange": "commsSat",
  "metro-signals": "generator",
  "booster-pumps": "waterTanker",
  "hospital-icu": "medUnit",
  "emergency-dispatch": "crewTeam",
  "fire-station": "crewTeam",
};

/** How long (in seconds) rescue takes for each node. */
const RESCUE_TIMES: Record<string, number> = {
  "power-substation": 20,
  "water-treatment": 15,
  "telecom-exchange": 12,
  "metro-signals": 18,
  "booster-pumps": 14,
  "hospital-icu": 10,
  "emergency-dispatch": 16,
  "fire-station": 22,
};

/** Population weight for impact scoring in the triage predictor. */
const POPULATION_WEIGHT: Record<string, number> = {
  "power-substation": 120000,
  "water-treatment": 85000,
  "telecom-exchange": 60000,
  "metro-signals": 40000,
  "booster-pumps": 30000,
  "hospital-icu": 50000,
  "emergency-dispatch": 35000,
  "fire-station": 25000,
};

const INITIAL_INVENTORY: CityInventory = {
  generator: { label: "Generators", available: 2, max: 2 },
  waterTanker: { label: "Water Tankers", available: 3, max: 3 },
  commsSat: { label: "Comms Satellites", available: 1, max: 1 },
  medUnit: { label: "Medical Units", available: 2, max: 2 },
  crewTeam: { label: "Crew Teams", available: 3, max: 3 },
};

const cloneInventory = (): CityInventory =>
  Object.fromEntries(
    Object.entries(INITIAL_INVENTORY).map(([key, slot]) => [key, { ...slot }]),
  ) as CityInventory;

// ─── Node & Edge Data ────────────────────────────────────────────────────────

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
  { id: "power-substation", assetId: "PWR-01", label: "Power Substation", sector: "POWER", x: 95, y: 360, baseBuffer: 0, buffer: 0, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null },
  { id: "water-treatment", assetId: "WTR-11", label: "Water Treatment", sector: "WATER", x: 390, y: 90, baseBuffer: 55, buffer: 55, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null },
  { id: "telecom-exchange", assetId: "COM-07", label: "Telecom Exchange", sector: "COMMS", x: 320, y: 555, baseBuffer: 65, buffer: 65, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null },
  { id: "metro-signals", assetId: "MOB-03", label: "Metro Signal Grid", sector: "MOBILITY", x: 145, y: 705, baseBuffer: 40, buffer: 40, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null },
  { id: "booster-pumps", assetId: "WTR-14", label: "Booster Pumps", sector: "WATER", x: 735, y: 180, baseBuffer: 35, buffer: 35, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null },
  { id: "hospital-icu", assetId: "HLT-02", label: "Hospital ICU", sector: "HEALTH", x: 670, y: 405, baseBuffer: 80, buffer: 80, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null },
  { id: "emergency-dispatch", assetId: "CIV-09", label: "Emergency Dispatch", sector: "CIVIC", x: 1075, y: 245, baseBuffer: 60, buffer: 60, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null },
  { id: "fire-station", assetId: "CIV-21", label: "Fire Station 7", sector: "CIVIC", x: 915, y: 650, baseBuffer: 45, buffer: 45, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null },
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

// ─── Graph Helpers ───────────────────────────────────────────────────────────

const cloneInitialNodes = (): InfrastructureNode[] => INITIAL_NODES.map((node) => ({ ...node }));
const cloneInitialEdges = (): DependencyEdge[] => BASE_DEPENDENCY_EDGES.map((edge) => ({ ...edge }));

const incomingEdgesFor = (nodeId: string, edges: DependencyEdge[]) =>
  edges.filter((edge) => edge.target === nodeId);

const childIdsFor = (nodeId: string) =>
  BASE_DEPENDENCY_EDGES.filter((edge) => edge.source === nodeId).map((edge) => edge.target);

const hasIncomingDisruption = (node: InfrastructureNode, nodes: InfrastructureNode[], edges: DependencyEdge[]) =>
  incomingEdgesFor(node.id, edges).some(
    (edge) => edge.status === "broken" || nodes.find((n) => n.id === edge.source)?.status === "failed",
  );

/**
 * Recalculate dependent node statuses after a topology change.
 * Nodes that are failed, recovered, or repairing are left alone.
 */
const recalculateDependents = (nodes: InfrastructureNode[], edges: DependencyEdge[]): InfrastructureNode[] =>
  nodes.map<InfrastructureNode>((node) => {
    if (node.status === "failed" || node.status === "recovered" || node.status === "repairing") return node;
    const isDisrupted = hasIncomingDisruption(node, nodes, edges);
    if (isDisrupted && node.status === "operational") {
      return { ...node, status: "buffering", buffer: node.baseBuffer };
    }
    if (!isDisrupted && node.status === "buffering") {
      return { ...node, status: "operational", buffer: node.baseBuffer };
    }
    return node;
  });

// ─── Store Type ──────────────────────────────────────────────────────────────

type SimulationState = {
  nodes: InfrastructureNode[];
  edges: DependencyEdge[];
  inventory: CityInventory;
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

// ─── Store Implementation ────────────────────────────────────────────────────

export const useSimulationStore = create<SimulationState>((set) => ({
  nodes: cloneInitialNodes(),
  edges: cloneInitialEdges(),
  inventory: cloneInventory(),
  activePresetId: null,
  selectedRemedies: [],

  // ── The Dual-Timer Tick Loop ────────────────────────────────────────────
  tick: () =>
    set((state) => {
      let inventoryChanged = false;
      const newInventory = { ...state.inventory };
      // Clone each slot so we can mutate safely
      for (const key of Object.keys(newInventory) as ResourceType[]) {
        newInventory[key] = { ...newInventory[key] };
      }

      const ticked = state.nodes.map<InfrastructureNode>((node) => {
        // ── REPAIRING: both timers race ──────────────────────────────────
        if (node.status === "repairing") {
          const nextBuffer = Math.max(0, node.buffer - 1);
          const nextRescue = Math.max(0, node.rescueTimer - 1);

          // RESCUE WINS: truck arrived before battery died
          if (nextRescue <= 0) {
            return {
              ...node,
              status: "recovered",
              buffer: 0,
              rescueTimer: 0,
              // keep deployedResource so we know it's committed
            };
          }

          // DANGER WINS: battery died while truck was still in transit
          if (nextBuffer <= 0) {
            // Resource is WASTED — do NOT return it to inventory
            return {
              ...node,
              status: "failed",
              buffer: 0,
              rescueTimer: 0,
              deployedResource: null,
            };
          }

          // Both still counting down
          return { ...node, buffer: nextBuffer, rescueTimer: nextRescue };
        }

        // ── BUFFERING: danger timer only ─────────────────────────────────
        if (node.status === "buffering") {
          const nextBuffer = Math.max(0, node.buffer - 1);
          if (nextBuffer <= 0) {
            return { ...node, status: "failed", buffer: 0 };
          }
          return { ...node, buffer: nextBuffer };
        }

        return node;
      });

      const result: Partial<SimulationState> = {
        nodes: recalculateDependents(ticked, state.edges),
      };

      if (inventoryChanged) {
        result.inventory = newInventory;
      }

      return result;
    }),

  // ── Blast / Fail a Node ─────────────────────────────────────────────────
  blastNode: (nodeId) =>
    set((state) => {
      const node = state.nodes.find((n) => n.id === nodeId);
      const newInventory = { ...state.inventory };
      for (const key of Object.keys(newInventory) as ResourceType[]) {
        newInventory[key] = { ...newInventory[key] };
      }

      // If the node was repairing, the deployed resource is lost (wasted)
      // We do NOT return it to inventory — the truck was en route to a node that just exploded

      const failed = state.nodes.map<InfrastructureNode>((n) =>
        n.id === nodeId
          ? { ...n, status: "failed", buffer: 0, rescueTimer: 0, deployedResource: null }
          : n,
      );

      // If the blasted node had a deployed resource and was repairing, resource is wasted
      // (already null'd above, inventory stays depleted)

      return {
        nodes: recalculateDependents(failed, state.edges),
        inventory: newInventory,
        activePresetId: null,
      };
    }),

  // ── Apply Remedy (with inventory & deployment delay) ────────────────────
  applyRemedy: (nodeId, remedyId) =>
    set((state) => {
      const target = state.nodes.find((n) => n.id === nodeId);
      const remedy = REMEDIES_BY_NODE[nodeId]?.find((r) => r.id === remedyId);
      if (!target || !remedy) return {};
      if (target.status !== "buffering" && target.status !== "failed") return {};

      const newInventory = { ...state.inventory };
      for (const key of Object.keys(newInventory) as ResourceType[]) {
        newInventory[key] = { ...newInventory[key] };
      }

      let updatedNodes: InfrastructureNode[];

      if (remedy.effect === "restore") {
        // ── RESTORE: costs a resource, triggers deployment delay ────────
        const resourceType = RESOURCE_MAPPING[nodeId];
        if (!resourceType) return {};

        const slot = newInventory[resourceType];
        if (slot.available <= 0) return {}; // Out of stock!

        // Deduct from inventory
        slot.available -= 1;

        const rescueTime = RESCUE_TIMES[nodeId] ?? 15;

        updatedNodes = state.nodes.map<InfrastructureNode>((n) => {
          if (n.id !== nodeId) return n;
          return {
            ...n,
            status: "repairing",
            buffer: n.status === "failed" ? n.baseBuffer : n.buffer, // if failed, give them full buffer as "emergency restart"
            rescueTimer: rescueTime,
            maxRescueTime: rescueTime,
            deployedResource: resourceType,
          };
        });
      } else {
        // ── BUFFER: instant, no resource cost ──────────────────────────
        updatedNodes = state.nodes.map<InfrastructureNode>((n) => {
          if (n.id !== nodeId) return n;
          return {
            ...n,
            status: "buffering",
            buffer: Math.max(n.buffer, 0) + (remedy.bufferSeconds ?? 0),
          };
        });
      }

      const applied: AppliedRemedy = {
        nodeId,
        assetId: target.assetId,
        nodeLabel: target.label,
        sector: target.sector,
        remedyId: remedy.id,
        remedyLabel: remedy.label,
        cost: remedy.cost,
      };

      return {
        nodes: recalculateDependents(updatedNodes, state.edges),
        inventory: newInventory,
        selectedRemedies: [
          ...state.selectedRemedies.filter((item) => item.nodeId !== nodeId),
          applied,
        ],
        activePresetId: null,
      };
    }),

  // ── Break / Repair Edges ────────────────────────────────────────────────
  breakEdge: (edgeId) =>
    set((state) => {
      const edges = state.edges.map((edge) =>
        edge.id === edgeId ? { ...edge, status: "broken" as EdgeStatus } : edge,
      );
      return { edges, nodes: recalculateDependents(state.nodes, edges), activePresetId: null };
    }),

  repairEdge: (edgeId) =>
    set((state) => {
      const edges = state.edges.map((edge) =>
        edge.id === edgeId ? { ...edge, status: "operational" as EdgeStatus } : edge,
      );
      return { edges, nodes: recalculateDependents(state.nodes, edges), activePresetId: null };
    }),

  // ── Presets & Reset ─────────────────────────────────────────────────────
  applyPreset: (presetId) =>
    set(() => {
      const preset = DISASTER_PRESETS.find((p) => p.id === presetId);
      if (!preset) {
        return {
          nodes: cloneInitialNodes(),
          edges: cloneInitialEdges(),
          inventory: cloneInventory(),
          activePresetId: null,
          selectedRemedies: [],
        };
      }
      const edges = cloneInitialEdges().map((edge) =>
        preset.brokenEdgeIds.includes(edge.id) ? { ...edge, status: "broken" as EdgeStatus } : edge,
      );
      const seededNodes = cloneInitialNodes().map<InfrastructureNode>((node) =>
        preset.failedNodeIds.includes(node.id) ? { ...node, status: "failed", buffer: 0 } : node,
      );
      return {
        edges,
        nodes: recalculateDependents(seededNodes, edges),
        inventory: cloneInventory(),
        activePresetId: preset.id,
        selectedRemedies: [],
      };
    }),

  reset: () =>
    set({
      nodes: cloneInitialNodes(),
      edges: cloneInitialEdges(),
      inventory: cloneInventory(),
      activePresetId: null,
      selectedRemedies: [],
    }),
}));

// ─── Selectors & Helpers ─────────────────────────────────────────────────────

export const getRemediesForNode = (nodeId: string) => REMEDIES_BY_NODE[nodeId] ?? [];
export const getNodeOutDegree = (nodeId: string) => childIdsFor(nodeId).length;
export const getResourceForNode = (nodeId: string): ResourceType | null => RESOURCE_MAPPING[nodeId] ?? null;
export const getRescueTimeForNode = (nodeId: string): number => RESCUE_TIMES[nodeId] ?? 15;

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

export const getStatusLabel = (status: NodeStatus) =>
  ({ operational: "Operational", buffering: "Buffering", repairing: "Deploying", failed: "Failed", recovered: "Recovered" })[status];

// ─── The "What-If" Predictive Engine ─────────────────────────────────────────

/**
 * Pure simulation function that predicts the outcome of deploying to a specific node.
 * Does NOT touch the live game state — operates entirely on cloned data.
 *
 * @param targetNodeId - The node we pretend to deploy our resource to
 * @param currentNodes - Current live node state (will be deep-cloned)
 * @param currentEdges - Current live edge state (will be deep-cloned)
 * @returns Prediction with savedCount, lostCount, impactScore, and affected node IDs
 */
export function simulateOutcome(
  targetNodeId: string,
  currentNodes: InfrastructureNode[],
  currentEdges: DependencyEdge[],
): TriagePrediction {
  // Deep-clone state
  let simNodes = currentNodes.map((n) => ({ ...n }));
  const simEdges = currentEdges.map((e) => ({ ...e }));

  // Pretend we deploy to the target node
  const rescueTime = RESCUE_TIMES[targetNodeId] ?? 15;
  simNodes = simNodes.map((n) => {
    if (n.id !== targetNodeId) return n;
    return {
      ...n,
      status: "repairing" as NodeStatus,
      buffer: n.status === "failed" ? n.baseBuffer : n.buffer,
      rescueTimer: rescueTime,
      maxRescueTime: rescueTime,
    };
  });

  // Record which nodes are currently at-risk (not operational or recovered)
  const atRiskBefore = new Set(
    currentNodes
      .filter((n) => n.status === "buffering" || n.status === "repairing" || n.status === "failed")
      .map((n) => n.id),
  );

  // Fast-forward the simulation to completion (max 300 ticks)
  const MAX_TICKS = 300;
  for (let t = 0; t < MAX_TICKS; t++) {
    let anyActive = false;

    simNodes = simNodes.map((node) => {
      if (node.status === "repairing") {
        anyActive = true;
        const nextBuffer = Math.max(0, node.buffer - 1);
        const nextRescue = Math.max(0, node.rescueTimer - 1);

        if (nextRescue <= 0) {
          return { ...node, status: "recovered" as NodeStatus, buffer: 0, rescueTimer: 0 };
        }
        if (nextBuffer <= 0) {
          return { ...node, status: "failed" as NodeStatus, buffer: 0, rescueTimer: 0, deployedResource: null };
        }
        return { ...node, buffer: nextBuffer, rescueTimer: nextRescue };
      }

      if (node.status === "buffering") {
        anyActive = true;
        const nextBuffer = Math.max(0, node.buffer - 1);
        if (nextBuffer <= 0) {
          return { ...node, status: "failed" as NodeStatus, buffer: 0 };
        }
        return { ...node, buffer: nextBuffer };
      }

      return node;
    });

    // Propagate cascade
    simNodes = recalculateDependents(simNodes, simEdges);

    if (!anyActive) break;
  }

  // Analyze results
  const savedNodes: string[] = [];
  const lostNodes: string[] = [];
  let impactScore = 0;

  for (const node of simNodes) {
    const weight = POPULATION_WEIGHT[node.id] ?? 10000;

    if (node.status === "recovered" || node.status === "operational") {
      if (atRiskBefore.has(node.id)) {
        savedNodes.push(node.id);
      }
    } else if (node.status === "failed") {
      lostNodes.push(node.id);
      impactScore += weight;
    }
  }

  return {
    savedCount: savedNodes.length,
    lostCount: lostNodes.length,
    impactScore,
    affectedNodeIds: lostNodes,
  };
}
