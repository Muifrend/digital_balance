# Canopy — Design Specification


---

## 01 · Design Principles

Three values drive every visual and interaction decision. When choices conflict, these resolve them.

**Calm first.** The app never pressures. Whitespace is not absence — it is deliberate quiet. Every surface should feel like opening a good notebook, not launching a dashboard.

**Coach, not critic.** Feedback is warm, specific, and grounded in the user's own data. Streaks and scores exist to build momentum, never to shame. The tone is a trusted mentor, not a productivity algorithm.

**Honest reflection.** The record of how time was spent is always truthful. Reflection is about understanding patterns — not erasing the human parts of the day in pursuit of a perfect metric.

---

## 02 · Color

The palette is built entirely from muted earth tones and desaturated naturals. No pure hues, no saturated brights. Every color should feel like it belongs in a well-made physical object — a linen notebook, aged wood, dried herbs.

### Backgrounds

| Role | Hex | Usage |
|---|---|---|
| Surface | `#FDFCF9` | Cards, modals, content areas |
| Base | `#F5F2EC` | App background |
| Elevated | `#EDE9E0` | Sidebar, panels |
| Recessed | `#E4DFD3` | Hover states, inset fields |

Backgrounds are never white. The warmest neutral — `#FDFCF9` — is the lightest surface. Moving darker communicates depth: panels sit on Base, sidebars use Elevated, hover states reveal Recessed.

### Olive — Primary

| Stop | Hex | Notes |
|---|---|---|
| 50 | `#F4F5EC` | Badge fills, tinted backgrounds |
| 100 | `#E4E8CB` | Time block fills |
| 200 | `#C8CE96` | Dividers, subtle accents |
| 300 | `#A8AD78` | Focus rings (unfocused) |
| 400 | `#7D8448` | Border accents, secondary actions |
| **500** | **`#5C6230`** | **Primary — buttons, active states, rings** |
| 600 | `#424824` | Text on light olive fills |
| 700 | `#2E3118` | Headings on olive surfaces |

Olive is the brand color. 500 is the primary interactive color. Use 50–100 for tinted surfaces and badge fills. Use 600–700 only as text on light olive fills.

### Sage — Reflection & Personal

| Stop | Hex | Notes |
|---|---|---|
| 100 | `#DDE8DC` | Block fills |
| 200 | `#B5CEAF` | Border accents |
| 300 | `#8BAD86` | Icon fills, ring progress |
| **500** | **`#4E7249`** | **Primary — text, active indicators** |

Sage signals rest and personal time. Used for journal entries, break blocks, reflection prompts, and the evening wind-down panel. Never use for tasks, meetings, or productivity metrics — that blurs its semantic meaning.

### Amber — Meetings & Collaboration

| Stop | Hex | Notes |
|---|---|---|
| 100 | `#F7E8C8` | Block fills |
| 300 | `#E5B84A` | Ring progress, accents |
| **400** | **`#C9952A`** | **Primary — borders, active text** |

Amber carries the warmth of social energy — meetings, standups, calls. It reads as engaged but not alarming.

### Terracotta — Active & Alerts

| Stop | Hex | Notes |
|---|---|---|
| 100 | `#F2E2D5` | Block fills |
| 300 | `#D08265` | Current-time dot, ring |
| **500** | **`#A3573A`** | **Primary — active timer text** |

Terracotta is used sparingly: the current-time line, active timer blocks (dashed + slightly transparent), and the streak widget. Never use for destructive actions — that reads as dangerous, not energetic. Destructive actions use a desaturated red separate from this palette.

### Semantic Mapping

| Category | Color | Application |
|---|---|---|
| Deep work / Focus | Olive | Block fill + left border |
| Meetings | Amber | Block fill + left border |
| Personal / Break | Sage | Block fill + left border |
| Active / In progress | Terracotta | Dashed block, now-line |
| Neutral / Uncategorized | `#E4DFD3` + `rgba(90,80,60,0.22)` | Block fill + border |

### Borders

All borders use a single alpha-based value derived from the text color — they adapt automatically to future dark mode without new definitions.

```
--border:  rgba(90, 80, 60, 0.12)   /* default */
--border2: rgba(90, 80, 60, 0.22)   /* emphasis, hover */
```

---

## 03 · Typography

Two typefaces. One carries warmth and character; the other handles clarity and utility.

### Typefaces

