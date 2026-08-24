import { create } from "zustand";

// ============================================================================
// 1. TypeScript Interfaces & Types
// ============================================================================

/**
 * Node status enum representing the lifecycle of an infrastructure asset.
 * - HEALTHY: Operating normally, all dependencies intact.
 * - BUFFERING: Parent has failed; consuming backup power/water reserve.
 * - REPAIRING: Crew has been deployed and is transit-locked.
 * - FAILED: Reserves depleted, system is offline and propagating cascades.
 */
export type NodeStatus = "HEALTHY" | "BUFFERING" | "REPAIRING" | "FAILED";

export interface Node {
  id: string;
  label: string;
  sector: "Power" | "Water" | "Telecom" | "Civic";
  status: NodeStatus;
  /** Seconds remaining before buffering node cascades into FAILED state. */
  dangerTimer: number;
  /** Initial buffer duration (in seconds) for backup reserves. */
  baseDangerDuration: number;
  /** Seconds remaining before rescue crew arrives at the node. */
  rescueTimer: number;
  /** Initial crew travel transit time (in seconds). */
  baseRescueDuration: number;
}

export interface Edge {
  id: string;
  source: string; // Parent Node ID
  target: string; // Child Node ID
  label: string;
}

export interface SimInventory {
  crews: number;
  maxCrews: number;
}

export interface TriagePrediction {
  targetNodeId: string;
  savedNodeIds: string[];
  lostNodeIds: string[];
  finalStabilityIndex: number;
}

export interface SimState {
  nodes: Record<string, Node>;
  edges: Edge[];
  inventory: SimInventory;
  
  // ── Actions ──
  /** Increments the simulation state by 1 second. */
  tick: () => void;
  /** Deploys a repair crew to the target node, consuming inventory and starting the rescue timer. */
  deployResource: (nodeId: string) => void;
  /** Runs a pure, non-mutating future BFS simulation to predict outcomes. */
  simulateFuture: (nodeId: string) => TriagePrediction;
  /** Resets the simulation to the initial dataset. */
  reset: () => void;
}

// ============================================================================
// 2. Initial Dataset Configuration ( Nagpur Municipal Topology )
// ============================================================================

const INITIAL_NODES: Record<string, Node> = {
  "power-substation": {
    id: "power-substation",
    label: "Nagpur Central Substation",
    sector: "Power",
    status: "FAILED", // Seeded with failure to start cascade
    dangerTimer: 0,
    baseDangerDuration: 0,
    rescueTimer: 0,
    baseRescueDuration: 20,
  },
  "water-treatment": {
    id: "water-treatment",
    label: "Ambazari Water Treatment Plant",
    sector: "Water",
    status: "HEALTHY",
    dangerTimer: 0,
    baseDangerDuration: 15,
    rescueTimer: 0,
    baseRescueDuration: 15,
  },
  "telecom-hub": {
    id: "telecom-hub",
    label: "Dharampeth Exchange Hub",
    sector: "Telecom",
    status: "HEALTHY",
    dangerTimer: 0,
    baseDangerDuration: 12,
    rescueTimer: 0,
    baseRescueDuration: 10,
  },
  "hospital-icu": {
    id: "hospital-icu",
    label: "Nagpur General Hospital ICU",
    sector: "Civic",
    status: "HEALTHY",
    dangerTimer: 0,
    baseDangerDuration: 30,
    rescueTimer: 0,
    baseRescueDuration: 8,
  },
};

const INITIAL_EDGES: Edge[] = [
  { id: "e-power-water", source: "power-substation", target: "water-treatment", label: "Grid Feed Line" },
  { id: "e-power-telecom", source: "power-substation", target: "telecom-hub", label: "Grid Feed Line" },
  { id: "e-water-hospital", source: "water-treatment", target: "hospital-icu", label: "Critical Water Pipe" },
  { id: "e-telecom-hospital", source: "telecom-hub", target: "hospital-icu", label: "Fiber Uplink" },
];

