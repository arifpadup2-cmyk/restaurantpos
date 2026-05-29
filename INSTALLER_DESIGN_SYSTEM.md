# Restaurant POS Installer - Design System
## Matching Back Office Theme & UI/UX Pro Max Guidelines

Generated: 2026-05-30  
Product Type: Tool (Installation Wizard)  
Style: Modern, Professional, Dark-Mode  
Stack: Electron (HTML/CSS/JavaScript)

---

## 🎨 VISUAL DESIGN SYSTEM

### Color Palette
**Primary Brand:**
- Primary: `#f97316` (Orange - Primary actions, highlights)
- Secondary: `#0ea5e9` (Sky Blue - Secondary info)
- Success: `#10b981` (Emerald - Completed/successful states)
- Warning: `#f59e0b` (Amber - Warnings/important info)
- Error: `#ef4444` (Red - Errors/critical states)

**Neutral Palette:**
- Surface: `#ffffff` (Light mode base)
- Surface Dark: `#0f172a` (Dark mode base - Back Office matches)
- Text Primary: `#1f2937` (Light) / `#f1f5f9` (Dark)
- Text Secondary: `#6b7280` (Light) / `#cbd5e1` (Dark)
- Border: `#e2e8f0` (Light) / `#334155` (Dark)
- Disabled: `#d1d5db` with opacity 0.5

### Typography System
**Font Family:**
- Headings: `system-ui, -apple-system, 'Inter', sans-serif` (Bold 700)
- Body: `system-ui, -apple-system, 'Inter', sans-serif` (Regular 400)
- Monospace (Code): `'JetBrains Mono', 'Monaco', monospace`

**Type Scale:**
| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| h1 | 32px | 700 | Welcome screen title |
| h2 | 24px | 700 | Screen titles |
| h3 | 20px | 700 | Section headers |
| body | 14px | 400 | Body text, descriptions |
| small | 12px | 400 | Helper text, hints |
| label | 12px | 600 | Form labels |
| code | 12px | 400 | Commands, code blocks |

**Line Height:** 1.5 for body, 1.2 for headings

### Spacing System (8pt grid)
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px

### Shadows & Elevation
| Level | Shadow | Usage |
|-------|--------|-------|
| 1 | 0 1px 2px rgba(0,0,0,0.05) | Subtle card separation |
| 2 | 0 4px 6px rgba(0,0,0,0.1) | Cards, buttons on hover |
| 3 | 0 10px 15px rgba(0,0,0,0.15) | Modals, important overlays |

### Border Radius
- sm: 6px (small buttons, icons)
- md: 8px (cards, inputs)
- lg: 12px (containers)
- full: 50% (circular elements)

### States
**Hover:** Opacity -5%, Shadow +1 level  
**Active/Pressed:** Scale 0.98, Shadow +1 level  
**Disabled:** Opacity 0.5, cursor not-allowed  
**Focus:** Border 2px solid primary color, outline: none

---

## 🏗️ LAYOUT STRUCTURE

### Screen Size
- Width: 800px (fixed for consistency)
- Height: 700px (flexible, can expand for content)
- Min Width: 600px (responsive fallback)

### Content Insets
- Top: 40px
- Sides: 40px
- Bottom: 40px

### Content Areas
```
┌─────────────────────────────────────────┐
│         Installer Header (optional)      │  40px top
├─────────────────────────────────────────┤
│                                         │
│         Main Content (scrollable)        │  40px padding
│                                         │
├─────────────────────────────────────────┤
│       Action Buttons (sticky bottom)     │  40px bottom
└─────────────────────────────────────────┘
```

---

## 🎯 COMPONENT DESIGN

### Buttons
**Primary Button**
```
Background: #f97316
Text: #ffffff | 14px | 600 weight
Padding: 12px 24px
Border Radius: 8px
Height: 44px (touch target)
Hover: Background #ea6f0d, Shadow level 2
Active: Scale 0.98
Disabled: Opacity 0.5
```

**Secondary Button**
```
Background: #e2e8f0 (light) / #334155 (dark)
Text: #1f2937 (light) / #f1f5f9 (dark)
Padding: 12px 24px
Border Radius: 8px
Height: 44px
Hover: Background -5% opacity, Shadow level 1
```

**Tertiary/Link Button**
```
Background: transparent
Text: #f97316
Underline: none by default, underline on hover
Padding: 8px 12px
```

