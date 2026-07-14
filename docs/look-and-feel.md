# UI Look-and-Feel Specification: IPL Finder (file-finder-sr3)

This document extracts and defines the exact visual system, design tokens, responsive layout rules, and component styles of the **IPL Finder** (`file-finder-sr3`) application. Use this specification to replicate the precise look-and-feel in other applications.

---

## 1. Design Ethos
IPL Finder features a clean, highly modern, premium interface characterized by:
- **Sleek Light & Dark Modes**: Carefully selected HSL colors that maintain contrast and look sophisticated (avoiding harsh absolute blacks and pure primary hues).
- **Glassmorphism & Depth**: Broad use of backdrop filters (`backdrop-blur-xl`) and subtle opacity layers to achieve physical layering and high perceived value.
- **Card Elevation**: Containers float over the background using subtle, high-quality drop shadows rather than heavy dark shadows.
- **Micro-animations**: Fluid, soft enter transitions (`slide-up`, `fade-in`, `scale-in`) and state changes (hover triggers, focus ring expansions) to make the interface feel alive.
- **Staggered Animations**: Lists load with a staggered layout delay (`50ms` per row) for a premium mounting feel.

---

## 2. Typography

The application uses a dual-font system loaded from Google Fonts:
- **Sans-Serif (Default & UI)**: [Inter](https://fonts.google.com/specimen/Inter) (`wght@300;400;500;600;700`)
  - Configured as `font-sans` (`Inter, system-ui, sans-serif`).
  - Rendered with `antialiased` text rendering on the body.
- **Monospace (Code & Data)**: [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (`wght@400;500`)
  - Configured as `font-mono` (`JetBrains Mono, monospace`).
  - Used for code blocks, logs, code view, matching search snippets, line numbers, and key metadata values.

---

## 3. Color System & HSL Tokens

Tailwind values are mapped to custom CSS Custom Properties (variables) inside `@layer base`. Color values are represented as raw HSL components (e.g., `210 20% 98%`) so Tailwind can modify opacity values using the `color/opacity` syntax (e.g. `border-border/50`).

### Light Mode Variables (`:root`)
| Variable | Value | Description |
| :--- | :--- | :--- |
| `--background` | `210 20% 98%` | Very light, cool blue-gray |
| `--foreground` | `220 20% 10%` | Soft charcoal black |
| `--card` / `--popover` | `0 0% 100%` | Pure white |
| `--card-foreground` | `220 20% 10%` | Soft charcoal black |
| `--primary` | `217 91% 50%` | Vibrant royal blue |
| `--primary-foreground` | `0 0% 100%` | Pure white |
| `--secondary` / `--muted` | `220 14% 96%` | Soft cool gray |
| `--secondary-foreground` | `220 20% 20%` | Slightly darker cool gray |
| `--muted-foreground` | `220 10% 46%` | Medium slate gray (secondary text) |
| `--accent` | `217 91% 95%` | Very soft blue-tinted overlay |
| `--accent-foreground` | `217 91% 40%` | Deep blue |
| `--destructive` | `0 84% 60%` | Vivid crimson red |
| `--destructive-foreground`| `0 0% 100%` | Pure white |
| `--border` / `--input` | `220 13% 91%` | Light, crisp gray |
| `--ring` | `217 91% 50%` | Vibrant royal blue |
| `--radius` | `0.625rem` | `10px` base radius |
| `--surface-elevated` | `0 0% 100%` | Base card background |
| `--surface-hover` | `220 14% 96%` | Light hover gray |
| `--success` | `142 71% 45%` | Emerald green |
| `--warning` | `38 92% 50%` | Amber/orange |

### Dark Mode Variables (`.dark`)
| Variable | Value | Description |
| :--- | :--- | :--- |
| `--background` | `222 47% 6%` | Deep obsidian dark blue |
| `--foreground` | `210 40% 98%` | Bright, cool off-white |
| `--card` / `--popover` | `222 47% 8%` | Dark slate blue card face |
| `--primary` | `217 91% 60%` | Vibrant sky blue |
| `--primary-foreground` | `222 47% 6%` | Deep dark blue |
| `--secondary` / `--muted` | `217 32% 17%` | Muted dark gray-blue |
| `--secondary-foreground` | `210 40% 98%` | Bright, cool off-white |
| `--muted-foreground` | `215 20% 65%` | Slate gray (secondary text) |
| `--accent` | `217 32% 20%` | Dark slate blue-gray overlay |
| `--accent-foreground` | `217 91% 70%` | Light neon blue |
| `--destructive` | `0 62% 50%` | Soft red |
| `--destructive-foreground`| `210 40% 98%` | Cool off-white |
| `--border` / `--input` | `217 32% 17%` | Crisp dark-gray border |
| `--ring` | `217 91% 60%` | Sky blue focus ring |
| `--surface-elevated` | `222 47% 10%` | Slightly lighter dark slate card |
| `--surface-hover` | `217 32% 17%` | Hover dark gray-blue |

---

## 4. Shadows & Depth Elevation

The shadow palette uses high-quality transparency values keyed to HSL colors for dynamic response depending on background darkness.

```css
/* Light Mode Shadows */
--shadow-sm: 0 1px 2px 0 hsl(220 20% 10% / 0.03);
--shadow-md: 0 4px 6px -1px hsl(220 20% 10% / 0.05), 0 2px 4px -2px hsl(220 20% 10% / 0.05);
--shadow-lg: 0 10px 15px -3px hsl(220 20% 10% / 0.08), 0 4px 6px -4px hsl(220 20% 10% / 0.05);

/* Dark Mode Shadows (triggered inside .dark) */
--shadow-sm: 0 1px 2px 0 hsl(0 0% 0% / 0.1);
--shadow-md: 0 4px 6px -1px hsl(0 0% 0% / 0.2), 0 2px 4px -2px hsl(0 0% 0% / 0.15);
--shadow-lg: 0 10px 15px -3px hsl(0 0% 0% / 0.25), 0 4px 6px -4px hsl(0 0% 0% / 0.15);
```

### Tailwind Custom Utilities
- **`shadow-subtle`**: Mapped to `var(--shadow-sm)`.
- **`shadow-elevated`**: Mapped to `var(--shadow-md)`. Used for primary content cards and buttons.
- **`shadow-floating`**: Mapped to `var(--shadow-lg)`. Used for dropdown menus, popovers, and interactive modals.

---

## 5. Animations & Keyframes

IPL Finder uses CSS animations to construct organic, smooth entry states for views, cards, and modal components:

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

### Utility Classes
- `.animate-fade-in`: `fadeIn 0.3s ease-out`. (Used on logins and full-screen screens).
- `.animate-slide-up`: `slideUp 0.3s ease-out`. (Used on list rows, panels, and forms. Staggered dynamically using inline styles `animationDelay: '${index * 50}ms'`).
- `.animate-scale-in`: `scaleIn 0.2s ease-out`. (Used on modal contents).

---

## 6. Layout Archetypes & Visual Structures

### Sticky Glassmorphic Header
- **Layout**: `sticky top-0 z-50 w-full border-b border-border/40 bg-card/80 backdrop-blur-xl h-16`
- **Inner Padding**: `container flex items-center justify-between gap-4 px-4 md:px-6`
- **Brand Logo Icon**: A `h-9 w-9 rounded-lg bg-primary` square housing a white icon, paired with a `hidden sm:inline-block font-semibold`.
- **Portal & Action Buttons**: Mini badges / outline buttons with standard icons (`LayoutGrid`, `Upload`, `LogOut`).

### Floating Search Input
- **Container**: `relative w-full max-w-xl`
- **Icon Position**: Left-aligned (`absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4`)
- **Input Styling**: `w-full pl-10 pr-4 bg-secondary/50 border-transparent focus:border-primary/50 focus:bg-card transition-colors duration-200`
- **Focus Indicator**: Standard Tailwind ring mapped to `--ring` with subtle border-color transition.

### Interactive List Card (e.g., Files)
- **Container**: `group flex items-center justify-between p-4 rounded-xl bg-card border border-border/50 hover:border-border hover:shadow-elevated transition-all duration-200 animate-slide-up`
- **Icon Accent**: `h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary`
- **Highlighting Matches**: Query highlight classes: `bg-primary/20 text-primary font-medium px-0.5 rounded`.
- **Hover Action Buttons**: Hover-revealed panel on the right side of the list: `flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200`.

---

## 7. Role Badge Design Matrix

Badges are highly consistent, utilizing HSL variations with low opacity background fills (`/10` or `/20`) to create a professional indicator pill.
- **Base Badge Styling**: `text-[9px] font-semibold px-1.5 py-0.5 h-4.5 border`

### Color Configurations
| Role / Affiliation | Tailwind Color Mapping | Styling Classes |
| :--- | :--- | :--- |
| **Resident (Owner)** | `green-500` | `bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20` |
| **Resident (Renter)** | `emerald-500` | `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20` |
| **Non-Resident** | `blue-500` | `bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20` |
| **Global Admin** | `rose-500` | `bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20` |
| **Verifier** | `amber-500` | `bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20` |
| **Moderator** | `cyan-500` | `bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20` |

---

## 8. Specific Page Layouts

### Welcome / Login Screen
- Centered container layout using `min-h-screen flex flex-col items-center justify-center p-4 bg-background`.
- Main Login Card uses `w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-elevated`.
- Social Authentication button leverages `variant="outline"` with a heightened spacing: `w-full h-12 text-base` accompanied by flat brand-colored SVGs.
- Footer features security metrics using colored dot decorators:
  ```html
  <div class="h-2 w-2 rounded-full bg-success"></div>
  ```

### Pending / Verification Screen
- Screen center: `min-h-screen bg-background flex items-center justify-center p-4`.
- Center alignment layout: `max-w-md w-full text-center space-y-6`.
- Large status decorator: `mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center` enclosing a vibrant 10x10 Lucide icon (e.g. `Clock`, `Lock`, `Check`).
- Input forms use top-stacked labels with descriptions below (`text-xs text-muted-foreground`).
- Confirmation boxes use green gradient styling: `bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-sm`.
