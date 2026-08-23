# Urban Infrastructure Cascade Simulator — Design Direction

## Three stylistic approaches

| Theme Name | Very Brief Intro | Probability |
| --- | --- | --- |
| Control-Room Blueprint | A cool, technical interface built around quiet grid geometry, labels, and precise status marks. It evokes a systems-engineering workbench rather than an executive KPI dashboard. | 0.07 |
| Civic Survey Ledger | A warm editorial interface with paper-like surfaces, measured spacing, and infrastructure symbols drawn as documentation. The tone is analytical, restrained, and municipal. | 0.04 |
| Clinical Cascade Field | A high-contrast, light-mode graph workspace that makes the node canvas the primary instrument. Alert states use only the prescribed amber, crimson, and emerald colors; all other UI recedes. | 0.09 |

## Chosen approach: Clinical Cascade Field

### Design Movement

The interface follows **clinical systems-engineering visualization**: a sparse operational workspace with architectural hairlines, labelled equipment badges, and no ornamental dashboard widgets.

### Core Principles

1. The dependency canvas is the principal working surface; controls and explanatory information remain compact and peripheral.
2. State is communicated by a small, strictly controlled set of semantic colors and never by decorative gradients or status-card clutter.
3. Labels, dependency arrows, and timers remain legible at a glance through high contrast, mono-spaced technical metadata, and clear alignment.
4. Every interactive element earns its place by directly supporting simulation selection, disruption, recovery, or inspection.

### Color Philosophy

Warm ivory and paper-white create a calm inspection environment, while slate and indigo establish precise operational contrast. Rust crimson is reserved for failure, ochre amber for active buffering, and emerald pine for recovery; these colors must never be diluted by unrelated accent colors.

### Layout Paradigm

An asymmetric **instrument panel around a field canvas**: a narrow left navigation and instrument rail frame a broad, free-coordinate simulation field, while the selected-node inspector is contextual rather than persistent.

### Signature Elements

1. Fine segmented coordinate lines and micro-ticks across the simulation canvas.
2. Compact asset badges with a sector glyph, technical identifier, and a state marker.
3. A vertical simulation-status spine at the left edge that records only the current run mode and primary controls.

### Interaction Philosophy

Selection is immediate and quiet. Node modals are focused and conditional: a blast action appears only for nodes with dependents; mitigation appears only for buffering nodes. Simulated state changes alter downstream conditions deterministically.

### Animation

Only buffering nodes pulse, using a restrained amber ring at a steady interval. Modal opening uses an opacity and slight-scale transition under 220ms; buttons use a short active press. Reduced-motion settings disable nonessential animation.

### Typography System

**Space Grotesk** serves headings, high-importance labels, and node names with compact uppercase hierarchy. **IBM Plex Mono** serves asset IDs, timers, status values, and parameters. Titles use 600–700 weight; metadata stays at 500 weight with deliberate tracking.

### Brand Essence

**A precise, visual workspace for tracing how urban infrastructure failures propagate across interdependent systems.**

Personality: **exact, analytical, composed**.

### Brand Voice

Headlines are sparse, factual, and operational. CTAs describe a concrete simulation action rather than a generic invitation.

> “Trace the dependency path.”

> “Fail an upstream asset.”

### Wordmark & Logo

Use an abstract **three-way dependency junction**: three tapered utility paths converging into a structural core, without wordmark text. The symbol echoes directed cascade flow and remains recognisable at favicon scale.

### Signature Brand Color

**Infrastructure Indigo — #1E2D52**.

## Style Decisions

- Do not add charts, utilization gauges, user avatars, notifications, trend indicators, or telemetry cards unless a future requirement explicitly asks for them.
- Preserve a clean, map-ready canvas layer; background marks must remain subtle enough that a future map tile can replace them without changing foreground contrast.