### Form Inputs
```
Background: #ffffff (light) / #1e293b (dark)
Border: 1px solid #e2e8f0 (light) / #334155 (dark)
Border Radius: 8px
Padding: 12px 16px
Font: 14px, regular
Min Height: 44px (touch target)
Focus: Border 2px solid #f97316, outline none

Label: Above input, 12px, 600 weight, margin-bottom 8px
Helper Text: Below input, 11px, #6b7280, margin-top 4px
Error: Border #ef4444, error text below, color #ef4444
```

### Cards
```
Background: #ffffff (light) / #1e293b (dark)
Border: 1px solid #e2e8f0 (light) / #334155 (dark)
Border Radius: 12px
Padding: 20px
Shadow: level 1
Margin Bottom: 16px
```

### Progress / Checkmarks
**Step Indicator (Completed)**
```
Background: #10b981
Icon: ✓
Color: #ffffff
Size: 24px
Border Radius: full
```

**Step Indicator (Current)**
```
Background: #f97316
Icon: Step number
Color: #ffffff
Size: 24px
Border Radius: full
```

**Step Indicator (Pending)**
```
Background: #e2e8f0 (light) / #334155 (dark)
Icon: Step number (grayed)
Color: #6b7280
Size: 24px
Border Radius: full
```

**Progress Bar**
```
Background: #e2e8f0 (light) / #334155 (dark)
Height: 4px
Border Radius: 2px
Fill: #f97316
Animation: smooth transition (300ms)
```

### Status Messages
**Success Message**
```
Background: #f0fdf4
Border Left: 4px solid #10b981
Text: #15803d | 14px
Icon: ✓ #10b981
Padding: 12px 16px
Border Radius: 6px
```

**Error Message**
```
Background: #fef2f2
Border Left: 4px solid #ef4444
Text: #991b1b | 14px
Icon: ✕ #ef4444
Padding: 12px 16px
Border Radius: 6px
```

**Info Message**
```
Background: #f0f9ff
Border Left: 4px solid #0ea5e9
Text: #0c4a6e | 14px
Icon: ℹ️ #0ea5e9
Padding: 12px 16px
Border Radius: 6px
```

---

## ⚙️ INTERACTION & ANIMATION

### Micro-interactions
- Button hover: 150ms ease-out
- State changes: 200ms ease-out
- Progress updates: 300ms ease-out
- Loading spinner: Continuous 1s linear rotation

### Easing Functions
```css
ease-out: cubic-bezier(0.16, 1, 0.3, 1)
ease-in: cubic-bezier(0.7, 0, 0.84, 0)
ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)
```

### Feedback Timing
- Tap feedback: < 100ms
- Form validation: After blur
- Error messages: Immediate
- Success toast: 300ms fade-in, auto-dismiss in 3s

### Loading States
- Show spinner/progress after 300ms
- Use skeleton screens for content
- Never block interaction during load
- Provide cancel/back option if safe

---

## 📱 RESPONSIVE & ACCESSIBILITY

### Breakpoints
- Mobile: < 600px (desktop fallback)
- Tablet: 600px - 1024px
- Desktop: > 1024px

### Accessibility Requirements (CRITICAL)
✅ **Contrast:** Minimum 4.5:1 for all text  
✅ **Focus States:** Visible 2px outline on all interactive elements  
✅ **Touch Targets:** Minimum 44x44px  
✅ **Labels:** All form inputs have visible labels  
✅ **Keyboard Navigation:** Full keyboard support, logical tab order  
✅ **Semantic HTML:** Use proper heading hierarchy (h1→h2→h3)  
✅ **Icons + Text:** All icons paired with text labels  
✅ **Error Recovery:** Clear error messages with recovery path  
✅ **Mobile Zoom:** Never disable user zoom  

---

## 🌓 DARK MODE

### Implementation
- Use CSS variables for theme switching
- Test contrast in both modes independently
- Don't invert colors; use tonal variants

### Dark Mode Overrides
| Element | Light | Dark |
|---------|-------|------|
| Background | #ffffff | #0f172a |
| Surface | #f8fafc | #1e293b |
| Border | #e2e8f0 | #334155 |
| Text Primary | #1f2937 | #f1f5f9 |
| Text Secondary | #6b7280 | #cbd5e1 |

