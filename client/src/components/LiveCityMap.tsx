import React, { useState, useRef, useEffect, useMemo } from "react";
import Map, { Source, Layer, Marker } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "geojson";
import { motion } from "framer-motion";
import { useSimulationStore, type InfrastructureNode } from "@/lib/simulationStore";
import { getEdgeRouteCoordinates, getRouteMetadata } from "@/lib/routePolylines";
import { AlertTriangle, Zap, Droplets, Radio, Heart, Shield, Activity, Bomb } from "lucide-react";

// ============================================================================
// Style mappings matching cyberpunk command center aesthetics
// ============================================================================

const COLOR_MAP = {
  operational: "#00FF66",   // Neon Green
  recovered: "#00FF66",     // Neon Green
  buffering: "#FF9900",     // Warning Orange
  failed: "#FF0033",        // Crimson Red
  repairing: "#00E5FF",     // Cyber Cyan
};

const sectorIcons: Record<string, typeof Zap> = {
  POWER: Zap,
  WATER: Droplets,
  COMMS: Radio,
  MOBILITY: Activity,
  HEALTH: Heart,
  CIVIC: Shield,
};

const blastLabels: Record<string, string> = {
  explosion: "BOOM!!",
  flood: "SPLASH!!",
  cyber: "SYSTEM BRICKED!!",
};

interface LiveCityMapProps {
  selectedNodeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
}

interface HoveredEdgeInfo {
  id: string;
  label: string;
  status: string;
  sourceLabel: string;
  targetLabel: string;
  distanceKm: number | null;
  durationMin: number | null;
  corridor: string | null;
}

