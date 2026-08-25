/**
 * Pralayaant Simulation Engine v3
 * ─────────────────────────────────
 * Deterministic cascade logic with resource scarcity, dual-timer deployment races,
 * sector-specific interventions, load redistribution overload, traffic ripple delays,
 * live impact analytics, reproducible scenarios, and a pure predictive "what-if" engine.
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
  lng: number;
  lat: number;
  baseBuffer: number;
  buffer: number;
  status: NodeStatus;
  /** Seconds remaining until rescue crew arrives. 0 = no active deployment. */
  rescueTimer: number;
  /** Max rescue time for this node (used to calculate progress bar width). */
  maxRescueTime: number;
  /** Which resource was committed to this node, if any. */
  deployedResource: ResourceType | null;
  /** Maximum operational capacity (MW, kL/hr, Gbps — abstract units). */
  capacity: number;
  /** Current operational load — if currentLoad > capacity, node overheats. */
  currentLoad: number;
};

export type DependencyEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  category?: "POWER" | "WATER" | "COMMS" | "CIVIC";
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

export type HistoryLogItem = {
  id: string;
  timestamp: string;
  nodeId: string;
  nodeLabel: string;
  assetId: string;
  sector: InfrastructureNode["sector"];
  actionType: "SOLUTION" | "BLAST" | "PRESET";
  title: string;
  cost: number;
  bufferSeconds?: number;
  txHash?: string;
  blockchainStatus?: "pending" | "confirmed" | "failed";
};

