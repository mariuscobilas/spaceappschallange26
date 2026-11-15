# Meridian — shadcn application workspace

## Foundation

Use official shadcn/ui Base UI components (Nova), Tailwind v4 and semantic tokens.
The installed skill is `.agents/skills/shadcn/SKILL.md`; inspect `components.json`
and fetch official component docs through the CLI before changing components.
Warm neutral surfaces, dark forest accent, system sans-serif, restrained dividers.
No decorative scores, marketing hero, fake telemetry, or simulated model responses.

## Navigation and layout

A full-height application navigation sidebar contains six stacked destinations:
Explore `/`, My fields `/fields`, Regional Atlas `/atlas`, Field Planner `/planner`,
Economics `/economics`, Ask Meridian `/intel`.
Use shadcn Sidebar components; collapse to icons on desktop, Sheet navigation on
phones. The sidebar contains navigation only, not map filters or field details.

Explore is for map browsing and filters. Its compact map bar has navigation,
location/crop context, Map options and on-demand details; it does not create or
edit fields. My fields owns point selection, drawing, saved-field selection and
management. Regional Atlas `/atlas` owns H3 region browsing and inspection. These
are native sidebar routes over the same mounted map and shared location/crop/date
state; direct links and browser history must restore the route's field/atlas mode.

Map options opens a scrollable right Sheet containing NASA layer selection,
opacity, source legend and Latest/Past dates. Field tools belong to My fields and
are absent from Explore and Regional Atlas. The My fields panel closes before a
map selection or drawing starts; Finish/Cancel stay visible while drawing/editing.
Phones use compact context controls and the existing navigation drawer. Keep
source dates and missing states in map feedback.

Saved plans belongs to local Plan termination / Saved plans navigation within
Field Planner. Comparison is opt-in and selects existing plan cards. Preserve
explicit draft restoration and plan-only deletion confirmation.
Field mode selects exact points and supports named polygon fields; Atlas selects
regional hexagons. Keep drawing instructions and Finish/Cancel actions visible.
Atlas selections open a docked right overview beside the desktop map; phones use
a Sheet. Show full hex area, centre, resolution, crop/date and sampled conditions,
distinguishing sample readings from regional aggregates.

## Map and observations

Keep roads, place names, boundaries and rivers under translucent geographic H3
cells. Four levels: res2 below zoom4, res3 below6, res4 below9, scoped res5 thereafter.
Neutral cell variations carry no assessment. Selection has a strong outline.

NASA imagery is opt-in. Latest means the advertised available date, and Past
resolves the latest advertised observation on or before the requested date. Preserve
actual dates, source units, native legends, opacity and Retry. Loading/failure must
leave map navigation available. IMERG is precipitation rate, not accumulated rain.

## Farmer workflows

The primary task is terminating an existing cover crop before the next cash crop.
Lead Planner with planting date, then cover crop and lead time. Display a prominent
calendar termination date alongside the form, explicitly chosen by the user.
Keep working drafts per field/crop through navigation and reload independently
from confirmed saved plans.

Field Planner saves cover-crop species, 0–60 day termination lead time, optional
planting date, entered field area and notes per selected location/crop. Calendar
termination dates are simple date arithmetic, not a model result. Regional hex
area is never substituted for managed field area. Saved polygon hectares are
authoritative; point-based fields use manual hectares. Predictions remain unavailable.

Show numeric field context in details and Planner using one compact list, with
neutral styling and independent unavailable states. Display actual weather periods,
relative saturation rather than VWC, and mapped soil capacity rather than current
water remaining. Source links, spatial resolution and provider messages belong in
an expandable disclosure. Numeric provider failures must not block planning.

Field details show name, crop, geodesic hectares and centroid. Boundary edits require
Finish then Save or Cancel. Protect dirty drafts on navigation. Oversized boundaries
show their area, the 5,000 ha limit and an Atlas action. USDA CDL suggestions display
their source year and require explicit acceptance; keep manual crop choice available.

Economics starts with blank, explicitly entered assumptions: USD/tonne, tonnes/ha,
assumed yield change %, costs/payment USD/ha, and managed hectares. Calculate net
change and break-even arithmetically; no live price or yield forecast is implied.
Blank values are not zero. Preserve inputs per location/crop across navigation.
Offer metric/U.S. inputs and results, using metric canonical storage. Unit switches
must not alter assumptions or calculation results. Grain bushels use crop-specific
weights; cotton uses lint pounds. Allow per-area economics before area is provided;
require valid area for parcel totals.

Ask Meridian prepares/copies a real question with selected map and saved-plan
context. Show disconnected analysis honestly. No fabricated conversation history.

## Interaction and implementation

Use FieldGroup/Field, NativeSelect, Input, Slider, ToggleGroup, Popover, Sheet,
Button, Card, Alert, Empty and Separator primitives. Semantic theme colors and
built-in variants; className primarily for layout. Sheet titles and visible form
labels are required. Crop control is clickable across its complete visible area.

Validate phone/landscape layout, keyboard navigation/focus, reduced motion and
fallback behavior. Generated Slider was corrected for one scalar thumb and ARIA
labels on its range input. MapCanvas ResizeObserver tracks container changes.

## Usability and performance pass

MapPreview is dynamically loaded on first Explore visit and remains mounted afterward.
Planner condition details mount on disclosure; numeric requests share a bounded
in-memory cache and in-flight work, with explicit refresh invalidation. Preserve
source validation and stale-response protection. Use native links for page navigation
and retain a keyboard skip link. Backup remains available in the collapsed sidebar.