export default function LiveCityMap({ selectedNodeId, onNodeClick, onEdgeClick }: LiveCityMapProps) {
  const nodes = useSimulationStore((state) => state.nodes);
  const edges = useSimulationStore((state) => state.edges);

  const [cursor, setCursor] = useState<string>("auto");
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdgeInfo | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

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
        // 1. Bomb falls from above for 600ms
        setTimeout(() => {
          setBlasts((prev) =>
            prev.map((b) => (b.id === blast.id ? { ...b, phase: "exploding" } : b))
          );
          // Trigger map shake
          setMapShake(true);
          setTimeout(() => setMapShake(false), 450);

          // 2. Explosion shockwave runs for 800ms
          setTimeout(() => {
            setBlasts((prev) => prev.filter((b) => b.id !== blast.id));
          }, 800);
        }, 600);
      });
    }
  }, [nodes]);

  // Compute GeoJSON features for edges with structured road network polylines
  const edgesGeoJSON = useMemo<FeatureCollection>(() => {
    const features: any[] = [];
    for (const edge of edges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (sourceNode && targetNode) {
        const polylineCoordinates = getEdgeRouteCoordinates(edge.id, sourceNode, targetNode);
        const meta = getRouteMetadata(edge.id);
        features.push({
          type: "Feature",
          id: edge.id,
          geometry: {
            type: "LineString",
            coordinates: polylineCoordinates,
          },
          properties: {
            id: edge.id,
            status: edge.status,
            label: edge.label,
            sourceStatus: sourceNode.status,
            targetStatus: targetNode.status,
            sourceLabel: sourceNode.label,
            targetLabel: targetNode.label,
            distanceKm: meta?.distanceKm ?? null,
            durationMin: meta?.durationMin ?? null,
            corridor: meta?.corridor ?? null,
          },
        });
      }
    }
    return {
      type: "FeatureCollection",
      features,
    };
  }, [edges, nodes]);

  const handleMapClick = (event: any) => {
    const features = event.features;
    if (features && features.length > 0) {
      const clickedFeature = features[0];
      if (
        (clickedFeature.layer?.id === "edges-layer" ||
          clickedFeature.layer?.id === "edges-hitbox" ||
          clickedFeature.layer?.id === "edges-glow") &&
        onEdgeClick
      ) {
        onEdgeClick(clickedFeature.properties?.id);
      }
    }
  };

  const handleMouseMove = (event: any) => {
    const features = event.features;
    if (features && features.length > 0) {
      const firstFeature = features[0];
      if (
        firstFeature.layer?.id === "edges-layer" ||
        firstFeature.layer?.id === "edges-hitbox" ||
        firstFeature.layer?.id === "edges-glow"
      ) {
        const edge = edges.find((e) => e.id === firstFeature.properties?.id);
        if (edge) {
          const sourceNode = nodes.find((n) => n.id === edge.source);
          const targetNode = nodes.find((n) => n.id === edge.target);
          const meta = getRouteMetadata(edge.id);
          setHoveredEdge({
            id: edge.id,
            label: edge.label,
            status: edge.status,
            sourceLabel: sourceNode?.label || edge.source,
            targetLabel: targetNode?.label || edge.target,
            distanceKm: meta?.distanceKm ?? null,
            durationMin: meta?.durationMin ?? null,
            corridor: meta?.corridor ?? null,
          });
          setTooltipPos({ x: event.point.x, y: event.point.y });
          setCursor("pointer");
          return;
        }
      }
    }
    setHoveredEdge(null);
    setTooltipPos(null);
    setCursor("auto");
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  };

  return (
    <div className={`live-gis-map-container relative w-full h-full ${mapShake ? "screenshake-active" : ""}`} style={{ width: "100%", height: "100%", position: "relative" }}>
      <Map
        initialViewState={{
          longitude: 79.075,
          latitude: 21.150,
          zoom: 12.2,
          pitch: 35,
          bearing: -10,
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoveredEdge(null); setTooltipPos(null); setCursor("auto"); }}
        interactiveLayerIds={["edges-hitbox", "edges-layer"]}
        cursor={cursor}
      >
        {/* ── Dependency Edge Lines (Structured Road Network Polylines) ── */}
        <Source id="edges-source" type="geojson" data={edgesGeoJSON}>
          {/* Layer 1A: Wide Cybernetic Glow Aura */}
          <Layer
            id="edges-glow"
            type="line"
            paint={{
              "line-color": [
                "match",
                ["get", "status"],
                "broken",
                "#EF4444",
                ["match", ["get", "sourceStatus"], "failed", "#F97316", "#0284C7"],
              ],
              "line-width": [
                "match",
                ["get", "status"],
                "broken",
                9,
                ["match", ["get", "sourceStatus"], "failed", 7, 5],
              ],
              "line-opacity": 0.45,
              "line-blur": 3.5,
            }}
          />
          {/* Layer 1B: Dark Under-casing */}
          <Layer
            id="edges-casing"
            type="line"
            paint={{
              "line-color": "#09090B",
              "line-width": [
                "match",
                ["get", "status"],
                "broken",
                4.5,
                3.8,
              ],
              "line-opacity": 0.85,
            }}
          />
          {/* Layer 1C: Crisp Core Route Wire */}
          <Layer
            id="edges-layer"
            type="line"
            paint={{
              "line-color": [
                "match",
                ["get", "status"],
                "broken",
                "#EF4444",
                ["match", ["get", "sourceStatus"], "failed", "#FB923C", "#38BDF8"],
              ],
              "line-width": [
                "match",
                ["get", "status"],
                "broken",
                2.8,
                ["match", ["get", "sourceStatus"], "failed", 2.4, 2.0],
              ],
              "line-opacity": 0.98,
            }}
          />
          {/* Layer 1D: Hitbox */}
          <Layer
            id="edges-hitbox"
            type="line"
            paint={{
              "line-color": "#FFFFFF",
              "line-width": 18,
              "line-opacity": 0.001,
            }}
          />
        </Source>

        {/* ── Layer 2: Infrastructure Node Floating Icons (Markers) ── */}
        {nodes.map((node) => {
          const Icon = sectorIcons[node.sector] || Shield;
          const color = COLOR_MAP[node.status] || COLOR_MAP.operational;
          const isSelected = selectedNodeId === node.id;

          return (
            <Marker key={node.id} longitude={node.lng} latitude={node.lat} anchor="center">
              <div
                className={`map-node-marker status-${node.status} relative flex items-center justify-center cursor-pointer`}
                onClick={(e) => {
                  e.stopPropagation();
                  onNodeClick?.(node.id);
                }}
              >
                {/* ── Active Scanning Repair Drone (when deploying) ── */}
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
                    <div className="marker-blast-effect" key={blast.id}>
                      {blast.phase === "dropping" && (
                        <div className="falling-bomb">
                          <Bomb size={16} className="falling-bomb-icon" />
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

                {/* ── Blast Radius Radar Pulse (FAILED status) ── */}
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

                {/* ── Buffering Ripple Indicator (Warning pulses) ── */}
                {node.status === "buffering" && (
                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 44,
                      height: 44,
                      border: `1.5px dashed ${COLOR_MAP.buffering}`,
                    }}
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 10,
                      ease: "linear",
                      repeat: Infinity,
                    }}
                  />
                )}

                {/* ── Base Node Ring ── */}
                <motion.div
                  className="relative flex items-center justify-center rounded-full bg-[#0a0a0c] z-20 shadow-2xl transition-all duration-300"
                  style={{
                    width: 40,
                    height: 40,
                    border: `2px solid ${color}`,
                    boxShadow: isSelected 
                      ? `0 0 15px ${color}, inset 0 0 8px ${color}`
                      : `0 0 6px ${color}40`,
                  }}
                  whileHover={{ scale: 1.12 }}
                >
                  {/* Icon */}
                  <Icon size={15} style={{ color }} />

                  {/* Warning Triangle Sub-badge */}
                  {(node.status === "failed" || node.status === "buffering") && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black border border-amber-500 z-30">
                      <AlertTriangle size={8} className="text-amber-500" />
                    </span>
                  )}
                </motion.div>

                {/* ── Tactical Holographic HUD Labels ── */}
                <div className="absolute top-11 flex flex-col items-center pointer-events-none z-30 opacity-80 transition-opacity">
                  <span 
                    className="px-2 py-0.5 rounded text-[8px] font-bold font-mono tracking-widest bg-black/90 border border-zinc-800 uppercase"
                    style={{ color }}
                  >
                    {node.assetId}
                  </span>
                  
                  {/* Live Timer Overlays */}
                  {node.status === "buffering" && (
                    <span className="mt-1 text-[8px] font-bold text-amber-500 font-mono animate-pulse">
                      BUFF: {formatDuration(node.buffer)}
                    </span>
                  )}
                  {node.status === "repairing" && (
                    <span className="mt-1 text-[8px] font-bold text-[#00E5FF] font-mono">
                      ETA: {formatDuration(node.rescueTimer)}
                    </span>
                  )}
                </div>
              </div>
            </Marker>
          );
        })}
      </Map>

      {/* ── Route Hover Tooltip ── */}
      {hoveredEdge && tooltipPos && (
        <div
          className="map-hover-tooltip route-hover-tooltip"
          style={{
            position: "absolute",
            left: tooltipPos.x + 15,
            top: tooltipPos.y + 15,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <div className="tooltip-header">
            <span className="tooltip-sector">STRUCTURED ROUTE</span>
            <span className={`tooltip-status text-${hoveredEdge.status === "broken" ? "failed" : "operational"}`}>
              {hoveredEdge.status === "broken" ? "RUPTURED" : "OPERATIONAL"}
            </span>
          </div>
          <div className="tooltip-body">
            <strong className="tooltip-title">{hoveredEdge.label}</strong>
            <div className="tooltip-route-path">
              <span>{hoveredEdge.sourceLabel}</span>
              <span className="route-arrow">➔</span>
              <span>{hoveredEdge.targetLabel}</span>
            </div>
            {hoveredEdge.corridor && (
              <div className="tooltip-corridor">{hoveredEdge.corridor}</div>
            )}
            {hoveredEdge.distanceKm !== null && (
              <div className="tooltip-metrics">
                <span>{hoveredEdge.distanceKm} km structured road route</span>
                {hoveredEdge.durationMin !== null && (
                  <span> · ~{hoveredEdge.durationMin} min transit</span>
                )}
              </div>
            )}
            <div className="tooltip-click-hint">Click route to inspect or trigger rupture</div>
          </div>
        </div>
      )}
    </div>
  );
}
