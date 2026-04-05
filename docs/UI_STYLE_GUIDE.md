# Keel UI Style Guide

Reference style guide inspired by the Flow app aesthetic, adapted for Keel's dark theme.

---

## Typography

### Font Stacks

| Purpose    | Stack                                                              |
|------------|--------------------------------------------------------------------|
| UI / Body  | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |
| Monospace  | `'SF Mono', 'Fira Code', 'Cascadia Code', monospace`              |

### Font Sizes

| Token        | Size   | Usage                                      |
|--------------|--------|---------------------------------------------|
| `text-xs`    | 10-11px | Badges, uppercase section labels, metadata |
| `text-sm`    | 12-13px | Secondary labels, sidebar items, captions  |
| `text-base`  | 14px    | Body text, inputs, messages (default)      |
| `text-lg`    | 16px    | Emphasized body, sub-headings              |
| `text-xl`    | 18-20px | Section headings, card titles              |
| `text-2xl`   | 24-28px | Page headings, greeting text               |
| `text-stat`  | 36px+   | Large numeric stats / hero numbers         |

### Font Weights

| Weight | Value | Usage                                       |
|--------|-------|----------------------------------------------|
| Regular | 400  | Body text, messages, descriptions            |
| Medium  | 500  | Buttons, interactive labels                  |
| Semi-bold | 600 | Headings, nav labels, section titles, badges |
| Bold    | 700  | Logo wordmark, stat numbers                  |

### Letter Spacing

| Context                  | Value     |
|--------------------------|-----------|
| Section labels (uppercase) | `0.05em` |
| Body text                | Default   |

### Line Height

| Context    | Value       |
|------------|-------------|
| Body text  | 1.5 - 1.6  |
| Headings   | 1.2 - 1.3  |
| UI labels  | 1.0 - 1.2  |

---

## Spacing Scale

Use an 8px base grid with 4px for fine adjustments.

| Token  | Value | Common usage                          |
|--------|-------|----------------------------------------|
| `xs`   | 2px   | Inline icon gaps                       |
| `sm`   | 4px   | Tight element gaps, small radius       |
| `md`   | 6px   | Inner padding for compact elements     |
| `base` | 8px   | Standard gap, nav item padding         |
| `lg`   | 10px  | Button vertical padding, item padding  |
| `xl`   | 12px  | Section padding, input padding         |
| `2xl`  | 16px  | Card padding, section margins          |
| `3xl`  | 20px  | Container padding                      |
| `4xl`  | 24px  | Major section margins, card padding    |
| `5xl`  | 28px  | Section dividers                       |
| `6xl`  | 32px  | Page-level margins                     |

### Common Padding Patterns

| Element           | Padding          |
|-------------------|------------------|
| Buttons (standard) | `10px 16px`     |
| Buttons (large)   | `12px 24px`      |
| Buttons (compact) | `8px 10px`       |
| Inputs            | `10px 12px`      |
| Cards / panels    | `20px 24px`      |
| Sidebar sections  | `12px 8px`       |
| Nav items         | `8px 10px`       |
| List items        | `9px 10px`       |

---

## Border Radius

| Token       | Value | Usage                              |
|-------------|-------|------------------------------------|
| `radius-sm` | 4px   | Tags, badges, small chips          |
| `radius-md` | 6px   | Inline code, small controls        |
| `radius-base` | 8px | Nav items, dropdowns               |
| `radius-lg` | 10px  | Buttons, inputs                    |
| `radius-xl` | 12px  | Cards, modals                      |
| `radius-2xl`| 16px  | Hero cards, large panels           |
| `radius-full` | 50% | Avatars, circular icons            |

---

## Sidebar / Navigation

### Dimensions

| Property       | Value  |
|----------------|--------|
| Sidebar width  | 260px  |
| Background     | `#151515` |
| Right border   | `1px solid rgba(255,255,255,0.08)` |

### Sidebar Sections (top to bottom)

1. **Logo area** -- `padding: 16px 16px 12px`, bottom border `rgba(255,255,255,0.06)`
2. **Primary actions** -- "New session", "Knowledge Browser", "Settings"; `padding: 12px 8px 0`, `gap: 1px`
3. **Session history** -- Scrollable list; section label is uppercase, 11px, semi-bold, `letter-spacing: 0.05em`

