import React, { useState, useMemo, useEffect } from "react";
import Map, { Source, Layer, Marker, type MapMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, Polygon, Point } from "geojson";
import { useSimulationStore, type InfrastructureNode } from "@/lib/simulationStore";
import { Clock3, Truck, AlertTriangle, Zap, Droplets, Radio, Heart, Shield, Activity } from "lucide-react";

const sectorIcons: Record<string, typeof Zap> = {
  POWER: Zap,
  WATER: Droplets,
  COMMS: Radio,
  MOBILITY: Activity,
  HEALTH: Heart,
  CIVIC: Shield,
};

// Safe wrappers using raw React.createElement to prevent Vite JSX parser from injecting data-loc attributes
const SafeSource = (props: any) => {
  const { "data-loc": _, ...rest } = props;
  return React.createElement(Source, rest);
};

const SafeLayer = (props: any) => {
  const { "data-loc": _, ...rest } = props;
  return React.createElement(SafeLayerWrapper, rest);
};

// Sub-wrapper to discard data-loc from Layer element
const SafeLayerWrapper = (props: any) => {
  const { "data-loc": _, ...rest } = props;
  return React.createElement(Layer, rest);
};

interface LiveCityMapProps {
  onNodeClick: (nodeId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
}

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};

/**
 * Calculates a circle polygon for Mapbox GeoJSON Source representation
 */
function getCirclePolygon(lng: number, lat: number, radiusInMeters: number): Feature<Polygon> {
  const coordinates = [];
  const steps = 64;
  const km = radiusInMeters / 1000;

  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * (2 * Math.PI);
    const dx = km * Math.cos(theta);
    const dy = km * Math.sin(theta);
    // 1 degree latitude = ~111.32 km
    const latOffset = dy / 111.32;
    // 1 degree longitude = ~111.32 * cos(latitude) km
    const lngOffset = dx / (111.32 * Math.cos((lat * Math.PI) / 180));
    coordinates.push([lng + lngOffset, lat + latOffset]);
  }
  coordinates.push(coordinates[0]);

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [coordinates],
    },
    properties: {},
  };
}