const INITIAL_INVENTORY: SimInventory = {
  crews: 2,
  maxCrews: 2,
};

// ============================================================================
// 3. Mathematical State Transitions (Pure Graph Calculations)
// ============================================================================

/**
 * Checks if a node has any incoming failed dependency path.
 */
const hasFailedDependencies = (
  nodeId: string,
  nodes: Record<string, Node>,
  edges: Edge[]
): boolean => {
  return edges
    .filter((edge) => edge.target === nodeId)
    .some((edge) => nodes[edge.source]?.status === "FAILED");
};

/**
 * Pure function to calculate state changes based on parent fail-states.
 * Propagates failure cascades through BUFFERING transitions.
 */
const evaluateCascades = (
  nodes: Record<string, Node>,
  edges: Edge[]
): Record<string, Node> => {
  const nextNodes = { ...nodes };
  let changed = false;

  for (const id of Object.keys(nextNodes)) {
    const node = nextNodes[id];
    const isDisrupted = hasFailedDependencies(id, nextNodes, edges);

    if (node.status === "HEALTHY" && isDisrupted) {
      nextNodes[id] = {
        ...node,
        status: "BUFFERING",
        dangerTimer: node.baseDangerDuration,
      };
      changed = true;
    } else if (node.status === "BUFFERING" && !isDisrupted) {
      nextNodes[id] = {
        ...node,
        status: "HEALTHY",
        dangerTimer: 0,
      };
      changed = true;
    }
  }

  // Recurse to handle deep chains (e.g. A failed -> B buffers -> B fails -> C buffers)
  return changed ? evaluateCascades(nextNodes, edges) : nextNodes;
};

// ============================================================================
// 4. Zustand Store Construction
// ============================================================================

