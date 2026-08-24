import React, { useState, useRef, useEffect, useMemo } from "react";
import MapGL, { Marker, useMap } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion, AnimatePresence } from "framer-motion";
import { useSimulationStore } from "@/lib/simulationStore";
import { getRouteMetadata, getEdgeRouteCoordinates } from "@/lib/routePolylines";
import { Zap, Droplets, Radio, Heart, Shield, Activity, Bomb, AlertTriangle, CheckCircle2, X } from "lucide-react";

// ============================================================================
// Style mappings matching GitHub Dark Neumorphic aesthetic
// ============================================================================

const COLOR_MAP = {
  operational: "#3fb950",    // GitHub Green
  recovered: "#3fb950",      // GitHub Green
  buffering: "#d29922",      // GitHub Amber
  failed: "#f85149",         // GitHub Red
  repairing: "#58a6ff",      // GitHub Blue
};

const sectorIcons: Record<string, typeof Zap> = {
  POWER: Zap,
  WATER: Droplets,
  COMMS: Radio,
  MOBILITY: Activity,
  HEALTH: Heart,
  CIVIC: Shield,
};

// ── Connector Categories with Tailored Colors ──
const CONNECTOR_CATEGORIES: Record<string, { label: string; color: string; brokenColor: string }> = {
  POWER: {
    label: "Power Grid Line",
    color: "#e3b341", // Amber Gold
    brokenColor: "#f85149",
  },
  WATER: {
    label: "Water Supply Pipeline",
    color: "#38bdf8", // Sky Blue
    brokenColor: "#f85149",
  },
  COMMS: {
    label: "Telecom Fiber Uplink",
    color: "#a371f7", // Purple Fiber
    brokenColor: "#f85149",
  },
  CIVIC: {
    label: "Emergency Dispatch Link",
    color: "#3fb950", // Green Dispatch
    brokenColor: "#f85149",
  },
};

const blastLabels: Record<string, string> = {
  explosion: "BOOM!!",
  flood: "SPLASH!!",
  cyber: "SYSTEM BRICKED!!",
};

interface LiveCityMapProps {
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
}