---

## 📋 INSTALLER-SPECIFIC GUIDELINES

### Welcome Screen
- **Hero Icon:** 96x96px, centered, #f97316
- **Title:** h1, centered, primary color
- **Subtitle:** body, secondary text
- **Buttons:** Two equal-width buttons (Server Setup, Terminal Setup)
- **Spacing:** 40px between sections

### System Check Screen
- **Header:** h2 "System Check"
- **Check Items:** Vertical list, 16px apart
  - Icon (48x48) + text + status (spinner/checkmark)
  - Green checkmark for pass
  - Red X for fail
  - Gray spinner for in-progress
- **Proceed Button:** Disabled until all checks pass
- **Message Area:** Shows details/errors below checks

### Form Screens
- **Labels:** Above inputs, 12px, bold
- **Helper Text:** Below labels if needed, 11px, gray
- **Input Height:** 44px (touch target)
- **Spacing:** 16px between fields
- **Grouping:** Related fields in cards/sections
- **Required Indicator:** Asterisk in label, not as placeholder

### Installation Progress
- **Step Indicator:** Horizontal steps at top OR vertical progress on left
- **Current Step:** Highlighted orange, bold text
- **Completed Steps:** Green checkmark
- **Progress Bar:** Visual bar below steps showing overall progress
- **Log Area:** Scrollable monospace text, dark background
- **Status:** Real-time update for each step

### Completion Screen
- **Success Icon:** 96x96px, centered, #10b981 (checkmark in circle)
- **Success Message:** h2, primary color, centered
- **Details:** IP address, credentials, setup instructions
- **Next Steps:** Clear CTA buttons (Open POS, Open Back Office, Done)

---

## 🚀 IMPLEMENTATION CHECKLIST

### Before Launch
- [ ] All buttons have 44x44px minimum touch target
- [ ] All text has 4.5:1 contrast ratio
- [ ] Focus rings visible on all interactive elements
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Loading states show within 300ms
- [ ] Error messages are clear and helpful
- [ ] Dark mode tested independently
- [ ] No emojis used for icons (use SVG)
- [ ] Consistent spacing (8pt grid)
- [ ] Smooth animations (150-300ms)
- [ ] All form inputs labeled (not placeholder-only)
- [ ] Disabled states visually clear

---

## 📐 COLOR TOKENS (CSS Variables)

```css
:root {
  /* Primary */
  --color-primary: #f97316;
  --color-primary-hover: #ea6f0d;
  --color-primary-light: #ffedd5;
  
  /* Secondary */
  --color-secondary: #0ea5e9;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  
  /* Neutral */
  --color-white: #ffffff;
  --color-bg: #ffffff;
  --color-surface: #f8fafc;
  --color-border: #e2e8f0;
  --color-text: #1f2937;
  --color-text-secondary: #6b7280;
  --color-disabled: rgba(209, 213, 219, 0.5);
  
  /* Dark Mode */
  --color-dark-bg: #0f172a;
  --color-dark-surface: #1e293b;
  --color-dark-border: #334155;
  --color-dark-text: #f1f5f9;
  --color-dark-text-secondary: #cbd5e1;
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.15);
  
  /* Timing */
  --duration-fast: 150ms;
  --duration-base: 200ms;
  --duration-slow: 300ms;
}
```

---

## ✅ UI/UX PRO MAX COMPLIANCE

**Accessibility (CRITICAL):** ✅ WCAG AA contrast, keyboard nav, focus rings  
**Touch & Interaction (CRITICAL):** ✅ 44x44px targets, loading feedback  
**Performance (HIGH):** ✅ SVG icons, lazy load images, minimal animations  
**Style Selection (HIGH):** ✅ Modern professional, matches Back Office  
**Layout & Responsive (HIGH):** ✅ Mobile-first, 8pt grid, no horizontal scroll  
**Typography & Color (MEDIUM):** ✅ Semantic tokens, consistent scale  
**Animation (MEDIUM):** ✅ 150-300ms, physics-based easing  
**Forms & Feedback (MEDIUM):** ✅ Visible labels, error near field, clear messaging  
**Navigation (HIGH):** ✅ Clear back behavior, logical flow  

---

**Design System Status:** ✅ Ready for Implementation  
**Target Completion:** All installer screens updated to match Back Office theme