export const useSimStore = create<SimState>((set, get) => ({
  nodes: { ...INITIAL_NODES },
  edges: [...INITIAL_EDGES],
  inventory: { ...INITIAL_INVENTORY },

  tick: () =>
    set((state) => {
      const nextNodes = { ...state.nodes };

      for (const id of Object.keys(nextNodes)) {
        const node = { ...nextNodes[id] };

        // ── Case A: Node is under repair ──
        if (node.status === "REPAIRING") {
          node.rescueTimer = Math.max(0, node.rescueTimer - 1);
          node.dangerTimer = Math.max(0, node.dangerTimer - 1);

          // Win Condition: Crew arrived before reserves died
          if (node.rescueTimer === 0) {
            node.status = "HEALTHY";
            node.dangerTimer = 0;
          } 
          // Lose Condition: Reserves ran dry before crew reached
          else if (node.dangerTimer === 0) {
            node.status = "FAILED";
            node.rescueTimer = 0;
          }
        } 
        // ── Case B: Node is buffering on backup reserves ──
        else if (node.status === "BUFFERING") {
          node.dangerTimer = Math.max(0, node.dangerTimer - 1);

          if (node.dangerTimer === 0) {
            node.status = "FAILED";
          }
        }

        nextNodes[id] = node;
      }

      // Propagate cascading outages downstream
      const finalNodes = evaluateCascades(nextNodes, state.edges);

      return { nodes: finalNodes };
    }),

  deployResource: (nodeId) =>
    set((state) => {
      const node = state.nodes[nodeId];
      if (!node) return {};
      
      // Validation: Crew can only deploy to nodes actively in trouble (FAILED or BUFFERING)
      if (node.status !== "FAILED" && node.status !== "BUFFERING") return {};
      // Validation: Must have at least 1 crew member in garage
      if (state.inventory.crews <= 0) return {};

      const nextNodes = { ...state.nodes };
      nextNodes[nodeId] = {
        ...node,
        status: "REPAIRING",
        rescueTimer: node.baseRescueDuration,
        // If FAILED, recharge the buffer to represent backup bootstrap duration
        dangerTimer: node.status === "FAILED" ? node.baseDangerDuration : node.dangerTimer,
      };

      return {
        nodes: evaluateCascades(nextNodes, state.edges),
        inventory: {
          ...state.inventory,
          crews: state.inventory.crews - 1,
        },
      };
    }),

  simulateFuture: (targetNodeId) => {
    const state = get();
    const targetNode = state.nodes[targetNodeId];
    if (!targetNode) {
      return { targetNodeId, savedNodeIds: [], lostNodeIds: [], finalStabilityIndex: 0 };
    }

    // ── Cloned Simulation Setup ──
    let simNodes = JSON.parse(JSON.stringify(state.nodes)) as Record<string, Node>;
    const simEdges = [...state.edges];

    // Simulate deploy resource on clone (costs are ignored during foresight lookahead)
    const nodeInSim = simNodes[targetNodeId];
    simNodes[targetNodeId] = {
      ...nodeInSim,
      status: "REPAIRING",
      rescueTimer: nodeInSim.baseRescueDuration,
      dangerTimer: nodeInSim.status === "FAILED" ? nodeInSim.baseDangerDuration : nodeInSim.dangerTimer,
    };
    simNodes = evaluateCascades(simNodes, simEdges);

    // Snapshot of nodes in danger prior to simulated repair
    const atRiskBefore = new Set(
      Object.values(state.nodes)
        .filter((n) => n.status === "BUFFERING" || n.status === "FAILED")
        .map((n) => n.id)
    );

    // Fast-Forward Tick Loop (Limit simulation to 300 cycles to prevent inf-loops)
    const MAX_CYCLES = 300;
    for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
      let activeOperations = false;
      const nextSimNodes = { ...simNodes };

      for (const id of Object.keys(nextSimNodes)) {
        const node = { ...nextSimNodes[id] };

        if (node.status === "REPAIRING") {
          activeOperations = true;
          node.rescueTimer = Math.max(0, node.rescueTimer - 1);
          node.dangerTimer = Math.max(0, node.dangerTimer - 1);

          if (node.rescueTimer === 0) {
            node.status = "HEALTHY";
            node.dangerTimer = 0;
          } else if (node.dangerTimer === 0) {
            node.status = "FAILED";
            node.rescueTimer = 0;
          }
        } else if (node.status === "BUFFERING") {
          activeOperations = true;
          node.dangerTimer = Math.max(0, node.dangerTimer - 1);

          if (node.dangerTimer === 0) {
            node.status = "FAILED";
          }
        }

        nextSimNodes[id] = node;
      }

      simNodes = evaluateCascades(nextSimNodes, simEdges);

      // Stop when all timers reach terminal states (operational/failed)
      if (!activeOperations) break;
    }

    // ── Analyse Blast Radius Outcome ──
    const savedNodeIds: string[] = [];
    const lostNodeIds: string[] = [];

    for (const id of Object.keys(simNodes)) {
      const node = simNodes[id];
      if (node.status === "HEALTHY") {
        if (atRiskBefore.has(id)) {
          savedNodeIds.push(id);
        }
      } else if (node.status === "FAILED") {
        lostNodeIds.push(id);
      }
    }

    const totalNodesCount = Object.keys(simNodes).length;
    const healthyNodesCount = Object.values(simNodes).filter((n) => n.status === "HEALTHY").length;
    const finalStabilityIndex = totalNodesCount > 0 
      ? Math.round((healthyNodesCount / totalNodesCount) * 100) 
      : 0;

    return {
      targetNodeId,
      savedNodeIds,
      lostNodeIds,
      finalStabilityIndex,
    };
  },

  reset: () =>
    set({
      nodes: { ...INITIAL_NODES },
      edges: [...INITIAL_EDGES],
      inventory: { ...INITIAL_INVENTORY },
    }),
}));
