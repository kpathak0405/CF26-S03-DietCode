# Simulator refinement checklist

- [x] Replace the passive left rail with an actionable live incident alert section.
- [x] Add node-failure alerts that open an affected-asset pop-up, including multiple downstream assets.
- [x] Add independently breakable dependency edges with appropriate incident controls and cascade behavior.
- [x] Add restrained, useful in-canvas context to improve spatial balance without clutter.
- [x] Validate node and edge disruption flows, alert pop-ups, and responsive composition.

## Disaster scenario presets

- [x] Define named preset disruptions that demonstrate distinct infrastructure cascade patterns.
- [x] Add compact preset controls that apply a named disruption immediately.
- [x] Validate each preset against alerts, state colors, and reset behavior.

## Black and charcoal theme

- [x] Replace the light canvas, surfaces, typography, and border palette with true black and charcoal values.
- [x] Preserve clear operational, buffering, failed, and recovered signal colors without navy-tinted surfaces.
- [x] Validate contrast and responsive dark-mode presentation.

## Intervention cost model and spatial field

- [x] Define distinct sector remediation options with implementation costs.
- [x] Track the selected remedy for each buffering asset and calculate an aggregated estimate.
- [x] Add a cost-estimation control and full-screen selected-interventions overlay.
- [x] Reposition assets into a scattered, map-like dependency field.
- [x] Validate remedy selection, cost display, estimator contents, and canvas interaction.

## Currency presentation

- [x] Convert remediation and estimator monetary labels from USD to Indian rupees.
- [x] Verify rupee formatting in intervention controls and the selected-cost overlay.

## Frontend codebase cleanup

- [x] Inventory all TSX files and confirm whether each is reachable from the current app.
- [x] Remove only confirmed unused frontend components or pages.
- [x] Run the type check after cleanup and report retained versus removed files.
