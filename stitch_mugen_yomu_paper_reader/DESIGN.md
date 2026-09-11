---
name: Cognitive Scholar Gruvbox
colors:
  surface: '#191300'
  surface-dim: '#191300'
  surface-bright: '#42381b'
  surface-container-lowest: '#130e00'
  surface-container-low: '#221b02'
  surface-container: '#271f05'
  surface-container-high: '#32290d'
  surface-container-highest: '#3d3417'
  on-surface: '#f2e1b8'
  on-surface-variant: '#dfc0b0'
  inverse-surface: '#f2e1b8'
  inverse-on-surface: '#393013'
  outline: '#a68b7c'
  outline-variant: '#574236'
  surface-tint: '#ffb68a'
  primary: '#ffb68a'
  on-primary: '#522300'
  primary-container: '#fe8019'
  on-primary-container: '#5f2a00'
  inverse-primary: '#984700'
  secondary: '#fabd2f'
  on-secondary: '#402d00'
  secondary-container: '#d89f01'
  on-secondary-container: '#513900'
  tertiary: '#a1d48e'
  on-tertiary: '#0c3904'
  tertiary-container: '#7fb06e'
  on-tertiary-container: '#16420d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbc8'
  primary-fixed-dim: '#ffb68a'
  on-primary-fixed: '#321300'
  on-primary-fixed-variant: '#743500'
  secondary-fixed: '#ffdea3'
  secondary-fixed-dim: '#fabd2f'
  on-secondary-fixed: '#261900'
  on-secondary-fixed-variant: '#5d4200'
  tertiary-fixed: '#bcf1a8'
  tertiary-fixed-dim: '#a1d48e'
  on-tertiary-fixed: '#022100'
  on-tertiary-fixed-variant: '#24501a'
  background: '#191300'
  on-background: '#f2e1b8'
  surface-variant: '#3d3417'
typography:
  display-lg:
    fontFamily: Source Serif 4
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.015em
  display-lg-mobile:
    fontFamily: Source Serif 4
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Source Serif 4
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Source Serif 4
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.005em
  headline-md:
    fontFamily: Source Serif 4
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Source Serif 4
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Source Serif 4
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 30px
  body-md:
    fontFamily: Source Serif 4
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-sm:
    fontFamily: Source Serif 4
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies the focused, tactile atmosphere of an old-world academic library infused with the crisp efficiency of a Unix hacker’s terminal. Engineered for long-form cognitive reading, deep research synthesis, and rigorous paper analysis, the environment prioritizes cognitive calm, zero optical fatigue, and absolute typographical clarity.

The visual style merges **Warm Retro Terminal Minimalism** with **Classical Academic Paper Typography**. It eschews sterile, blue-tinted digital dark modes in favor of an organic, ink-on-amber-tinted parchment aesthetic rendered in deep, low-energy dark values. The UI feels like an archival reading desk: physically grounded, quiet, structured, and deliberately non-distracting.

## Colors

The palette is rooted strictly in authentic Gruvbox dark harmonies, calibrated to reduce glare while retaining sharp contrast ratios that meet or exceed WCAG AAA standards for sustained reading sessions.

### Color Tokens & Semantic Roles
- **Canvas Base (`bg0`)**: `#282828` — The primary reading canvas and background plane.
- **Canvas Deep (`bg0_h`)**: `#1d2021` — Recessed panels, gutters, terminal trays, and distraction-free margin chrome.
- **Canvas Soft (`bg0_s`)**: `#32302f` — Elevated paper sheets and reading slabs.
- **Surface Elevation 1 (`bg1`)**: `#3c3836` — Cards, floating toolbars, dialogs, and popovers.
- **Surface Elevation 2 / Borders (`bg2`)**: `#504945` — Hairline delimiters, table rules, and structural guides.
- **Primary Text (`fg`)**: `#ebdbb2` — Uncompromised readability for research body copy and main titles.
- **Secondary Text (`fg1`)**: `#d5c4a1` — Metadata, secondary headers, abstract blocks, and citations.
- **Muted Text (`fg4`)**: `#a89984` — Footnotes, line numbers, subtle captions, and disabled states.

### Semantic Accents
- **Primary Accent (`orange`)**: `#fe8019` (hover `#d65d0e`) — Action targets, active tab underlines, primary annotations.
- **Secondary Accent (`yellow`)**: `#fabd2f` (hover `#d79921`) — Text highlighting, key takeaways, search matches.
- **Tertiary Accent (`aqua/cyan`)**: `#8ec07c` (hover `#689d6a`) — Cross-references, interactive links, figure captions.
- **Success / Validated (`green`)**: `#b8bb26` (hover `#98971a`) — Verified peer reviews, reproducibility confirmations.
- **Informational (`blue`)**: `#83a598` (hover `#458588`) — Formula references, bibliography indices.
- **Special Marker (`purple`)**: `#d3869b` (hover `#b16286`) — Marginalia, private notes, critique tags.

