# Meridian — shadcn application workspace

## Foundation

Use official shadcn/ui Base UI components (Nova), Tailwind v4 and semantic tokens.
The installed skill is `.agents/skills/shadcn/SKILL.md`; inspect `components.json`
and fetch official component docs through the CLI before changing components.
Warm neutral surfaces, dark forest accent, system sans-serif, restrained dividers.
No decorative scores, marketing hero, fake telemetry, or simulated model responses.

## Navigation and layout

Primary navigation contains Explore `/`, Field Planner `/planner`, and Ask Meridian
`/intel`. My fields `/fields`, Calendar `/planner/calendar`, Budget `/economics`,
Review `/planner/review`, and Saved plans `/planner/saved` belong to the planning
journey. Editor headers show read-only field/crop context; next cash crop is edited
in the calendar form. Existing field management and saved-record actions are explicit.

Explore is one persistent map workspace with Conditions and Historical research
inside Map options. The map surface has a navigation toggle and Map options, with
source/date/legend feedback in one normal-flow footer outside the map viewport.
No extra research toolbar or selectors on the map. `/atlas` is a compatibility
redirect to `/?view=research`; research URL filters support deep links and history.

Conditions retains geographic H3 selection and centre conditions/soil inspection.
Historical research renders county polygons at the data's supported scale, with
Research crop, Study period and keyboard County selection inside Map options.
County details dock beside desktop maps and use one Sheet on phones. Filters and
details must not open competing sheets. Keep the signed percent legend visible.
Use muted purple/neutral/teal for research, numeric labels and gray No estimate.

Planning context, H3 inspection and research county/filter state are independent.
Map clicks and research filters do not change the selected planning field/crop,
drafts or saved budget. Explicit Choose a field in this area navigates to My fields;
it does not create a draft or substitute county/hexagon area for field acreage.

My fields owns point selection and drawing. One compact toolbar and one operation
row own instructions and Finish/Cancel. The field panel focuses on the active
operation, clears stale feedback and preserves saved records until explicit save.
Net-return research controls stay absent while validated financial coverage is
unavailable; keep the implementation for future configured data.

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

Field Planner saves cover-crop species, 0–60 day termination lead time, required
planting date for confirmation, entered field area and notes per selected location/crop. Calendar
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
assumed yield change %, costs/payment USD/ha, and managed hectares. Show estimated
return after entered cover-crop costs and subsidy, with other production expenses
excluded. Calculation details are collapsed; no baseline-change block is displayed.
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