**DM Serif Display** — used for anything that carries meaning beyond navigation: screen titles, dates, coach messages, reflection prompts, the wordmark. Its italic cut is reserved specifically for reflection questions, giving them the feeling of handwritten prompts. Never use it for labels, captions, or interactive elements.

**DM Sans** — used for all UI chrome: labels, body copy, navigation, captions, buttons, time values. Its optical size range (`opsz 9..40`) keeps it readable at 10px captions and comfortable at 16px body without switching weights aggressively.

### Type Scale

| Role | Typeface | Size | Weight | Usage |
|---|---|---|---|---|
| Display | DM Serif Display | 44–58px | 400 | Marketing, empty states, onboarding |
| Screen title | DM Serif Display | 26–32px | 400 | Date headings, section names |
| Serif body | DM Serif Display italic | 13–15px | 400 italic | Reflection prompts, coach quotes |
| UI heading | DM Sans | 15–16px | 500 | Panel titles, block titles |
| Body | DM Sans | 13px | 400 | Coach messages, descriptions, notes |
| UI label | DM Sans | 12px | 400–500 | Nav items, meta text, timestamps |
| Caption | DM Sans | 10–11px | 600 | Section labels (uppercase + tracked) |
| Mono | System mono | 11px | 400 | Hex values, token references |

### Caption Treatment

All section labels follow the same rule: `10–11px · font-weight 600 · text-transform: uppercase · letter-spacing: 0.10–0.12em · color: --text-tertiary`. This creates a consistent visual hierarchy anchor across the app without using size alone.

### Text Colors

```
--text-primary:   #2A2820   /* headings, body, block titles */
--text-secondary: #6B6455   /* descriptions, coach messages, nav */
--text-tertiary:  #9E9585   /* captions, timestamps, placeholders */
```

Line height is `1.6` for body copy, `1.2–1.3` for headings, and `1.5` for coach messages and reflection prompts — slightly looser to invite reading rather than scanning.

---

## 04 · Spacing

All spacing is derived from a 4px base unit.

| Token | Value | Usage |
|---|---|---|
| `space-1` | 4px | Icon gaps, tight inline spacing |
| `space-2` | 8px | Between related elements within a component |
| `space-3` | 12px | Component internal padding (compact) |
| `space-4` | 16px | Standard internal padding |
| `space-5` | 20px | Section padding, card padding |
| `space-6` | 24px | Between sibling components |
| `space-8` | 32px | Section gaps |
| `space-12` | 48px | Major section breaks |

Use rem for vertical rhythm (`1rem`, `1.5rem`, `2rem`) and px for component-internal gaps. Never hardcode arbitrary values — always reach for the nearest token.

---

## 05 · Border Radius

| Token | Value | Usage |
|---|---|---|
| `--r-sm` | 6px | Time blocks, badges, small inputs |
| `--r-md` | 10px | Buttons, inputs, metric cards |
| `--r-lg` | 16px | Panel cards, coach card, habit rings container |
| `--r-xl` | 22px | App window frame, large modals |

Radius scales with element size. A small badge and a large modal should both feel proportionally rounded — not one sharp element floating among soft ones.

---

## 06 · Elevation & Surfaces

Groundwork uses no drop shadows in the conventional sense. Depth is communicated entirely through background layering — a darker surface beneath a lighter one creates perceived lift.

| Level | Background | Border | Usage |
|---|---|---|---|
| 0 — Page | `#F5F2EC` | none | App background |
| 1 — Panel | `#EDE9E0` | none | Sidebar, right panel |
| 2 — Card | `#FDFCF9` | `0.5px solid --border` | Content cards, components |
| 3 — Raised | `#FDFCF9` | `1px solid --border2` | Active selected card, focused input |

The window chrome itself (title bar) sits at Level 1. Content areas at Level 0. This keeps the chrome visually quiet behind the content.

---

## 07 · Iconography

Icons are 16×16px, stroke-based, `stroke-width: 1.3–1.5`, rounded linecaps and joins. They are never filled. Icon color follows `--text-secondary` at rest and `--text-primary` on hover or active.

The style is simple and un-decorative — the same visual weight as the UI label text they sit beside. Icons should never carry the communication alone; they always accompany a text label in primary navigation.

**Do not use emoji as icons.** The warmth in this app comes from type and color, not from pictographic decoration.

---

## 08 · Motion

Animation follows the emotional register of the app: nothing snaps or bounces aggressively. Transitions feel like someone turning a page, not clicking a button in a SaaS tool.

