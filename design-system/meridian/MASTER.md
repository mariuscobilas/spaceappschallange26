# Meridian — shadcn application workspace

## Foundation

Use official shadcn/ui Base UI components (Nova), Tailwind v4 and semantic tokens.
The installed skill is `.agents/skills/shadcn/SKILL.md`; inspect `components.json`
and fetch official component docs through the CLI before changing components.
Warm neutral surfaces, dark forest accent, system sans-serif, restrained dividers.
No decorative scores, marketing hero, fake telemetry, or simulated model responses.

## Navigation and layout

A full-height application navigation sidebar contains four stacked destinations:
Explore `/`, Field Planner `/planner`, Economics `/economics`, Ask Meridian `/intel`.
Use shadcn Sidebar components; collapse to icons on desktop, Sheet navigation on
phones. The sidebar contains navigation only, not map filters or field details.

Explore has one horizontal toolbar above the map: location, crop, Field / Atlas
mode, Conditions, Latest / Past date, and on-demand details. No second header strip.
The map remains mounted across workspace navigation; other pages have their own
main content and one compact page header. Controls wrap within one toolbar surface
on small viewports. Details open in an accessible Sheet after a selection or Info.
Field mode selects exact points and supports named polygon fields; Atlas selects
regional hexagons. Keep drawing instructions and Finish/Cancel actions visible.

## Map and observations

Keep roads, place names, boundaries and rivers under translucent geographic H3
cells. Four levels: res2 below zoom4, res3 below6, res4 below9, scoped res5 thereafter.
Neutral cell variations carry no assessment. Selection has a strong outline.

NASA imagery is opt-in. Latest means the advertised available date, and Past
resolves the latest advertised observation on or before the requested date. Preserve
actual dates, source units, native legends, opacity and Retry. Loading/failure must
leave map navigation available. IMERG is precipitation rate, not accumulated rain.

## Farmer workflows

Field Planner saves cover-crop species, 0–60 day termination lead time, optional
planting date, entered field area and notes per selected location/crop. Calendar
termination dates are simple date arithmetic, not a model result. Regional hex
area is never substituted for managed field area. Saved polygon hectares are
authoritative; point-based fields use manual hectares. Predictions remain unavailable.

Field details show name, crop, geodesic hectares and centroid. Boundary edits require
Finish then Save or Cancel. Protect dirty drafts on navigation. Oversized boundaries
show their area, the 5,000 ha limit and an Atlas action. USDA CDL suggestions display
their source year and require explicit acceptance; keep manual crop choice available.

Economics starts with blank, explicitly entered assumptions: USD/tonne, tonnes/ha,
assumed yield change %, costs/payment USD/ha, and managed hectares. Calculate net
change and break-even arithmetically; no live price or yield forecast is implied.
Blank values are not zero. Preserve inputs per location/crop across navigation.

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
