---
name: web-design-guidelines
description: >-
  Audits web interfaces for accessibility (WCAG 2.1 AA, ARIA roles, keyboard navigation),
  responsive layout breakpoints, contrast ratios, and touch targets.
---

# Web Design & Accessibility Guidelines Skill

Checklist and implementation standards for modern, accessible web interfaces in `apps/web`.

## 1. Accessibility (a11y) Standards

- **Semantic HTML**: Use proper native elements (`<main>`, `<header>`, `<nav>`, `<article>`, `<button>`) instead of clickable `<div>` elements.
- **Form Controls**: Every `<input>`, `<select>`, and `<textarea>` must have an associated `<label>` using `htmlFor` or `aria-label`.
- **Keyboard Navigation**:
  - All interactive elements must be focusable with Tab.
  - Visible focus indicators (`focus-visible:ring-2 focus-visible:ring-offset-2`).
  - Escape closes modals, drawers, and popovers.
- **Color Contrast**:
  - Minimum 4.5:1 contrast ratio for normal text against its background (WCAG AA).
  - Minimum 3:1 contrast ratio for graphical objects and data charts.

## 2. Responsive Breakpoints

Design mobile-first with Tailwind standards:
- `sm`: 640px (large phones / small tablets)
- `md`: 768px (tablets / portrait)
- `lg`: 1024px (laptops / desktop grids)
- `xl`: 1280px (wide desktop screens)

Ensure farm maps and data tables horizontally scroll or collapse into cards on mobile viewports.

## 3. Touch Targets

- Interactive controls must have a minimum touch target size of 44x44px on mobile devices (`min-h-[44px] min-w-[44px]`).

## 4. Reduced Motion

Respect user OS motion preferences for animations and satellite map pans:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