// ============================================================================
// ── Zero-Latency Direct-DOM SVG Overlay (60fps Sync with MapLibre) ──
// ============================================================================
const DirectSvgEdgesOverlay = ({
  setPinnedEdgeId,
  setHoveredEdgeId,
  hoveredEdgeId,
  pinnedEdgeId,
  mousePos,
  setPinnedPos
}: {
  setPinnedEdgeId: (id: string) => void;
  setHoveredEdgeId: (id: string | null) => void;
  hoveredEdgeId: string | null;
  pinnedEdgeId: string | null;
  mousePos: { x: number; y: number };
  setPinnedPos: (pos: { x: number; y: number } | null) => void;
}) => {
  const { current: map } = useMap();
  const edges = useSimulationStore((state) => state.edges);
  const nodes = useSimulationStore((state) => state.nodes);

  const svgRef = useRef<SVGSVGElement>(null);
  const pathsRef = useRef<Map<string, SVGPathElement>>(new Map());
  const invisibleHitboxesRef = useRef<Map<string, SVGPathElement>>(new Map());
  const arrowHeadsRef = useRef<Map<string, SVGPolygonElement>>(new Map());

  useEffect(() => {
    if (!map || !svgRef.current) return;

    // Sync SVG paths with MapLibre's camera exactly on the 'render' frame
    const updatePaths = () => {
      const mapWidth = map.getContainer().clientWidth;
      const mapHeight = map.getContainer().clientHeight;

      edges.forEach((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (!sourceNode || !targetNode) return;

        // Project start and end positions to screen pixels
        const p1 = map.project([sourceNode.lng, sourceNode.lat]);
        const p2 = map.project([targetNode.lng, targetNode.lat]);

        let pathData = "";
        let arrowX = p2.x;
        let arrowY = p2.y;
        let angle = 0;
        let isFullyOffscreen = false;

        // Helper to clamp values to prevent browser layout dropouts at high zoom
        const clampX = (val: number) => Math.max(-5000, Math.min(5000, val));
        const clampY = (val: number) => Math.max(-5000, Math.min(5000, val));

        if (edge.category === "COMMS") {
          // ── TELECOM: Road & Route Street Aligned Polyline ──
          const routeCoords = getEdgeRouteCoordinates(edge.id, sourceNode, targetNode);
          const projected = routeCoords.map((coord) => map.project(coord));

          // Check if at least one segment falls near the screen viewport
          const hasAnyOnScreen = projected.some(
            (p) => p.x >= -300 && p.x <= mapWidth + 300 && p.y >= -300 && p.y <= mapHeight + 300
          );

          if (hasAnyOnScreen && projected.length >= 2) {
            pathData = `M ${clampX(projected[0].x)} ${clampY(projected[0].y)} ` +
              projected.slice(1).map((p) => `L ${clampX(p.x)} ${clampY(p.y)}`).join(" ");

            // Arrow calculation at the final segment ending at Target
            const last = projected[projected.length - 1];
            const prev = projected[projected.length - 2];
            const dx = last.x - prev.x;
            const dy = last.y - prev.y;
            angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const dist = Math.sqrt(dx * dx + dy * dy);
            const offsetRatio = Math.max(0, dist - 25) / (dist || 1); // 25px offset from node
            arrowX = prev.x + dx * offsetRatio;
            arrowY = prev.y + dy * offsetRatio;
          } else {
            isFullyOffscreen = true;
          }
        } else {
          // ── OTHERS (Power, Water, Civic): Represented as beautiful curved lines ──
          // Midpoint
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          
          // Perpendicular offset based on line bearing
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const offset = len * 0.12; // Curving depth

          // Deterministic curve direction based on ID to avoid straight overlaps
          const curveSign = edge.id.charCodeAt(0) % 2 === 0 ? 1 : -1;
          const cx = clampX(midX + (dy / (len || 1)) * offset * curveSign);
          const cy = clampY(midY - (dx / (len || 1)) * offset * curveSign);

          const startX = clampX(p1.x);
          const startY = clampY(p1.y);
          const endX = clampX(p2.x);
          const endY = clampY(p2.y);

          // Quadratic Bezier Curve Path: starts at p1, curves toward control point (cx, cy), ends at p2
          pathData = `M ${startX} ${startY} Q ${cx} ${cy} ${endX} ${endY}`;

          // Check viewport visibility
          const isBetween = (
            (startX >= -300 && startX <= mapWidth + 300 && startY >= -300 && startY <= mapHeight + 300) ||
            (endX >= -300 && endX <= mapWidth + 300 && endY >= -300 && endY <= mapHeight + 300)
          );
          if (!isBetween) {
            isFullyOffscreen = true;
          }

          // Arrow calculation tangent to the curve's end (vector from control point to end point)
          const adx = endX - cx;
          const ady = endY - cy;
          angle = Math.atan2(ady, adx) * (180 / Math.PI);
          const adist = Math.sqrt(adx * adx + ady * ady);
          const offsetRatio = Math.max(0, adist - 25) / (adist || 1);
          arrowX = cx + adx * offsetRatio;
          arrowY = cy + ady * offsetRatio;
        }

        if (!isFullyOffscreen && pathData) {
          // Update visible path
          const pathLine = pathsRef.current.get(edge.id);
          if (pathLine) {
            pathLine.setAttribute("d", pathData);
            pathLine.style.display = "";
          }

          // Update invisible wide hitbox
          const pathHitbox = invisibleHitboxesRef.current.get(edge.id);
          if (pathHitbox) {
            pathHitbox.setAttribute("d", pathData);
            pathHitbox.style.display = "";
          }

          // Update Outer Glow
          const pathGlow = pathsRef.current.get(`${edge.id}-glow`);
          if (pathGlow) {
            pathGlow.setAttribute("d", pathData);
            pathGlow.style.display = "";
          }
        } else {
          // Hide completely if offscreen
          const pathLine = pathsRef.current.get(edge.id);
          if (pathLine) pathLine.style.display = "none";

          const pathHitbox = invisibleHitboxesRef.current.get(edge.id);
          if (pathHitbox) pathHitbox.style.display = "none";

          const pathGlow = pathsRef.current.get(`${edge.id}-glow`);
          if (pathGlow) pathGlow.style.display = "none";
        }

        // Update Arrow Head (Target Direction)
        const arrow = arrowHeadsRef.current.get(edge.id);
        if (arrow) {
          const isTargetOnScreen = p2.x >= 0 && p2.x <= mapWidth && p2.y >= 0 && p2.y <= mapHeight;
          if (!isFullyOffscreen && isTargetOnScreen) {
            arrow.setAttribute("transform", `translate(${clampX(arrowX)}, ${clampY(arrowY)}) rotate(${angle})`);
            arrow.style.display = "";
          } else {
            arrow.style.display = "none";
          }
        }
      });
    };

    map.on("render", updatePaths);
    updatePaths(); // run once immediately

    return () => {
      map.off("render", updatePaths);
    };
  }, [map, edges, nodes]);

  return (
    <svg
      ref={svgRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 10, // above base map, below nodes
        overflow: "visible", // prevent browser rendering clipping
      }}
    >
      <defs>
        <style>
          {`
            @keyframes flow-dash {
              to {
                stroke-dashoffset: -12;
              }
            }
            .moving-flow-line {
              animation: flow-dash 0.9s linear infinite;
            }
            .broken-flow-line {
              animation: none;
            }
          `}
        </style>
      </defs>

      {edges.map((edge) => {
        const categoryKey = (edge.category || "POWER") as keyof typeof CONNECTOR_CATEGORIES;
        const catInfo = CONNECTOR_CATEGORIES[categoryKey] || CONNECTOR_CATEGORIES.POWER;
        const color = edge.status === "broken" ? catInfo.brokenColor : catInfo.color;
        const isHoveredOrPinned = hoveredEdgeId === edge.id || pinnedEdgeId === edge.id;

        return (
          <g key={edge.id} className="edge-group">
            {/* Outer Glow (Visible when active/hovered) */}
            <path
              ref={(el) => { if (el) pathsRef.current.set(`${edge.id}-glow`, el); }}
              stroke={color}
              strokeWidth={isHoveredOrPinned ? 8 : 0}
              strokeOpacity={0.2}
              strokeLinecap="round"
              fill="none"
              style={{ transition: "stroke-width 0.2s ease" }}
            />

            {/* Core Dotted Moving Line (Subtler Opacity & Seamless Speed) */}
            <path
              ref={(el) => { if (el) pathsRef.current.set(edge.id, el); }}
              stroke={color}
              strokeWidth={2.4}
              strokeOpacity={0.55}
              strokeDasharray="6 6"
              fill="none"
              className={edge.status === "broken" ? "broken-flow-line" : "moving-flow-line"}
            />

            {/* Arrow Head (Target Direction) */}
            <polygon
              ref={(el) => { if (el) arrowHeadsRef.current.set(edge.id, el); }}
              points="-8,-5 2,0 -8,5"
              fill={color}
              fillOpacity={0.7}
            />

            {/* Wide Invisible Hitbox for easy clicking/hovering */}
            <path
              ref={(el) => { if (el) invisibleHitboxesRef.current.set(edge.id, el); }}
              stroke="transparent"
              strokeWidth={30}
              fill="none"
              style={{ pointerEvents: "auto", cursor: "pointer" }}
              onMouseEnter={() => setHoveredEdgeId(edge.id)}
              onMouseLeave={() => setHoveredEdgeId(null)}
              onClick={(e) => {
                e.stopPropagation();
                setPinnedEdgeId(edge.id);
                setPinnedPos({ x: mousePos.x, y: mousePos.y });
              }}
            />
          </g>
        );
      })}
    </svg>
  );
};

