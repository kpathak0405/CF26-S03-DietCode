/**
 * Infrastructure Node component v2
 * ─────────────────────────────────
 * Compact asset badge with dual-progress-bar system:
 * - Danger bar (red/amber): drains as backup battery depletes
 * - Rescue bar (blue): fills as deployment crew approaches
 * Color is reserved for live simulation state only.
 */
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Building2, HeartPulse, RadioTower, TrainFront, Truck, Zap } from "lucide-react";
import type { InfrastructureNode, NodeStatus } from "@/lib/simulationStore";

export type InfrastructureFlowNode = Node<InfrastructureNode, "infrastructure">;

const iconBySector = {
  POWER: Zap,
  WATER: Building2,
  HEALTH: HeartPulse,
  MOBILITY: TrainFront,
  COMMS: RadioTower,
  CIVIC: Building2,
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};

const nodeStatusLabel: Record<NodeStatus, string> = {
  operational: "ONLINE",
  buffering: "BUFFER",
  repairing: "DEPLOYING",
  failed: "FAILED",
  recovered: "RECOVERED",
};

export default function InfrastructureNodeComponent({ data, selected }: NodeProps<InfrastructureFlowNode>) {
  const Icon = iconBySector[data.sector];

  const showDangerBar = data.status === "buffering" || data.status === "repairing";
  const showRescueBar = data.status === "repairing";

  const dangerPercent = data.baseBuffer > 0 ? (data.buffer / data.baseBuffer) * 100 : 0;
  const rescuePercent = data.maxRescueTime > 0 ? ((data.maxRescueTime - data.rescueTimer) / data.maxRescueTime) * 100 : 0;

  return (
    <div className={`infrastructure-node status-${data.status} ${selected ? "is-selected" : ""}`}>
      <Handle className="node-handle" type="target" position={Position.Left} />

      <div className="node-topline">
        <span className="node-sector"><Icon size={13} strokeWidth={2.4} /> {data.sector}</span>
        <span className="node-state">{nodeStatusLabel[data.status]}</span>
      </div>

      <div className="node-label">{data.label}</div>

      {/* ── Dual Progress Bar System ──────────────────────────────────── */}
      {showDangerBar && (
        <div className="node-progress-track">
          <div
            className="node-progress-bar danger-bar"
            style={{ width: `${Math.max(0, Math.min(100, dangerPercent))}%` }}
          />
          {showRescueBar && (
            <div
              className="node-progress-bar rescue-bar"
              style={{ width: `${Math.max(0, Math.min(100, rescuePercent))}%` }}
            />
          )}
        </div>
      )}

      <div className="node-meta-row">
        <span>{data.assetId}</span>
        {data.status === "buffering" ? (
          <span className="node-timer">{formatDuration(data.buffer)}</span>
        ) : data.status === "repairing" ? (
          <span className="node-timer-dual">
            <span className="timer-danger">{formatDuration(data.buffer)}</span>
            <Truck size={10} strokeWidth={2.2} className="timer-truck-icon" />
            <span className="timer-rescue">{formatDuration(data.rescueTimer)}</span>
          </span>
        ) : (
          <span className="node-dot" aria-hidden="true" />
        )}
      </div>

      <Handle className="node-handle" type="source" position={Position.Right} />
    </div>
  );
}
