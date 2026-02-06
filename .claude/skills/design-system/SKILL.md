---
name: design-system
description: OpenStride design system. Use when editing Vue files, or when discussing colors, icons, CSS, styling, design, accessibility.
user-invocable: false
---

# Design System - OpenStride

## Colors -- CSS Variables Required

Source: `src/assets/styles/variables.css`

```css
/* OpenStride green palette */
var(--color-green-50)   /* #f8fbea - Very light backgrounds */
var(--color-green-100)  /* #edf6c8 */
var(--color-green-200)  /* #dff19a - Subtle borders */
var(--color-green-300)  /* #cbe56d */
var(--color-green-400)  /* #b4d647 - Light accent */
var(--color-green-500)  /* #88aa00 - PRIMARY: buttons, CTA */
var(--color-green-600)  /* #6d8a00 - Hover states */
var(--color-green-700)  /* #566d00 - Dark text */
var(--color-green-800)  /* #415200 */
var(--color-green-900)  /* #2f3c00 */

/* Semantic */
var(--primary-color)    /* #333333 - Text */
var(--secondary-color)  /* #88aa00 - Accent */
var(--bg-color)         /* #fafafa - Background */
```

FORBIDDEN: `#88aa00`, `#10b981`, `#059669`, `color: green`, `bg-green-500`

## Icons -- Font Awesome 6 Free

ALWAYS with `aria-hidden="true"`:

```html
<i class="fas fa-person-running" aria-hidden="true"></i>
```

### Icon Catalog by Context

**Sports:** `fa-person-running`, `fa-person-biking`, `fa-person-swimming`, `fa-person-hiking`
**Navigation:** `fa-bars`, `fa-times`, `fa-chevron-left`, `fa-chevron-right`
**Actions:** `fa-plus`, `fa-trash`, `fa-pen`, `fa-sync`
**Users:** `fa-user`, `fa-users`, `fa-user-plus`, `fa-share-nodes`
**Status:** `fa-check-circle`, `fa-exclamation-circle`, `fa-times-circle`, `fa-info-circle`
**Privacy:** `fa-globe` (public), `fa-lock` (private), `fa-eye`, `fa-eye-slash`
**Stats:** `fa-chart-line`, `fa-chart-bar`, `fa-calendar-alt`, `fa-clock`, `fa-tachometer-alt`
**Settings:** `fa-cog`, `fa-sliders-h`, `fa-plug`, `fa-unlink`

FORBIDDEN: emojis in production code

## Accessibility

```html
<!-- Decorative icon -->
<i class="fas fa-user" aria-hidden="true"></i>

<!-- Icon with meaning (add sr-only) -->
<i class="fas fa-lock" aria-hidden="true"></i>
<span class="sr-only">Private activity</span>

<!-- Interactive elements: data-test for Cypress -->
<button data-test="save-activity">Save</button>
<input data-test="search-input" aria-label="Search activities" />
```

Full documentation: `DESIGN_GUIDELINES.md`