## Typography

The typographic hierarchy balances literary gravitas with computational precision:
- **Serif Domain (Source Serif 4)**: Governs human thought—paper titles, abstracts, prose bodies, and footnotes. A line-height ratio of roughly 1.6 to 1.7 ensures fluid scanning across wide or multi-column academic texts without optical jumping.
- **Monospace Domain (JetBrains Mono)**: Handles cognitive apparatus—code blocks, TeX math environments, metadata bars, DOI tags, line numbers, and keyboard shortcuts.
- **Reading Measure**: Maintain academic body copy between 65 and 78 characters per line for optimal reading ergonomics.

## Layout & Spacing

The layout is built upon an asymmetric scholarly split:
- **Desktop (1200px+)**: A 12-column grid featuring a central paper sheet container (fixed maximum reading width of 760px), flanked by a collapsible 4-column contextual margin rail on the right (for marginalia, citations, and cognitive maps) and a slim 64px vertical navigation rail on the left.
- **Tablet (768px – 1199px)**: 8-column layout. The marginalia drawer shifts to an overlay or an expandable bottom drawer. Paper margins contract to `margin` tokens of 1.5rem.
- **Mobile (< 768px)**: 4-column single continuous scroll. Reading matter fills 100% of viewport width inside `margin-mobile` (1rem). Notes and toolbars dock into discreet top and bottom utility strips.

## Elevation & Depth

This system intentionally eliminates blurred drop shadows, ambient fuzz, and skeuomorphic gradients in favor of **Tonal Layering with Crisp Hairline Outlines**:

- **Layer 0 (Canvas Base)**: Deepest recess (`#1d2021` or `#282828`).
- **Layer 1 (Paper Slabs & Main Panels)**: `#32302f`, demarcated by a 1px solid border of `#504945`.
- **Layer 2 (Context Toolbars, Tooltips, Cards)**: `#3c3836`, framed by a 1px solid border of `#504945` or an active state border of `#fe8019` / `#8ec07c`.
- **Active Focus & Selection**: Distinct 1px sharp inset or outset rules using the retro accents (`#fe8019` or `#fabd2f`), echoing classical terminal cursor selection highlights rather than soft glows.

## Shapes

The design uses a **Soft (Level 1)** geometric form language:
- Buttons, inputs, search blocks, and cards use `0.25rem` (4px) corner radiuses, striking a balance between the strict rectilinear discipline of terminal buffers and the gentle tactile warmth of cut paper.
- Inline code tags, status badges, and pill counters use subtle `0.125rem`–`0.25rem` contours. Circular profiles are restricted entirely to avatar indicators and reading progress dials.

## Components

### Buttons
- **Primary**: Background `#fe8019`, foreground `#1d2021`, font JetBrains Mono Medium, 0.25rem radius. Hover shifts background to `#d65d0e`.
- **Secondary / Ghost**: Background transparent, border 1px solid `#504945`, foreground `#ebdbb2`. Hover transitions background to `#3c3836` and border to `#d5c4a1`.
- **Subtle Action**: Monospaced inline trigger with brackets, e.g., `[Cite]`, `#8ec07c` text with no border.

### Reading Annotations & Chips
- **Chips / Tags**: Background `#3c3836`, text `#d5c4a1`, border 1px solid `#504945`, 0.25rem radius, label font JetBrains Mono (`label-sm`).
- **Text Highlighting**:
  - *Core Insight*: `#fabd2f` at 20% opacity with a solid 1.5px underline in `#fabd2f`.
  - *Dissent / Critique*: `#d3869b` at 20% opacity with a dotted underline in `#d3869b`.
  - *Reference / Link*: `#8ec07c` at 15% opacity with dashed underline.

### Cards & Paper Views
- Rendered on `#32302f` with a 1px border of `#504945`. 
- Padding set to `space-lg` (1.5rem).
- Header sections feature a thin 1px horizontal rule separating title meta from paper content.

### Inputs & Search Bars
- Background `#1d2021`, border 1px solid `#504945`, text `#ebdbb2`, placeholder `#a89984`.
- Focus state: Border transitions to `#fe8019` with zero glow. Monospaced cursor indicator.

### Checkboxes & Radios
- Square 14px boxes with a 1px border of `#a89984`.
- Selected state fills with `#fe8019` and features a `#1d2021` interior tick mark or square glyph.

### Marginalia & Scholarly Additions
- **Margin Note Anchor**: Inline numerical glyph in `code-sm` (`#83a598`). Clicking shifts margin note into view with a 2px left border in `#fe8019`.
- **Math & Code Blocks**: Background `#1d2021`, full width or indented `space-md`, with line numbering in `#a89984` and syntax highlighting mapped directly to the Gruvbox color scheme.