### Nav Item States

| State   | Background                    | Text color                     |
|---------|-------------------------------|--------------------------------|
| Default | transparent                   | `rgba(255,255,255,0.55)`       |
| Hover   | `rgba(255,255,255,0.06)`      | `rgba(255,255,255,0.7)`        |
| Active  | `rgba(207,122,92,0.12)`       | `#CF7A5C`                      |

- Font size: `13px`
- Padding: `8px 10px`
- Border radius: `8px`
- Transition: `all 0.12s`

### Mobile Bottom Nav

- Position: fixed bottom
- Background: `#151515`
- Top border: `1px solid rgba(255,255,255,0.08)`
- Layout: `display: flex; justify-content: space-around; align-items: center`
- Safe area: `padding-bottom: env(safe-area-inset-bottom, 0px)`

---

## Transitions

| Context             | Duration | Easing  |
|---------------------|----------|---------|
| Hover (backgrounds) | 0.12s    | ease    |
| Buttons / inputs    | 0.15s    | ease    |
| Page transitions    | 0.2s     | ease    |

---

## Borders

| Context            | Value                              |
|--------------------|------------------------------------|
| Standard divider   | `1px solid rgba(255,255,255,0.08)` |
| Subtle separator   | `1px solid rgba(255,255,255,0.06)` |
| Input border       | `1px solid rgba(255,255,255,0.1)`  |
| Emphasized divider | `1px solid rgba(255,255,255,0.12)` |

---

## Text Opacity Hierarchy

Used via `rgba(255,255,255, <opacity>)` on dark backgrounds:

| Level      | Opacity | Usage                          |
|------------|---------|--------------------------------|
| Primary    | 0.9     | Headings, body text, inputs    |
| Secondary  | 0.7     | Descriptions, sub-labels       |
| Tertiary   | 0.6     | Timestamps, hints              |
| Muted      | 0.5     | Placeholder text               |
| Subtle     | 0.4     | De-emphasized metadata         |
| Disabled   | 0.3     | Disabled labels                |
| Ghost      | 0.2     | Disabled controls              |

---

## Component Patterns

### Buttons

| Variant   | Background    | Text           | Weight | Radius |
|-----------|---------------|----------------|--------|--------|
| Primary   | `#CF7A5C`     | `#ffffff`      | 600    | 10px   |
| Secondary | transparent   | `rgba(255,255,255,0.5)` | 500 | 10px   |

### Inputs

| Property    | Value                               |
|-------------|--------------------------------------|
| Background  | `#252525`                            |
| Border      | `1px solid rgba(255,255,255,0.08)`   |
| Focus bg    | `#282828`                            |
| Focus border| coral tint                           |
| Font size   | 14px                                 |
| Text color  | `rgba(255,255,255,0.9)`              |
| Radius      | 10px                                 |
| Padding     | `10px 12px`                          |

### Cards / Containers

| Property    | Value                               |
|-------------|--------------------------------------|
| Background  | `#252525` or `#1e1e1e`              |
| Border      | `1px solid rgba(255,255,255,0.08)`   |
| Radius      | 10-16px                              |
| Padding     | 12-24px                              |

### Chat / History Rows

- Table-like layout: timestamp left, message right
- Timestamp: muted color (0.5-0.6 opacity), 13-14px
- Message: primary text color (0.9 opacity), 14px
- Row separation via subtle borders or spacing (`16px` gap)
- Date group headers: uppercase, 11px, semi-bold, `letter-spacing: 0.05em`

### Stats Widget

- Right-aligned panel
- Large numbers: 36px+, bold (700)
- Unit labels: 12px, muted (0.5 opacity)
- Minimal chrome, no visible border

---

## Accent Color

| Token        | Value      | Usage                                      |
|--------------|------------|--------------------------------------------|
| `accent`     | `#CF7A5C`  | Primary buttons, active nav, highlights     |
| `accent-hover` | derived  | Slightly lighter on hover                  |
| `accent-bg`  | `rgba(207,122,92,0.12)` | Active nav item background      |
| `accent-subtle` | `rgba(207,122,92,0.06)` | Soft highlight backgrounds    |
| `accent-link`| `#E09A80`  | Inline links in markdown content            |