| Name | Duration · Easing | Usage |
|---|---|---|
| Micro | `80–120ms · ease-out` | Hover fills, button press, toggle, checkbox check |
| Transition | `200ms · ease-in-out` | Panel open/close, block drag, focus ring appear |
| Entry | `280ms · cubic-bezier(0.16, 1, 0.3, 1)` | New block appear, modal open, coach card mount |
| Coach reveal | `400ms · staggered · fade + translate-y(4px)` | Coach message types in line by line |
| Streak pulse | `2s · ease-in-out · infinite` | Breathing glow on active streak card |

**Principles:**
- Nothing should feel instant or jarring. If something appears or disappears without a transition, it reads as a bug.
- Stagger reveals (like the coach message) at `60–80ms` per line.
- All animations respect `prefers-reduced-motion` — motion collapses to opacity fade only.
- Never animate layout properties (`width`, `height`, `top`, `left`). Use `transform` and `opacity` only.

---

## 09 · Voice & Tone

The app speaks in one consistent voice across coach messages, empty states, reflection prompts, and tooltips. Getting this right matters as much as the visual system.

**The voice is:** warm, specific, grounded, unhurried.

**The voice is never:** generic, gamified, urgent, clinical, or flattering.

| ✓ Do | ✗ Don't |
|---|---|
| "Nice deep work block this morning." | "Great job! You crushed it today 🔥" |
| "You've been consistent for 12 days." | "12 day streak! Keep it up!" |
| "Your focus tends to peak after movement." | "Optimize your performance with these tips." |
| "What was the one moment you felt most like yourself?" | "How productive were you today? Rate your day!" |
| "Consider a short walk before your next session." | "You should work out to boost productivity." |

Reflection prompts use the serif italic type treatment and are phrased as open questions — never yes/no, never productivity-framed. They invite honesty, not performance.

---

## 10 · Component Tokens (Quick Reference)

```css
/* Backgrounds */
--bg:       #F5F2EC;
--bg2:      #EDE9E0;
--bg3:      #E4DFD3;
--surface:  #FDFCF9;
--surface2: #F8F5EF;

/* Borders */
--border:   rgba(90, 80, 60, 0.12);
--border2:  rgba(90, 80, 60, 0.22);

/* Olive */
--olive-50:  #F4F5EC;
--olive-100: #E4E8CB;
--olive-400: #7D8448;
--olive-500: #5C6230;
--olive-600: #424824;

/* Sage */
--sage-100: #DDE8DC;
--sage-300: #8BAD86;
--sage-500: #4E7249;

/* Amber */
--amber-100: #F7E8C8;
--amber-400: #C9952A;

/* Terra */
--terra-100: #F2E2D5;
--terra-300: #D08265;
--terra-500: #A3573A;

/* Text */
--text-primary:   #2A2820;
--text-secondary: #6B6455;
--text-tertiary:  #9E9585;

/* Radius */
--r-sm: 6px;
--r-md: 10px;
--r-lg: 16px;
--r-xl: 22px;
```

---

## Note on the Left Navigation Bar

The sidebar in the design sheet is the one place where a layout decision was made and is worth documenting here, because it reflects a deliberate application of the token system above rather than a structural choice.

**Width:** 220px fixed. This was chosen to be narrow enough to feel like a quiet presence — not a control panel — while giving nav labels room to breathe without truncation.

**Background:** `--bg2` (`#EDE9E0`), one step darker than the main canvas (`--bg`). No border-shadow or drop shadow. The depth between sidebar and content is created entirely by the surface layering system in Section 06 — the sidebar is Level 1, the content area is Level 0.

**Active state:** The active nav item uses `--olive-50` as its fill and `--olive-600` for its text — the lightest and darkest stops of the primary ramp. No underlines, no left-bar indicator, no bold weight shift alone. The tinted fill is enough; it reads clearly without competing with the content.

**Section labels** inside the nav follow the caption treatment from Section 03 exactly: `10px · uppercase · letter-spacing 0.1em · --text-tertiary`. They function as quiet organizers, not headings.

**The streak card** at the base of the sidebar uses `--olive-500` as a solid fill — the only place in the sidebar where the primary brand color appears at full saturation. This makes it feel earned and warm rather than promotional. The week-dot row uses `rgba(255,255,255,0.85)` for completed days and `rgba(255,255,255,0.4)` for upcoming — no separate icon set needed.

**Icons** in the nav are 16×16px, stroke-weight 1.5, color `--text-secondary` at rest and `--olive-600` when active — consistent with the iconography rules in Section 07.