export default function LiveCityMap({ onNodeClick, onEdgeClick }: LiveCityMapProps) {
  const nodes = useSimulationStore((state) => state.nodes);
  const edges = useSimulationStore((state) => state.edges);

  const [cursor, setCursor] = useState<string>("auto");
  const [hoveredNode, setHoveredNode] = useState<InfrastructureNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [pulseRadius, setPulseRadius] = useState<number>(300);

  // Pulse animation loop for failed node hazard zones
  useEffect(() => {
    let direction = 1;
    const interval = setInterval(() => {
      setPulseRadius((prev) => {
        let next = prev + direction * 12;
        if (next >= 850) {
          direction = -1;
          return 850;
        }
        if (next <= 250) {
          direction = 1;
          return 250;
        }
        return next;
      });
    }, 45);
    return () => clearInterval(interval);
  }, []);


  // Compute GeoJSON features for edges (connections)
  const edgesGeoJSON = useMemo<FeatureCollection>(() => {
    const features: Feature[] = [];
    for (const edge of edges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (sourceNode && targetNode) {
        features.push({
          type: "Feature",
          id: edge.id,
          geometry: {
            type: "LineString",
            coordinates: [
              [sourceNode.lng, sourceNode.lat],
              [targetNode.lng, targetNode.lat],
            ],
          },
          properties: {
            id: edge.id,
            status: edge.status,
            label: edge.label,
            sourceStatus: sourceNode.status,
            targetStatus: targetNode.status,
          },
        });
      }
    }
    return {
      type: "FeatureCollection",
      features,
    };
  }, [edges, nodes]);

  // Compute GeoJSON features for failed nodes (pulsing hazard blast zones)
  const blastZonesGeoJSON = useMemo<FeatureCollection>(() => {
    const failed = nodes.filter((node) => node.status === "failed");
    return {
      type: "FeatureCollection",
      features: failed.map((node) => {
        const poly = getCirclePolygon(node.lng, node.lat, pulseRadius);
        return {
          ...poly,
          properties: {
            nodeId: node.id,
          },
        };
      }),
    };
  }, [nodes, pulseRadius]);

  const handleMapClick = (event: MapMouseEvent) => {
    const features = event.features;
    if (features && features.length > 0) {
      const clickedFeature = features[0];
      if (clickedFeature.layer?.id === "nodes-layer") {
        onNodeClick(clickedFeature.properties?.id);
      } else if (clickedFeature.layer?.id === "edges-layer" && onEdgeClick) {
        onEdgeClick(clickedFeature.properties?.id);
      }
    }
  };

  const handleMouseMove = (event: MapMouseEvent) => {
    const features = event.features;
    if (features && features.length > 0) {
      const firstFeature = features[0];
      if (firstFeature.layer?.id === "nodes-layer") {
        const node = nodes.find((n) => n.id === firstFeature.properties?.id);
        if (node) {
          setHoveredNode(node);
          setTooltipPos({ x: event.point.x, y: event.point.y });
          setCursor("pointer");
          return;
        }
      }
    }
    setHoveredNode(null);
    setTooltipPos(null);
    setCursor("auto");
  };

  const handleMouseLeave = () => {
    setHoveredNode(null);
    setTooltipPos(null);
    setCursor("auto");
  };

  return (
    <div className="live-gis-map-container" style={{ width: "100%", height: "100%", position: "relative" }}>
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
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={["edges-layer"]}
        cursor={cursor}
      >
        {/* ── Dependency Edge Lines (Neon Glow Layer) ── */}
        <SafeSource id="edges-source" type="geojson" data={edgesGeoJSON}>
          {/* Background Glow */}
          <SafeLayer
            id="edges-glow"
            type="line"
            paint={{
              "line-color": [
                "match",
                ["get", "status"],
                "broken",
                "#EF4444",
                ["match", ["get", "sourceStatus"], "failed", "#EF4444", "#3B82F6"],
              ],
              "line-width": [
                "match",
                ["get", "status"],
                "broken",
                8,
                ["match", ["get", "sourceStatus"], "failed", 6, 4],
              ],
              "line-opacity": 0.35,
              "line-blur": 3,
            }}
          />
          {/* Core Line */}
          <SafeLayer
            id="edges-layer"
            type="line"
            paint={{
              "line-color": [
                "match",
                ["get", "status"],
                "broken",
                "#EF4444",
                ["match", ["get", "sourceStatus"], "failed", "#F87171", "#3B82F6"],
              ],
              "line-width": [
                "match",
                ["get", "status"],
                "broken",
                3,
                ["match", ["get", "sourceStatus"], "failed", 2.5, 1.5],
              ],
              "line-dasharray": ["match", ["get", "status"], "broken", ["literal", [3, 2]], ["literal", [1, 0]]],
              "line-opacity": 0.95,
            }}
          />
        </SafeSource>

        {/* ── Layer 2: Pulsing Red Hazard Blast Zones ── */}
        <SafeSource id="blast-source" type="geojson" data={blastZonesGeoJSON}>
          <SafeLayer
            id="blast-layer"
            type="fill"
            paint={{
              "fill-color": "#EF4444",
              "fill-opacity": 0.18,
              "fill-outline-color": "#EF4444",
            }}
          />
        </SafeSource>

        {/* ── Layer 3: Infrastructure Node Floating Icons (Markers) ── */}
        {nodes.map((node) => {
          const Icon = sectorIcons[node.sector] || Shield;
          return (
            <Marker key={node.id} longitude={node.lng} latitude={node.lat} anchor="center">
              <div
                className={`map-node-marker status-${node.status}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onNodeClick(node.id);
                }}
              >
                {/* Logo circle */}
                <div className="marker-circle">
                  <Icon size={16} className="marker-icon" />
                  
                  {/* Warning triangle badge when failed */}
                  {node.status === "failed" && (
                    <div className="marker-warning-badge">
                      <AlertTriangle size={8} />
                    </div>
                  )}
                </div>

                {/* Info and counters */}
                <div className="marker-info">
                  <div className="marker-id">{node.assetId}</div>

                  {/* Micro Progress Bar overlay (when buffering or repairing) */}
                  {(node.status === "buffering" || node.status === "repairing") && (
                    <div className="marker-mini-progress">
                      <div className="mini-track">
                        <div
                          className="mini-bar danger"
                          style={{ width: `${(node.buffer / node.baseBuffer) * 100}%` }}
                        />
                      </div>
                      {node.status === "repairing" && (
                        <div className="mini-track">
                          <div
                            className="mini-bar rescue"
                            style={{ width: `${(1 - node.rescueTimer / node.maxRescueTime) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timer Badge overlays */}
                  {node.status === "buffering" && (
                    <div className="marker-timer danger-text">{formatDuration(node.buffer)}</div>
                  )}
                  {node.status === "repairing" && (
                    <div className="marker-timer rescue-text">
                      <Truck size={8} className="marker-truck-icon" style={{ display: 'inline', marginRight: 2 }} />
                      <span>{formatDuration(node.rescueTimer)}</span>
                    </div>
                  )}
                  {node.status === "failed" && (
                    <div className="marker-timer danger-text">OFFLINE</div>
                  )}
                </div>
              </div>
            </Marker>
          );
        })}
      </Map>

      {/* ── Hover Tooltip (follows cursor on screen coordinate) ── */}
      {hoveredNode && tooltipPos && (
        <div
          className="map-hover-tooltip"
          style={{
            position: "absolute",
            left: tooltipPos.x + 15,
            top: tooltipPos.y + 15,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <div className="tooltip-header">
            <span className="tooltip-sector">{hoveredNode.sector}</span>
            <span className={`tooltip-status text-${hoveredNode.status}`}>{hoveredNode.status.toUpperCase()}</span>
          </div>
          <div className="tooltip-body">
            <strong className="tooltip-title">{hoveredNode.label}</strong>
            <div className="tooltip-asset-id">{hoveredNode.assetId}</div>

            {/* Countdown meters inside tooltip */}
            {hoveredNode.status === "buffering" && (
              <div className="tooltip-countdown warning">
                <Clock3 size={12} />
                <span>BATTERY: {formatDuration(hoveredNode.buffer)}</span>
              </div>
            )}

            {hoveredNode.status === "repairing" && (
              <div className="tooltip-countdown-pair">
                <div className="tooltip-countdown warning">
                  <Clock3 size={12} />
                  <span>BATTERY: {formatDuration(hoveredNode.buffer)}</span>
                </div>
                <div className="tooltip-countdown info">
                  <Truck size={12} />
                  <span>RESCUE: {formatDuration(hoveredNode.rescueTimer)}</span>
                </div>
              </div>
            )}

            {hoveredNode.status === "failed" && (
              <div className="tooltip-countdown danger">
                <AlertTriangle size={12} />
                <span>ASSET OFFLINE</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