const getFormattedTimestamp = (): string => {
  return new Date().toLocaleTimeString("en-IN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }) + " IST";
};

export type DisasterPreset = {
  id: "substation-flashover" | "water-main-rupture" | "telecom-blackout" | "seismic-corridor" | "monsoon-flood" | "cyber-attack";
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
  /** Estimated ₹ lost over the simulated future. */
  financialImpact: number;
  /** Max depth of the failure cascade chain. */
  cascadeDepth: number;
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

/** How long (in seconds) rescue takes for each node (base time, before traffic multiplier). */
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
export const POPULATION_WEIGHT: Record<string, number> = {
  "power-substation": 120000,
  "water-treatment": 85000,
  "telecom-exchange": 60000,
  "metro-signals": 40000,
  "booster-pumps": 30000,
  "hospital-icu": 50000,
  "emergency-dispatch": 35000,
  "fire-station": 25000,
};

/** Economic cost per hour when each node is offline (₹). */
export const ECONOMIC_COST_PER_HOUR: Record<string, number> = {
  "power-substation": 5000000,
  "water-treatment": 2500000,
  "telecom-exchange": 3500000,
  "metro-signals": 1800000,
  "booster-pumps": 800000,
  "hospital-icu": 4200000,
  "emergency-dispatch": 1500000,
  "fire-station": 900000,
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
  { id: "e-power-water", source: "power-substation", target: "water-treatment", label: "High-Voltage Power Feed", category: "POWER", status: "operational" },
  { id: "e-power-comms", source: "power-substation", target: "telecom-exchange", label: "Telecom Power Feed", category: "POWER", status: "operational" },
  { id: "e-water-pumps", source: "water-treatment", target: "booster-pumps", label: "Treated Water Pipeline", category: "WATER", status: "operational" },
  { id: "e-pumps-hospital", source: "booster-pumps", target: "hospital-icu", label: "Emergency Water Supply", category: "WATER", status: "operational" },
  { id: "e-comms-mobility", source: "telecom-exchange", target: "metro-signals", label: "Metro Signal Fiber Link", category: "COMMS", status: "operational" },
  { id: "e-comms-dispatch", source: "telecom-exchange", target: "emergency-dispatch", label: "Emergency Voice & Data Trunk", category: "COMMS", status: "operational" },
  { id: "e-dispatch-fire", source: "emergency-dispatch", target: "fire-station", label: "Fire Dispatch Signal", category: "CIVIC", status: "operational" },
];

const INITIAL_NODES: InfrastructureNode[] = [
  { id: "power-substation", assetId: "PWR-01", label: "Hingna Power Substation", sector: "POWER", x: 95, y: 360, lng: 79.0305, lat: 21.1302, baseBuffer: 0, buffer: 0, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null, capacity: 100, currentLoad: 82 },
  { id: "water-treatment", assetId: "WTR-11", label: "Gorewada Water Treatment Plant", sector: "WATER", x: 390, y: 90, lng: 79.0432, lat: 21.1824, baseBuffer: 55, buffer: 55, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null, capacity: 80, currentLoad: 58 },
  { id: "telecom-exchange", assetId: "COM-07", label: "Sadar Telecom Exchange", sector: "COMMS", x: 320, y: 555, lng: 79.0768, lat: 21.1534, baseBuffer: 65, buffer: 65, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null, capacity: 70, currentLoad: 52 },
  { id: "metro-signals", assetId: "MOB-03", label: "Sitabuldi Metro Signal Grid", sector: "MOBILITY", x: 145, y: 705, lng: 79.0831, lat: 21.1448, baseBuffer: 40, buffer: 40, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null, capacity: 60, currentLoad: 45 },
  { id: "booster-pumps", assetId: "WTR-14", label: "Seminary Hills Booster Pumps", sector: "WATER", x: 735, y: 180, lng: 79.0634, lat: 21.1685, baseBuffer: 35, buffer: 35, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null, capacity: 50, currentLoad: 38 },
  { id: "hospital-icu", assetId: "HLT-02", label: "GMCH Nagpur ICU", sector: "HEALTH", x: 670, y: 405, lng: 79.0984, lat: 21.1278, baseBuffer: 80, buffer: 80, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null, capacity: 90, currentLoad: 74 },
  { id: "emergency-dispatch", assetId: "CIV-09", label: "Civil Lines Dispatch Centre", sector: "CIVIC", x: 1075, y: 245, lng: 79.0792, lat: 21.1561, baseBuffer: 60, buffer: 60, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null, capacity: 65, currentLoad: 50 },
  { id: "fire-station", assetId: "CIV-21", label: "Ganjipeth Fire Station", sector: "CIVIC", x: 915, y: 650, lng: 79.1025, lat: 21.1472, baseBuffer: 45, buffer: 45, status: "operational", rescueTimer: 0, maxRescueTime: 0, deployedResource: null, capacity: 55, currentLoad: 42 },
];

export const REMEDIES_BY_SECTOR: Record<string, RemedyOption[]> = {
  POWER: [
    { id: "p-aux-battery", label: "Auxiliary Battery Bank", cost: 45000, effect: "buffer", bufferSeconds: 60 },
    { id: "p-diesel-gen", label: "Emergency Diesel Generator", cost: 150000, effect: "buffer", bufferSeconds: 180 },
    { id: "p-grid-bypass", label: "Substation Grid Feed Bypass", cost: 350000, effect: "buffer", bufferSeconds: 400 },
  ],
  WATER: [
    { id: "w-aux-valve", label: "Auxiliary Pressure Valve", cost: 30000, effect: "buffer", bufferSeconds: 60 },
    { id: "w-tanker-fleet", label: "Emergency Water Tanker Fleet", cost: 110000, effect: "buffer", bufferSeconds: 185 },
    { id: "w-bypass-conduit", label: "Treatment Plant Bypass Conduit", cost: 280000, effect: "buffer", bufferSeconds: 420 },
  ],
  HEALTH: [
    { id: "h-oxygen-reserves", label: "Local Oxygen Reserves", cost: 25000, effect: "buffer", bufferSeconds: 60 },
    { id: "h-mobile-icu", label: "Mobile ICU Care Units", cost: 130000, effect: "buffer", bufferSeconds: 190 },
    { id: "h-microgrid-engage", label: "Emergency Microgrid Engage", cost: 320000, effect: "buffer", bufferSeconds: 450 },
  ],
  MOBILITY: [
    { id: "m-traffic-wardens", label: "Manual Traffic Wardens", cost: 15000, effect: "buffer", bufferSeconds: 50 },
    { id: "m-signal-packs", label: "Portable Signal Power Packs", cost: 85000, effect: "buffer", bufferSeconds: 170 },
    { id: "m-transit-rerouting", label: "Automated Transit Rerouting", cost: 220000, effect: "buffer", bufferSeconds: 380 },
  ],
  COMMS: [
    { id: "c-bandwidth-throttling", label: "Channel Bandwidth Throttling", cost: 20000, effect: "buffer", bufferSeconds: 60 },
    { id: "c-microwave-rerouting", label: "Microwave Link Rerouting", cost: 95000, effect: "buffer", bufferSeconds: 180 },
    { id: "c-satellite-backhaul", label: "Satellite Backhaul Uplink", cost: 260000, effect: "buffer", bufferSeconds: 410 },
  ],
  CIVIC: [
    { id: "v-reserve-staff", label: "Reserve Dispatch Staff", cost: 18000, effect: "buffer", bufferSeconds: 55 },
    { id: "v-command-center", label: "Mobile Command Center", cost: 105000, effect: "buffer", bufferSeconds: 175 },
    { id: "v-mutual-aid", label: "Mutual Aid Cross-Agency Link", cost: 250000, effect: "buffer", bufferSeconds: 390 },
  ],
};

export const DISASTER_PRESETS: DisasterPreset[] = [
  { id: "substation-flashover", code: "P-01", label: "Substation flashover", effect: "power loss", failedNodeIds: ["power-substation"], brokenEdgeIds: [] },
  { id: "water-main-rupture", code: "W-02", label: "Water main rupture", effect: "2 routes lost", failedNodeIds: [], brokenEdgeIds: ["e-water-pumps", "e-pumps-hospital"] },
  { id: "telecom-blackout", code: "C-03", label: "Telecom blackout", effect: "relay outage", failedNodeIds: ["telecom-exchange"], brokenEdgeIds: [] },
  { id: "seismic-corridor", code: "X-04", label: "Seismic corridor", effect: "compound strike", failedNodeIds: ["power-substation"], brokenEdgeIds: ["e-comms-mobility"] },
  { id: "monsoon-flood", code: "F-05", label: "2026 Monsoon Flood", effect: "multi-sector", failedNodeIds: ["booster-pumps", "metro-signals"], brokenEdgeIds: ["e-water-pumps", "e-pumps-hospital"] },
  { id: "cyber-attack", code: "C-06", label: "Cyber Attack", effect: "comms blackout", failedNodeIds: ["telecom-exchange"], brokenEdgeIds: ["e-comms-mobility", "e-comms-dispatch"] },
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

// ─── Traffic Ripple Effect ───────────────────────────────────────────────────

/**
 * Computes the city-wide traffic delay multiplier.
 * If a critical transit/power node is FAILED → 2.5× gridlock.
 * If buffering/repairing → 1.5× congestion.
 */
const computeTrafficMultiplier = (nodes: InfrastructureNode[]): number => {
  const power = nodes.find((n) => n.id === "power-substation");
  const metro = nodes.find((n) => n.id === "metro-signals");
  if (power?.status === "failed" || metro?.status === "failed") return 2.5;
  if (
    power?.status === "buffering" || power?.status === "repairing" ||
    metro?.status === "buffering" || metro?.status === "repairing"
  ) return 1.5;
  return 1.0;
};

// ─── Cascade Depth Calculator ────────────────────────────────────────────────

/**
 * Computes the maximum cascade depth: longest chain from a root failure
 * to any downstream affected node.
 */
const computeCascadeDepth = (nodes: InfrastructureNode[], edges: DependencyEdge[]): number => {
  const nonOp = new Set(
    nodes
      .filter((n) => n.status !== "operational" && n.status !== "recovered")
      .map((n) => n.id),
  );
  if (nonOp.size === 0) return 0;

  let maxDepth = 0;
  for (const node of nodes) {
    if (!nonOp.has(node.id)) continue;
    // Is this a root? (no non-operational parent)
    const parentIds = edges.filter((e) => e.target === node.id).map((e) => e.source);
    const isRoot = parentIds.length === 0 || parentIds.every((p) => !nonOp.has(p));
    if (!isRoot) continue;

    const queue: [string, number][] = [[node.id, 1]];
    const visited = new Set([node.id]);
    while (queue.length) {
      const [id, depth] = queue.shift()!;
      maxDepth = Math.max(maxDepth, depth);
      for (const edge of edges) {
        if (edge.source === id && !visited.has(edge.target) && nonOp.has(edge.target)) {
          visited.add(edge.target);
          queue.push([edge.target, depth + 1]);
        }
      }
    }
  }
  return maxDepth;
};

// ─── Overload Redistribution Helper ──────────────────────────────────────────

/**
 * When nodes fail, redistribute their load to sibling nodes
 * (other targets of the same parents in the dependency graph).
 * If a sibling exceeds capacity, it enters an overload buffering state.
 */
const applyOverloadRedistribution = (
  nodes: InfrastructureNode[],
  edges: DependencyEdge[],
  newlyFailedIds: string[],
): InfrastructureNode[] => {
  if (newlyFailedIds.length === 0) return nodes;

  const loadMap = new Map(nodes.map((n) => [n.id, n.currentLoad]));

  for (const failedId of newlyFailedIds) {
    const failedLoad = loadMap.get(failedId) ?? 0;
    if (failedLoad <= 0) continue;

    // Find parents (upstream sources)
    const parentIds = edges
      .filter((e) => e.target === failedId)
      .map((e) => e.source);

    // Find siblings: other targets of the same parents
    const siblingIds = new Set<string>();
    for (const pid of parentIds) {
      edges
        .filter((e) => e.source === pid && e.target !== failedId)
        .forEach((e) => siblingIds.add(e.target));
    }

    const activeSiblingIds = Array.from(siblingIds).filter((sid) => {
      const sib = nodes.find((n) => n.id === sid);
      return sib && sib.status !== "failed";
    });

    if (activeSiblingIds.length > 0) {
      const loadShare = failedLoad / activeSiblingIds.length;
      for (const sid of activeSiblingIds) {
        loadMap.set(sid, (loadMap.get(sid) ?? 0) + loadShare);
      }
    }
    loadMap.set(failedId, 0);
  }

  // Apply load changes and trigger overload states
  return nodes.map((node) => {
    const newLoad = loadMap.get(node.id) ?? node.currentLoad;
    if (newLoad === node.currentLoad) return node;

    const isOverloaded = newLoad > node.capacity;
    if (isOverloaded && node.status === "operational") {
      // Overload → forced into buffering with 10s overheat timer
      return { ...node, currentLoad: newLoad, status: "buffering" as NodeStatus, buffer: 10 };
    }
    if (isOverloaded && node.status === "buffering") {
      // Already buffering → cap remaining buffer at 10s (overheat pressure)
      return { ...node, currentLoad: newLoad, buffer: Math.min(node.buffer, 10) };
    }
    return { ...node, currentLoad: newLoad };
  });
};

// ─── Store Type ──────────────────────────────────────────────────────────────

type SimulationState = {
  nodes: InfrastructureNode[];
  edges: DependencyEdge[];
  inventory: CityInventory;
  activePresetId: DisasterPreset["id"] | null;
  selectedRemedies: AppliedRemedy[];
  history: HistoryLogItem[];
  // ── Live Impact Analytics ──
  cityTrafficMultiplier: number;
  totalPeopleAffected: number;
  totalFinancialLoss: number;
  cascadeDepth: number;
  peakFailedCount: number;
  // ── Actions ──
  tick: () => void;
  blastNode: (nodeId: string) => void;
  applyRemedy: (nodeId: string, remedyId: string) => void;
  breakEdge: (edgeId: string) => void;
  repairEdge: (edgeId: string) => void;
  applyPreset: (presetId: DisasterPreset["id"]) => void;
  reset: () => void;
  updateHistoryTxHash: (historyId: string, txHash: string, blockchainStatus?: "pending" | "confirmed" | "failed") => void;
};

// ─── Store Implementation ────────────────────────────────────────────────────

export const useSimulationStore = create<SimulationState>((set) => ({
  nodes: cloneInitialNodes(),
  edges: cloneInitialEdges(),
  inventory: cloneInventory(),
  activePresetId: null,
  selectedRemedies: [],
  history: [],
  cityTrafficMultiplier: 1.0,
  totalPeopleAffected: 0,
  totalFinancialLoss: 0,
  cascadeDepth: 0,
  peakFailedCount: 0,

  // ── The Dual-Timer Tick Loop (with overload + scoreboard) ───────────────
  tick: () =>
    set((state) => {
      let inventoryChanged = false;
      const newInventory = { ...state.inventory };
      for (const key of Object.keys(newInventory) as ResourceType[]) {
        newInventory[key] = { ...newInventory[key] };
      }

      // Track which nodes were failed before this tick
      const previouslyFailedIds = new Set(
        state.nodes.filter((n) => n.status === "failed").map((n) => n.id),
      );

      // ── Main timer processing ──────────────────────────────────────────
      let ticked = state.nodes.map<InfrastructureNode>((node) => {
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

      // ── Overload Redistribution for newly failed nodes ─────────────────
      const newlyFailedIds = ticked
        .filter((n) => n.status === "failed" && !previouslyFailedIds.has(n.id) && n.currentLoad > 0)
        .map((n) => n.id);

      if (newlyFailedIds.length > 0) {
        ticked = applyOverloadRedistribution(ticked, state.edges, newlyFailedIds);
      }

      // ── Recalculate dependents (cascade propagation) ───────────────────
      ticked = recalculateDependents(ticked, state.edges);

      // ── Compute traffic multiplier ─────────────────────────────────────
      const cityTrafficMultiplier = computeTrafficMultiplier(ticked);

      // ── Accumulate scoreboard (impact calculation) ──────────────────────
      let totalPeopleAffected = 0;
      let totalFinancialLoss = state.totalFinancialLoss;
      let currentFailedCount = 0;
      for (const node of ticked) {
        if (node.status === "failed") {
          currentFailedCount++;
          // Only calculate population at risk when HEALTH or CIVIC nodes burst out / fail
          if (node.sector === "HEALTH" || node.sector === "CIVIC") {
            totalPeopleAffected += POPULATION_WEIGHT[node.id] ?? 0;
          }
          totalFinancialLoss += (ECONOMIC_COST_PER_HOUR[node.id] ?? 0) / 3600;
        }
      }
      const peakFailedCount = Math.max(state.peakFailedCount, currentFailedCount);
      const cascadeDepth = computeCascadeDepth(ticked, state.edges);

      const result: Partial<SimulationState> = {
        nodes: ticked,
        cityTrafficMultiplier,
        totalPeopleAffected,
        totalFinancialLoss,
        cascadeDepth,
        peakFailedCount,
      };

      if (inventoryChanged) {
        result.inventory = newInventory;
      }

      return result;
    }),

  // ── Blast / Fail a Node (with overload redistribution) ──────────────────
  blastNode: (nodeId) =>
    set((state) => {
      const newInventory = { ...state.inventory };
      for (const key of Object.keys(newInventory) as ResourceType[]) {
        newInventory[key] = { ...newInventory[key] };
      }

      // If the node was repairing, the deployed resource is lost (wasted)
      // We do NOT return it to inventory — the truck was en route to a node that just exploded

      let failed = state.nodes.map<InfrastructureNode>((n) =>
        n.id === nodeId
          ? { ...n, status: "failed", buffer: 0, rescueTimer: 0, deployedResource: null }
          : n,
      );

      // ── Overload redistribution from the blasted node ──────────────────
      const blastedNode = state.nodes.find((n) => n.id === nodeId);
      if (blastedNode && blastedNode.currentLoad > 0) {
        failed = applyOverloadRedistribution(failed, state.edges, [nodeId]);
      }

      const blastHistoryLog: HistoryLogItem | null = blastedNode ? {
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: getFormattedTimestamp(),
        nodeId,
        nodeLabel: blastedNode.label,
        assetId: blastedNode.assetId,
        sector: blastedNode.sector,
        actionType: "BLAST",
        title: "Manual Disruption (Blast)",
        cost: 0,
      } : null;

      return {
        nodes: recalculateDependents(failed, state.edges),
        inventory: newInventory,
        activePresetId: null,
        history: blastHistoryLog ? [blastHistoryLog, ...state.history] : state.history,
      };
    }),

  applyRemedy: (nodeId, remedyId) =>
    set((state) => {
      const target = state.nodes.find((n) => n.id === nodeId);
      if (!target) return {};
      const remedy = REMEDIES_BY_SECTOR[target.sector]?.find((r) => r.id === remedyId);
      if (!remedy) return {};
      if (target.status !== "buffering" && target.status !== "failed") return {};

      const newInventory = { ...state.inventory };
      for (const key of Object.keys(newInventory) as ResourceType[]) {
        newInventory[key] = { ...newInventory[key] };
      }

      // Transition target node back from failure or buffer to appropriate active state
      const updatedNodes = state.nodes.map<InfrastructureNode>((n) => {
        if (n.id !== nodeId) return n;
        
        const isDisrupted = hasIncomingDisruption(n, state.nodes, state.edges);
        const newStatus = isDisrupted ? "buffering" : "recovered";

        return {
          ...n,
          status: newStatus as NodeStatus,
          buffer: Math.max(0, n.buffer) + (remedy.bufferSeconds ?? 0),
        };
      });

      const applied: AppliedRemedy = {
        nodeId,
        assetId: target.assetId,
        nodeLabel: target.label,
        sector: target.sector,
        remedyId: remedy.id,
        remedyLabel: remedy.label,
        cost: remedy.cost,
      };

      const appliedHistoryLog: HistoryLogItem = {
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: getFormattedTimestamp(),
        nodeId,
        nodeLabel: target.label,
        assetId: target.assetId,
        sector: target.sector,
        actionType: "SOLUTION",
        title: remedy.label,
        cost: remedy.cost,
        bufferSeconds: target.status === "buffering" ? remedy.bufferSeconds : undefined,
      };

      return {
        nodes: recalculateDependents(updatedNodes, state.edges),
        inventory: newInventory,
        selectedRemedies: [
          ...state.selectedRemedies.filter((item) => item.nodeId !== nodeId),
          applied,
        ],
        history: [appliedHistoryLog, ...state.history],
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

  // ── Presets & Reset (with scoreboard reset) ─────────────────────────────
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
          cityTrafficMultiplier: 1.0,
          totalPeopleAffected: 0,
          totalFinancialLoss: 0,
          cascadeDepth: 0,
          peakFailedCount: 0,
        };
      }
      const edges = cloneInitialEdges().map((edge) =>
        preset.brokenEdgeIds.includes(edge.id) ? { ...edge, status: "broken" as EdgeStatus } : edge,
      );
      const seededNodes = cloneInitialNodes().map<InfrastructureNode>((node) =>
        preset.failedNodeIds.includes(node.id) ? { ...node, status: "failed", buffer: 0, currentLoad: 0 } : node,
      );

      // Apply overload from initially failed nodes
      const failedWithLoad = preset.failedNodeIds.filter((nid) => {
        const orig = INITIAL_NODES.find((n) => n.id === nid);
        return orig && orig.currentLoad > 0;
      });

      let finalNodes = recalculateDependents(seededNodes, edges);
      if (failedWithLoad.length > 0) {
        finalNodes = applyOverloadRedistribution(finalNodes, edges, failedWithLoad);
        finalNodes = recalculateDependents(finalNodes, edges);
      }

      let totalPeopleAffected = 0;
      for (const node of finalNodes) {
        if (node.status === "failed" && (node.sector === "HEALTH" || node.sector === "CIVIC")) {
          totalPeopleAffected += POPULATION_WEIGHT[node.id] ?? 0;
        }
      }

      return {
        edges,
        nodes: finalNodes,
        inventory: cloneInventory(),
        activePresetId: preset.id,
        selectedRemedies: [],
        history: [],
        cityTrafficMultiplier: computeTrafficMultiplier(finalNodes),
        totalPeopleAffected,
        totalFinancialLoss: 0,
        cascadeDepth: computeCascadeDepth(finalNodes, edges),
        peakFailedCount: finalNodes.filter((n) => n.status === "failed").length,
      };
    }),

  reset: () =>
    set({
      nodes: cloneInitialNodes(),
      edges: cloneInitialEdges(),
      inventory: cloneInventory(),
      activePresetId: null,
      selectedRemedies: [],
      history: [],
      cityTrafficMultiplier: 1.0,
      totalPeopleAffected: 0,
      totalFinancialLoss: 0,
      cascadeDepth: 0,
      peakFailedCount: 0,
    }),

  updateHistoryTxHash: (historyId, txHash, blockchainStatus = "confirmed") =>
    set((state) => ({
      history: state.history.map((item) =>
        item.id === historyId ? { ...item, txHash, blockchainStatus } : item
      ),
    })),
}));

// ─── Selectors & Helpers ─────────────────────────────────────────────────────

export const getRemediesForNode = (nodeId: string) => {
  const node = useSimulationStore.getState().nodes.find(n => n.id === nodeId);
  if (!node) return [];
  return REMEDIES_BY_SECTOR[node.sector] ?? [];
};
export const getNodeOutDegree = (nodeId: string) => childIdsFor(nodeId).length;
export const getResourceForNode = (nodeId: string): ResourceType | null => RESOURCE_MAPPING[nodeId] ?? null;
export const getRescueTimeForNode = (nodeId: string): number => RESCUE_TIMES[nodeId] ?? 15;

/** Returns effective rescue time accounting for the current traffic multiplier. */
export const getEffectiveRescueTime = (nodeId: string): number => {
  const mult = useSimulationStore.getState().cityTrafficMultiplier;
  return Math.ceil((RESCUE_TIMES[nodeId] ?? 15) * mult);
};

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

// ─── The "What-If" Predictive Engine (Enhanced) ──────────────────────────────

/**
 * Pure simulation function that predicts the outcome of deploying to a specific node.
 * Does NOT touch the live game state — operates entirely on cloned data.
 * Now includes traffic multiplier, overload redistribution, and financial impact.
 *
 * @param targetNodeId - The node we pretend to deploy our resource to
 * @param currentNodes - Current live node state (will be deep-cloned)
 * @param currentEdges - Current live edge state (will be deep-cloned)
 * @returns Enhanced prediction with financial impact and cascade depth
 */
export function simulateOutcome(
  targetNodeId: string,
  currentNodes: InfrastructureNode[],
  currentEdges: DependencyEdge[],
): TriagePrediction {
  // Deep-clone state
  let simNodes = currentNodes.map((n) => ({ ...n }));
  const simEdges = currentEdges.map((e) => ({ ...e }));

  // Compute traffic multiplier for sim context
  const trafficMult = computeTrafficMultiplier(simNodes);

  // Pretend we deploy to the target node (with traffic-adjusted rescue time)
  const rescueTime = Math.ceil((RESCUE_TIMES[targetNodeId] ?? 15) * trafficMult);
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

  let totalFinancialImpact = 0;

  // Fast-forward the simulation to completion (max 300 ticks)
  const MAX_TICKS = 300;
  for (let t = 0; t < MAX_TICKS; t++) {
    let anyActive = false;
    const prevFailedIds = new Set(simNodes.filter((n) => n.status === "failed").map((n) => n.id));

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

    // Overload redistribution for newly failed nodes in the sim
    const simNewlyFailed = simNodes
      .filter((n) => n.status === "failed" && !prevFailedIds.has(n.id) && n.currentLoad > 0)
      .map((n) => n.id);
    if (simNewlyFailed.length > 0) {
      simNodes = applyOverloadRedistribution(simNodes, simEdges, simNewlyFailed);
    }

    // Propagate cascade
    simNodes = recalculateDependents(simNodes, simEdges);

    // Accumulate financial impact per simulated second
    for (const node of simNodes) {
      if (node.status === "failed") {
        totalFinancialImpact += (ECONOMIC_COST_PER_HOUR[node.id] ?? 0) / 3600;
      }
    }

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
    financialImpact: totalFinancialImpact,
    cascadeDepth: computeCascadeDepth(simNodes, simEdges),
  };
}

// ─── Export / Load Scenario Helpers ──────────────────────────────────────────

/**
 * Exports the current simulation state as a JSON "After-Action Report" and triggers a download.
 */
export function exportAfterActionReport() {
  const state = useSimulationStore.getState();
  const report = {
    meta: {
      title: "Pralayaant After-Action Report",
      exportedAt: new Date().toISOString(),
      simulationEngine: "v3",
    },
    scenario: {
      activePresetId: state.activePresetId,
    },
    state: {
      nodes: state.nodes,
      edges: state.edges,
      inventory: state.inventory,
    },
    scoreboard: {
      totalPeopleAffected: state.totalPeopleAffected,
      totalFinancialLoss: state.totalFinancialLoss,
      cascadeDepth: state.cascadeDepth,
      peakFailedCount: state.peakFailedCount,
      cityTrafficMultiplier: state.cityTrafficMultiplier,
    },
    remedies: state.selectedRemedies,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pralayaant-report-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Loads a previously exported scenario JSON and restores the simulation state.
 * Returns true if the load was successful.
 */
export function loadScenarioFromJSON(json: unknown): boolean {
  const data = json as Record<string, unknown>;
  if (!data?.state) return false;
  const stateData = data.state as Record<string, unknown>;
  if (!Array.isArray(stateData.nodes) || !Array.isArray(stateData.edges)) return false;

  const scoreboard = (data.scoreboard ?? {}) as Record<string, number>;
  const scenario = (data.scenario ?? {}) as Record<string, string | null>;

  useSimulationStore.setState({
    nodes: stateData.nodes as InfrastructureNode[],
    edges: stateData.edges as DependencyEdge[],
    inventory: (stateData.inventory as CityInventory) ?? cloneInventory(),
    activePresetId: (scenario.activePresetId as DisasterPreset["id"]) ?? null,
    selectedRemedies: (data.remedies as AppliedRemedy[]) ?? [],
    totalPeopleAffected: scoreboard.totalPeopleAffected ?? 0,
    totalFinancialLoss: scoreboard.totalFinancialLoss ?? 0,
    cascadeDepth: scoreboard.cascadeDepth ?? 0,
    peakFailedCount: scoreboard.peakFailedCount ?? 0,
    cityTrafficMultiplier: scoreboard.cityTrafficMultiplier ?? 1.0,
  });
  return true;
}