export default function LiveCityMap({ selectedNodeId, selectedEdgeId, onNodeClick, onEdgeClick }: LiveCityMapProps) {
  const nodes = useSimulationStore((state) => state.nodes);
  const edges = useSimulationStore((state) => state.edges);
  const breakEdge = useSimulationStore((state) => state.breakEdge);
  const repairEdge = useSimulationStore((state) => state.repairEdge);

  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [pinnedEdgeId, setPinnedEdgeId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pinnedPos, setPinnedPos] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync prop selectedEdgeId if passed
  useEffect(() => {
    if (selectedEdgeId) {
      setPinnedEdgeId(selectedEdgeId);
    }
  }, [selectedEdgeId]);

  // Notify parent on pin
  useEffect(() => {
    if (pinnedEdgeId && onEdgeClick) {
      onEdgeClick(pinnedEdgeId);
    }
  }, [pinnedEdgeId, onEdgeClick]);

  // Track mouse coordinates on hover relative to the container
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // ── Blast Disruption Animations State ──
  interface BlastInstance {
    id: string;
    nodeId: string;
    type: "explosion" | "flood" | "cyber";
    phase: "dropping" | "exploding";
  }
  const [blasts, setBlasts] = useState<BlastInstance[]>([]);
  const [mapShake, setMapShake] = useState(false);
  const prevStatuses = useRef<Record<string, string>>({});

  useEffect(() => {
    const newBlasts: BlastInstance[] = [];
    nodes.forEach((node) => {
      const prev = prevStatuses.current[node.id];
      if (prev && prev !== "failed" && node.status === "failed") {
        let type: BlastInstance["type"] = "explosion";
        const presetId = useSimulationStore.getState().activePresetId;
        
        if (presetId === "monsoon-flood") {
          type = "flood";
        } else if (presetId === "cyber-attack" || node.sector === "COMMS") {
          type = "cyber";
        } else if (node.sector === "WATER") {
          type = "flood";
        }
        
        newBlasts.push({
          id: `${node.id}-${Date.now()}-${Math.random()}`,
          nodeId: node.id,
          type,
          phase: "dropping",
        });
      }
      prevStatuses.current[node.id] = node.status;
    });

    if (newBlasts.length > 0) {
      setBlasts((prev) => [...prev, ...newBlasts]);

      newBlasts.forEach((blast) => {
        setTimeout(() => {
          setBlasts((prev) =>
            prev.map((b) => (b.id === blast.id ? { ...b, phase: "exploding" } : b))
          );
          setMapShake(true);
          setTimeout(() => setMapShake(false), 450);

          setTimeout(() => {
            setBlasts((prev) => prev.filter((b) => b.id !== blast.id));
          }, 800);
        }, 600);
      });
    }
  }, [nodes]);

  const activeEdgeDetail = useMemo(() => {
    const edgeId = pinnedEdgeId || hoveredEdgeId;
    if (!edgeId) return null;
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return null;

    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    const meta = getRouteMetadata(edge.id);
    const categoryKey = (edge.category || "POWER") as keyof typeof CONNECTOR_CATEGORIES;
    const catInfo = CONNECTOR_CATEGORIES[categoryKey] || CONNECTOR_CATEGORIES.POWER;

    return {
      id: edge.id,
      label: edge.label,
      category: categoryKey,
      categoryLabel: catInfo.label,
      categoryColor: catInfo.color,
      status: edge.status,
      sourceLabel: sourceNode?.label || edge.source,
      targetLabel: targetNode?.label || edge.target,
      distanceKm: meta?.distanceKm ?? null,
      durationMin: meta?.durationMin ?? null,
      corridor: meta?.corridor ?? null,
    };
  }, [pinnedEdgeId, hoveredEdgeId, edges, nodes]);

  // Compute position of the popup card to track cursor but clamp to bounds
  const activePos = useMemo(() => {
    const pos = pinnedEdgeId && pinnedPos ? pinnedPos : mousePos;
    const mapWidth = containerRef.current?.clientWidth || window.innerWidth;
    const mapHeight = containerRef.current?.clientHeight || window.innerHeight;

    let x = pos.x + 15;
    let y = pos.y + 15;

    // Card dimensions ~320px width, ~240px height
    if (x + 330 > mapWidth) {
      x = pos.x - 330;
    }
    if (y + 240 > mapHeight) {
      y = pos.y - 240;
    }
    if (x < 10) x = 10;
    if (y < 10) y = 10;

    return { x, y };
  }, [pinnedEdgeId, pinnedPos, mousePos]);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`live-gis-map-container relative w-full h-full ${mapShake ? "screenshake-active" : ""}`}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <MapGL
        initialViewState={{
          longitude: 79.075,
          latitude: 21.150,
          zoom: 12.2,
          pitch: 35,
          bearing: -10,
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        onClick={(e) => {
          const target = e.originalEvent?.target as HTMLElement;
          if (target && (target.tagName === "CANVAS" || target.classList.contains("maplibregl-canvas"))) {
            setPinnedEdgeId(null);
            setPinnedPos(null);
          }
        }}
      >
        {/* ── High-Performance SVG Edges Overlay ── */}
        <DirectSvgEdgesOverlay 
          setPinnedEdgeId={setPinnedEdgeId} 
          setHoveredEdgeId={setHoveredEdgeId} 
          hoveredEdgeId={hoveredEdgeId}
          pinnedEdgeId={pinnedEdgeId}
          mousePos={mousePos}
          setPinnedPos={setPinnedPos}
        />

        {/* ── Layer 2: Infrastructure Node Floating Icons (Markers) ── */}
        {nodes.map((node) => {
          const Icon = sectorIcons[node.sector] || Shield;
          const color = COLOR_MAP[node.status] || COLOR_MAP.operational;

          return (
            <Marker key={node.id} longitude={node.lng} latitude={node.lat} anchor="center" style={{ zIndex: 20 }}>
              <div
                className={`map-node-marker status-${node.status} relative flex items-center justify-center cursor-pointer`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNodeClick) onNodeClick(node.id);
                }}
              >
                {/* ── Active Scanning Repair Drone ── */}
                {node.status === "repairing" && (
                  <div className="marker-drone-hover">
                    <Radio size={14} className="drone-icon" />
                    <div className="drone-scan-laser" />
                  </div>
                )}

                {/* ── Dynamic Blast & Disruption Animations ── */}
                {blasts
                  .filter((b) => b.nodeId === node.id)
                  .map((blast) => (
                    <div key={blast.id} className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
                      {blast.phase === "dropping" && (
                        <div className="falling-bomb">
                          <Bomb size={24} className="falling-bomb-icon" />
                          <div className="bomb-trail" />
                        </div>
                      )}

                      {blast.phase === "exploding" && (
                        <>
                          <div className={`blast-ring ${blast.type === "flood" ? "flood-ripple" : blast.type === "cyber" ? "cyber-glitch" : ""}`} />
                          <div className={`blast-flash ${blast.type === "flood" ? "flood-flash" : blast.type === "cyber" ? "cyber-flash" : ""}`} />
                          <div className="blast-text-pop">{blastLabels[blast.type]}</div>
                          {Array.from({ length: 8 }).map((_, i) => (
                            <div
                              key={i}
                              className={`blast-spark ${blast.type === "flood" ? "flood-drop" : blast.type === "cyber" ? "cyber-bit" : ""}`}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  ))}

                {/* ── Blast Radius Radar Pulse ── */}
                {node.status === "failed" && (
                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 50,
                      height: 50,
                      border: `2px solid ${COLOR_MAP.failed}`,
                      background: "radial-gradient(circle, rgba(255, 0, 51, 0.2) 0%, transparent 70%)",
                    }}
                    initial={{ scale: 1, opacity: 0.8 }}
                    animate={{ scale: 4, opacity: 0 }}
                    transition={{
                      duration: 2.2,
                      ease: "easeOut",
                      repeat: Infinity,
                    }}
                  />
                )}

                {/* ── Buffering Ripple Indicator ── */}
                {node.status === "buffering" && (
                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 40,
                      height: 40,
                      border: `2px solid ${COLOR_MAP.buffering}`,
                      background: "radial-gradient(circle, rgba(210, 153, 34, 0.2) 0%, transparent 70%)",
                    }}
                    initial={{ scale: 1, opacity: 0.7 }}
                    animate={{ scale: 2.2, opacity: 0 }}
                    transition={{
                      duration: 1.6,
                      ease: "easeOut",
                      repeat: Infinity,
                    }}
                  />
                )}

                {/* Main Neumorphic Node Capsule */}
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all bg-[#0d1117]"
                  style={{
                    boxShadow: selectedNodeId === node.id
                      ? `0 0 16px ${color}, inset 3px 3px 6px #040609, inset -3px -3px 6px #161b22`
                      : '4px 4px 10px #040609, -4px -4px 10px #161b22',
                    border: `2px solid ${color}`,
                  }}
                >
                  <Icon size={18} style={{ color }} />
                </div>

                {/* Label below node */}
                <div className="absolute top-11 flex flex-col items-center pointer-events-none z-30 opacity-90 transition-opacity">
                  <span className="text-[11px] font-bold text-[#ffffff] whitespace-nowrap px-1.5 py-0.5 rounded-md bg-[#0d1117]" style={{ boxShadow: '2px 2px 4px #040609' }}>
                    {node.label}
                  </span>
                  {node.status === "buffering" && (
                    <span className="text-[9px] font-extrabold text-[#d29922] font-mono animate-pulse">
                      BUFF: {formatDuration(node.buffer)}
                    </span>
                  )}
                </div>
              </div>
            </Marker>
          );
        })}
      </MapGL>

      {/* ── Static Map Legend Index Box (Fixed at Bottom of Map Canvas) ── */}
      <div className="absolute bottom-3 left-4 z-40 p-3 rounded-xl bg-[#0d1117]/95 border border-[#30363d] shadow-[6px_6px_14px_#040609] backdrop-blur-md flex flex-col gap-2 max-w-[340px] text-xs select-none">
        <div className="flex items-center justify-between border-b border-[#21262d] pb-1">
          <span className="font-extrabold text-[#c9d1d9] tracking-wide text-[11px] uppercase">Infrastructure Legend</span>
          <span className="text-[10px] text-[#8b949e] font-mono">Nagpur Grid</span>
        </div>

        {/* Sector Node Logos Index */}
        <div>
          <span className="text-[10px] font-bold text-[#8b949e] uppercase block mb-1">Asset Nodes</span>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-[#c9d1d9]">
              <Zap size={12} className="text-[#e3b341]" />
              <span>Power</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-[#c9d1d9]">
              <Droplets size={12} className="text-[#38bdf8]" />
              <span>Water</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-[#c9d1d9]">
              <Radio size={12} className="text-[#a371f7]" />
              <span>Telecom</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-[#c9d1d9]">
              <Activity size={12} className="text-[#38bdf8]" />
              <span>Mobility</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-[#c9d1d9]">
              <Heart size={12} className="text-[#f85149]" />
              <span>Health</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-[#c9d1d9]">
              <Shield size={12} className="text-[#3fb950]" />
              <span>Civic</span>
            </div>
          </div>
        </div>

        {/* Connector Category Lines Index */}
        <div className="border-t border-[#21262d] pt-1.5">
          <span className="text-[10px] font-bold text-[#8b949e] uppercase block mb-1">Connector Categories</span>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#c9d1d9]">
              <div className="w-3.5 h-[2px] border-b-2 border-dashed border-[#e3b341]" />
              <span>Power Grid</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#c9d1d9]">
              <div className="w-3.5 h-[2px] border-b-2 border-dashed border-[#38bdf8]" />
              <span>Water Supply</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#c9d1d9]">
              <div className="w-3.5 h-[2px] border-b-2 border-dashed border-[#a371f7]" />
              <span>Telecom Uplink</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#c9d1d9]">
              <div className="w-3.5 h-[2px] border-b-2 border-dashed border-[#3fb950]" />
              <span>Emergency Link</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#f85149] col-span-2">
              <div className="w-3.5 h-[2px] border-b-2 border-dashed border-[#f85149]" />
              <span>Ruptured / Damaged Line</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Dynamic Floating Connection Control Card (Locks at cursor position) ── */}
      <AnimatePresence>
        {activeEdgeDetail && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: "absolute",
              left: activePos.x,
              top: activePos.y,
              zIndex: 50,
            }}
            className="p-4 rounded-2xl bg-[#0d1117]/95 border border-[#30363d] shadow-[8px_8px_20px_#040609] backdrop-blur-md min-w-[310px] max-w-[340px] text-xs pointer-events-auto"
          >
            <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeEdgeDetail.categoryColor }} />
                <span className="font-extrabold text-[11px] text-[#8b949e] uppercase tracking-wider">
                  {activeEdgeDetail.categoryLabel}
                </span>
              </div>
              <button
                onClick={() => {
                  setPinnedEdgeId(null);
                  setPinnedPos(null);
                }}
                className="p-1 rounded-lg hover:bg-[#21262d] text-[#8b949e] hover:text-[#ffffff] transition-all cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-2.5">
              <strong className="text-base font-black text-[#ffffff] block">
                {activeEdgeDetail.label}
              </strong>

              <div className="mt-2 p-2.5 rounded-xl bg-[#161b22] border border-[#21262d] flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-[#8b949e]">Status:</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${activeEdgeDetail.status === "broken" ? "bg-[#f85149]/20 text-[#f85149] border border-[#f85149]/40" : "bg-[#3fb950]/20 text-[#3fb950] border border-[#3fb950]/40"}`}>
                    {activeEdgeDetail.status === "broken" ? "Ruptured / Offline" : "Operational / Active"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-bold mt-1">
                  <span className="text-[#58a6ff]">Head: {activeEdgeDetail.sourceLabel}</span>
                  <span className="text-[#3fb950] font-black">➔</span>
                  <span className="text-[#3fb950]">Tail: {activeEdgeDetail.targetLabel}</span>
                </div>

                {activeEdgeDetail.corridor && (
                  <div className="text-[11px] text-[#8b949e] mt-0.5">{activeEdgeDetail.corridor}</div>
                )}
              </div>

              {/* Direct Rupture / Repair Action Controls */}
              <div className="mt-3">
                {activeEdgeDetail.status === "broken" ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      repairEdge(activeEdgeDetail.id);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl font-black text-xs text-[#ffffff] bg-[#238636] hover:bg-[#2ea043] flex items-center justify-center gap-2 transition-all shadow-[3px_3px_6px_#040609] cursor-pointer"
                  >
                    <CheckCircle2 size={15} />
                    <span>Repair & Reconnect Line</span>
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      breakEdge(activeEdgeDetail.id);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl font-black text-xs text-[#ffffff] bg-[#da3633] hover:bg-[#b82a28] flex items-center justify-center gap-2 transition-all shadow-[3px_3px_6px_#040609] cursor-pointer"
                  >
                    <AlertTriangle size={15} />
                    <span>Rupture / Disrupt Connection</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
