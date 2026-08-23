/**
 * Clinical Cascade Field component: compact asset badges with state-led visual semantics.
 * Each badge remains technical and legible; color is reserved for simulation state.
 */
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Building2, HeartPulse, RadioTower, TrainFront, Zap } from "lucide-react";
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
  failed: "FAILED",
  recovered: "RECOVERED",
};

export default function InfrastructureNode({ data, selected }: NodeProps<InfrastructureFlowNode>) {
  const Icon = iconBySector[data.sector];

  return (
    <div className={`infrastructure-node status-${data.status} ${selected ? "is-selected" : ""}`}>
      <Handle className="node-handle" type="target" position={Position.Left} />
      <div className="node-topline">
        <span className="node-sector"><Icon size={13} strokeWidth={2.4} /> {data.sector}</span>
        <span className="node-state">{nodeStatusLabel[data.status]}</span>
      </div>
      <div className="node-label">{data.label}</div>
      <div className="node-meta-row">
        <span>{data.assetId}</span>
        {data.status === "buffering" ? (
          <span className="node-timer">{formatDuration(data.buffer)}</span>
        ) : (
          <span className="node-dot" aria-hidden="true" />
        )}
      </div>
      <Handle className="node-handle" type="source" position={Position.Right} />
    </div>
  );
}
