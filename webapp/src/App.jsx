import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { data } from "./data";
import "./App.css";

const SPRING = { type: "spring", stiffness: 140, damping: 20 };
const ROW_SPACING = 340;

// Keep in sync with the width/min-height of the matching .node-* class in App.css.
const SIZE = {
  root: { w: 300, h: 110 },
  center: { w: 300, h: 200 },
  ring: { w: 180, h: 70 },
  leaf: { w: 150, h: 56 },
};

function rowPos(i, n, spacing = ROW_SPACING) {
  return { dx: (i - (n - 1) / 2) * spacing, dy: 0 };
}

function circlePos(i, n, radius) {
  const angleDeg = (360 / n) * i - 90;
  const rad = (angleDeg * Math.PI) / 180;
  return { dx: radius * Math.cos(rad), dy: radius * Math.sin(rad), angleDeg, radius };
}

// How far the current diagram reaches from the center point in each
// direction, so it can be scaled down to fit inside the viewport.
function diagramHalfExtent(nodes) {
  if (nodes[0]?.role === "root") {
    const n = nodes.length;
    const totalW = (n - 1) * ROW_SPACING + SIZE.root.w;
    return { halfW: totalW / 2, halfH: SIZE.root.h / 2 };
  }

  const ring = nodes.filter((n) => n.role !== "center");
  let halfW = SIZE.center.w / 2;
  let halfH = SIZE.center.h / 2;
  if (ring.length > 0) {
    const { w, h } = SIZE[ring[0].role];
    const radius = ring[0].pos.radius;
    halfW = Math.max(halfW, radius + w / 2);
    halfH = Math.max(halfH, radius + h / 2);
  }
  return { halfW, halfH };
}

function useViewportSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

function buildNodes(state, setState) {
  const { bucket, category, group } = state;

  if (bucket === null) {
    return data.map((b, i) => ({
      key: `b-${i}`,
      label: b.name,
      role: "root",
      pos: rowPos(i, data.length),
      onClick: () => setState({ bucket: i, category: null, group: null }),
    }));
  }

  const bucketObj = data[bucket];

  if (category === null) {
    const center = {
      key: `b-${bucket}`,
      label: bucketObj.name,
      role: "center",
      pos: { dx: 0, dy: 0 },
      onClick: () => setState({ bucket: null, category: null, group: null }),
    };
    const ring = bucketObj.categories.map((c, i) => ({
      key: `c-${bucket}-${i}`,
      label: c.name,
      role: "ring",
      pos: circlePos(i, bucketObj.categories.length, 300),
      onClick: () => setState({ bucket, category: i, group: null }),
    }));
    return [center, ...ring];
  }

  const catObj = bucketObj.categories[category];

  if (group === null) {
    const center = {
      key: `c-${bucket}-${category}`,
      label: catObj.name,
      role: "center",
      description: catObj.description,
      pos: { dx: 0, dy: 0 },
      onClick: () => setState({ bucket, category: null, group: null }),
    };
    const ring = catObj.groups.map((g, i) => ({
      key: `g-${bucket}-${category}-${i}`,
      label: g.heading,
      role: "ring",
      pos: circlePos(i, catObj.groups.length, 300),
      onClick: () => setState({ bucket, category, group: i }),
    }));
    return [center, ...ring];
  }

  const groupObj = catObj.groups[group];
  const center = {
    key: `g-${bucket}-${category}-${group}`,
    label: groupObj.heading,
    role: "center",
    description: groupObj.description,
    pos: { dx: 0, dy: 0 },
    onClick: () => setState({ bucket, category, group: null }),
  };
  const ring = groupObj.items.map((item, i) => ({
    key: `i-${bucket}-${category}-${group}-${i}`,
    label: item.name,
    description: item.description,
    role: "leaf",
    pos: circlePos(i, groupObj.items.length, 420),
  }));
  return [center, ...ring];
}

const MARGIN = 48;

export default function App() {
  const [state, setState] = useState({ bucket: null, category: null, group: null });
  const [expandedLeaves, setExpandedLeaves] = useState(() => new Set());
  const nodes = buildNodes(state, setState);
  const edges = nodes.filter((n) => n.role === "ring" || n.role === "leaf");

  function toggleLeaf(key) {
    setExpandedLeaves((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const viewport = useViewportSize();
  const { halfW, halfH } = diagramHalfExtent(nodes);
  const scale = Math.min(
    1,
    (viewport.w / 2 - MARGIN) / halfW,
    (viewport.h / 2 - MARGIN) / halfH
  );

  return (
    <div className="page">
      <div className="map-container">
        {/* Zero-size, flex-centered pivot: every node/edge below is positioned
            relative to this single point, so it is always the true center
            of the viewport regardless of box sizes. The fit-to-viewport
            "scale" is baked into each node/edge's own position and animate
            values below rather than a separate wrapping transform -- a
            parent animating `scale` while children animate `layout` fight
            each other's measurements and glitch. */}
        <div className="anchor">
          <AnimatePresence>
            {edges.map((n) => (
              <motion.div
                key={`edge-${n.key}`}
                className="edge"
                style={{ width: n.pos.radius * scale }}
                initial={{ opacity: 0, scaleX: 0, rotate: n.pos.angleDeg }}
                animate={{ opacity: 1, scaleX: 1, rotate: n.pos.angleDeg }}
                exit={{ opacity: 0, scaleX: 0 }}
                transition={SPRING}
              />
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {nodes.map((n) => {
              const isLeafExpanded = n.role === "leaf" && expandedLeaves.has(n.key);
              const showDescription = n.description && (n.role === "center" || isLeafExpanded);
              return (
                <div
                  key={n.key}
                  className="node-slot"
                  style={{ left: n.pos.dx * scale, top: n.pos.dy * scale }}
                >
                  <motion.div
                    layout
                    className={`node node-${n.role}${isLeafExpanded ? " expanded" : ""}`}
                    initial={{ opacity: 0, scale: scale * 0.7 }}
                    animate={{ opacity: 1, scale }}
                    exit={{ opacity: 0, scale: scale * 0.7 }}
                    transition={SPRING}
                    onClick={n.role === "leaf" ? () => toggleLeaf(n.key) : n.onClick}
                  >
                    <div className="node-label">{n.label}</div>
                    {showDescription && (
                      <ul className="node-desc">
                        <li>{n.description.what}</li>
                        <li>{n.description.useful}</li>
                      </ul>
                    )}
                  </motion.div>
                </div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
