# 08 - Dashboard Builder: Implementation Plan

> **Purpose:** Detailed technical implementation plan for adding a customizable, drag-and-drop dashboard builder to TrafficClaw. Phased approach from MVP to full-featured agency product.
>
> **Prerequisite reading:** [07-dashboard-builder-research.md](07-dashboard-builder-research.md) (demand validation and feasibility analysis)

---

## Architecture Overview

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Dashboard Builder                      │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Widget   │  │ Grid Layout  │  │ Theme Engine      │  │
│  │ Palette  │──│ (react-grid- │──│ (colors, fonts,   │  │
│  │ (drag)   │  │  layout)     │  │  logo, branding)  │  │
│  └──────────┘  └──────┬───────┘  └───────────────────┘  │
│                       │                                   │
│              ┌────────▼────────┐                          │
│              │ Layout Config   │                          │
│              │ (JSON)          │                          │
│              └────────┬────────┘                          │
│                       │                                   │
└───────────────────────┼───────────────────────────────────┘
                        │
           ┌────────────▼────────────┐
           │    Admin API            │
           │  (persist layouts,      │
           │   themes, share tokens) │
           └────────────┬────────────┘
                        │
           ┌────────────▼────────────┐
           │  Public Dashboard View  │
           │  /dashboard/view/{id}   │
           │  /share/{token}         │
           │  /embed/{id}            │
           └─────────────────────────┘
```

### Data Model

```
DashboardLayout {
  id: string (UUID)
  userId: number
  name: string
  description?: string
  propertyId: string          // GA4 property
  siteUrl?: string            // GSC site (optional)
  
  // Grid layout
  widgets: WidgetConfig[]
  gridBreakpoints: {          // responsive
    lg: LayoutItem[]
    md: LayoutItem[]
    sm: LayoutItem[]
  }
  
  // Theming
  theme: DashboardTheme
  
  // Sharing
  isPublic: boolean
  shareToken?: string
  embedEnabled: boolean
  
  // Metadata
  createdAt: string
  updatedAt: string
  isTemplate: boolean         // system templates
}

WidgetConfig {
  id: string (UUID)
  type: WidgetType            // 'kpi' | 'area-chart' | 'bar-chart' | 'table' | etc.
  title: string
  
  // Data binding
  dataSource: 'ga4' | 'gsc' | 'audit' | 'ai' | 'static'
  metric?: string             // e.g., 'totalUsers', 'sessions', 'clicks'
  dimension?: string          // e.g., 'date', 'country', 'page'
  dateRange?: '7d' | '14d' | '30d' | '90d' | 'custom'
  filters?: DataFilter[]
  
  // Display
  chartType?: 'area' | 'line' | 'bar' | 'donut' | 'sparkline'
  colorOverride?: string
  showComparison?: boolean    // show % change vs previous period
  
  // Layout (react-grid-layout format)
  layout: {
    x: number
    y: number
    w: number                 // width in grid units (12-col grid)
    h: number                 // height in grid units
    minW?: number
    minH?: number
    maxW?: number
    maxH?: number
  }
}

DashboardTheme {
  preset: 'default' | 'dark' | 'light' | 'midnight' | 'ocean' | 'custom'
  
  // Custom overrides
  primaryColor?: string       // hex
  accentColor?: string
  backgroundColor?: string
  cardBackground?: string
  textColor?: string
  fontFamily?: string
  borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full'
  
  // Branding
  logoUrl?: string
  logoPosition?: 'top-left' | 'top-center' | 'top-right'
  companyName?: string
  showTrafficClawBranding: boolean  // forced true on free/starter
  
  // CSS custom properties (advanced)
  customCSS?: string          // only for agency tier
}

LayoutItem {                  // react-grid-layout format
  i: string                   // widget ID
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  static?: boolean
}
```

---

## Phase 1: MVP (Weeks 1-4)

### Goal
Users can create a custom dashboard by dragging widgets onto a grid, customize colors, and share it via a public link. Replace the current static `/share/{token}` with a dynamic version.

### 1.1 Install Dependencies

```bash
cd web
npm install react-grid-layout @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install -D @types/react-grid-layout
```

**Why these:**
- `react-grid-layout` (22K stars, MIT) -- drag-and-drop grid used by Grafana. Handles resize, responsive breakpoints, collision detection.
- `@dnd-kit/core` + `@dnd-kit/sortable` (17K stars, MIT) -- for dragging widgets from palette to grid. More modern and accessible than react-dnd.

### 1.2 New Files to Create

```
web/src/
├── app/
│   ├── (dashboard)/dashboard/
│   │   └── dashboards/                    # New section
│   │       ├── page.tsx                   # Dashboard list (my dashboards)
│   │       ├── [id]/
│   │       │   └── page.tsx               # Dashboard editor (builder)
│   │       └── templates/
│   │           └── page.tsx               # Template gallery
│   ├── view/
│   │   └── [id]/
│   │       └── page.tsx                   # Public dashboard view (replaces /share for new dashboards)
│   └── api/
│       └── dashboards/
│           ├── route.ts                   # CRUD: list, create
│           ├── [id]/
│           │   ├── route.ts               # CRUD: get, update, delete
│           │   ├── share/
│           │   │   └── route.ts           # Generate/revoke share token
│           │   └── duplicate/
│           │       └── route.ts           # Clone a dashboard
│           └── templates/
│               └── route.ts               # List system templates
├── components/
│   └── dashboard-builder/
│       ├── DashboardGrid.tsx              # react-grid-layout wrapper
│       ├── WidgetPalette.tsx              # Draggable widget list (sidebar)
│       ├── WidgetRenderer.tsx             # Routes widget type → component
│       ├── WidgetConfigPanel.tsx          # Right-side config panel (metric, display options)
│       ├── ThemeCustomizer.tsx            # Color/font/logo picker
│       ├── DashboardToolbar.tsx           # Save, share, preview, undo
│       ├── widgets/
│       │   ├── KPIWidget.tsx              # Single metric + change %
│       │   ├── AreaChartWidget.tsx         # Time-series area chart
│       │   ├── BarChartWidget.tsx          # Bar chart (horizontal/vertical)
│       │   ├── TableWidget.tsx             # Data table with sorting
│       │   ├── DonutChartWidget.tsx        # Donut/pie chart
│       │   ├── TextWidget.tsx              # Static text / heading
│       │   ├── SEOPerformanceWidget.tsx    # GSC clicks/impressions
│       │   └── KeywordsTableWidget.tsx     # Top keywords table
│       └── PublicDashboardView.tsx         # Read-only public renderer
├── lib/
│   └── dashboardBuilder.ts               # Types, helpers, default layouts
├── stores/
│   └── dashboardBuilderStore.ts           # Zustand store for builder state
└── types/
    └── dashboard.ts                       # Shared types (WidgetConfig, DashboardTheme, etc.)
```

### 1.3 Database Schema (Admin API)

Add to `admin/models.py`:

```python
class CustomDashboard(Base):
    __tablename__ = "custom_dashboards"
    
    id = Column(String(36), primary_key=True)  # UUID
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    property_id = Column(String(50), nullable=False)
    site_url = Column(String(255), nullable=True)
    
    # Layout data (JSON)
    widgets = Column(Text, nullable=False)        # JSON: WidgetConfig[]
    grid_layouts = Column(Text, nullable=False)    # JSON: {lg, md, sm}
    theme = Column(Text, nullable=False)           # JSON: DashboardTheme
    
    # Sharing
    is_public = Column(Boolean, default=False)
    share_token = Column(String(64), unique=True, nullable=True)
    embed_enabled = Column(Boolean, default=False)
    
    # Metadata
    is_template = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    views = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    user = relationship("User", back_populates="custom_dashboards")
```

Add migration script: `admin/migrations/009_add_custom_dashboards.py`

### 1.4 Admin API Endpoints

Add to `admin/main.py`:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/custom-dashboards?user_id={id}` | List user's dashboards |
| `POST` | `/api/custom-dashboards` | Create new dashboard |
| `GET` | `/api/custom-dashboards/{id}` | Get dashboard by ID |
| `PUT` | `/api/custom-dashboards/{id}` | Update dashboard (layout, theme, widgets) |
| `DELETE` | `/api/custom-dashboards/{id}` | Soft-delete dashboard |
| `POST` | `/api/custom-dashboards/{id}/share` | Generate share token |
| `DELETE` | `/api/custom-dashboards/{id}/share` | Revoke share token |
| `POST` | `/api/custom-dashboards/{id}/duplicate` | Clone dashboard |
| `GET` | `/api/custom-dashboards/templates` | List system templates |
| `GET` | `/api/custom-dashboards/public/{token}` | Get public dashboard (no auth) |
| `POST` | `/api/custom-dashboards/public/{token}/view` | Increment view count (no auth) |

### 1.5 Next.js API Routes (Web)

All proxy to admin API with auth:

| Method | Path | Proxies To |
|--------|------|------------|
| `GET/POST` | `/api/dashboards` | Admin CRUD |
| `GET/PUT/DELETE` | `/api/dashboards/[id]` | Admin CRUD |
| `POST/DELETE` | `/api/dashboards/[id]/share` | Admin share management |
| `POST` | `/api/dashboards/[id]/duplicate` | Admin clone |
| `GET` | `/api/dashboards/templates` | Admin templates |

The data fetching for widgets reuses existing infrastructure:
- GA4 data: existing `fetchAnalyticsDashboard()` from `lib/googleApi.ts`
- GSC data: existing `fetchSeoDashboard()` from `lib/googleApi.ts`
- Realtime: existing `fetchRealtimeData()` from `lib/googleApi.ts`

### 1.6 Builder UI Flow

```
Dashboard List (/dashboard/dashboards)
├── "New Dashboard" button → opens template picker
├── Template Gallery → select template → creates dashboard → editor
└── Click existing → editor

Dashboard Editor (/dashboard/dashboards/{id})
┌──────────────────────────────────────────────────┐
│ [< Back] [Dashboard Name ___] [Save] [Share] [Preview] │
├──────────┬────────────────────────┬──────────────┤
│ Widget   │                        │ Widget       │
│ Palette  │     Grid Area          │ Config       │
│          │  (react-grid-layout)   │ Panel        │
│ [KPI]    │                        │              │
│ [Chart]  │  ┌────┐ ┌────────────┐│ Title: ___   │
│ [Table]  │  │KPI │ │ Area Chart ││ Metric: [v]  │
│ [Text]   │  │    │ │            ││ Range: [v]   │
│ [SEO]    │  └────┘ └────────────┘│ Color: [#]   │
│ [Map]    │  ┌───────────────────┐│              │
│          │  │   Table Widget    ││              │
│          │  │                   ││              │
│          │  └───────────────────┘│              │
├──────────┴────────────────────────┴──────────────┤
│ Theme: [Dark v] Primary: [■] Logo: [Upload]      │
└──────────────────────────────────────────────────┘
```

### 1.7 Core Component: DashboardGrid.tsx

Key implementation details:

```tsx
// Pseudocode structure
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

// Grid: 12 columns, row height 80px
// Breakpoints: lg (1200+), md (996-1199), sm (768-995)
// Each widget has min/max constraints based on type:
//   KPI:   minW=2, minH=2, maxW=4, maxH=3
//   Chart: minW=4, minH=3, maxW=12, maxH=6
//   Table: minW=4, minH=3, maxW=12, maxH=8
//   Text:  minW=2, minH=1, maxW=12, maxH=4

// Layout changes persist to Zustand store on drag/resize end
// Auto-save debounced (2s) to admin API
// Support for drag-from-palette via dnd-kit
```

### 1.8 Zustand Store: dashboardBuilderStore.ts

```typescript
// State shape (pseudocode)
interface DashboardBuilderState {
  // Current dashboard
  dashboardId: string | null
  name: string
  widgets: WidgetConfig[]
  layouts: { lg: Layout[]; md: Layout[]; sm: Layout[] }
  theme: DashboardTheme
  
  // Editor state
  selectedWidgetId: string | null
  isEditing: boolean
  isDirty: boolean
  undoStack: DashboardSnapshot[]
  redoStack: DashboardSnapshot[]
  
  // Actions
  addWidget: (type: WidgetType, position?: { x: number; y: number }) => void
  removeWidget: (widgetId: string) => void
  updateWidget: (widgetId: string, updates: Partial<WidgetConfig>) => void
  updateLayout: (layouts: Layouts) => void
  updateTheme: (theme: Partial<DashboardTheme>) => void
  selectWidget: (widgetId: string | null) => void
  
  // Persistence
  save: () => Promise<void>
  load: (dashboardId: string) => Promise<void>
  
  // Undo/redo
  undo: () => void
  redo: () => void
  
  // Templates
  applyTemplate: (templateId: string) => void
}
```

### 1.9 Pre-Built Templates (MVP)

| Template | Description | Widgets |
|----------|-------------|---------|
| **Analytics Overview** | Classic GA4-style dashboard | 4 KPIs (users, sessions, pageviews, bounce) + traffic trend + sources + top pages |
| **SEO Performance** | GSC-focused | 4 KPIs (clicks, impressions, CTR, position) + trend chart + top queries + top pages |
| **Combined Report** | Analytics + SEO | All of the above in a comprehensive layout |
| **Executive Summary** | High-level KPIs only | 6 KPI cards + 1 trend chart. Simple, glanceable. |
| **Blank Canvas** | Empty grid | No widgets. Start from scratch. |

### 1.10 Theme Presets (MVP)

| Preset | Background | Cards | Primary | Text |
|--------|-----------|-------|---------|------|
| **Default (Dark)** | zinc-950 | zinc-900 | emerald-500 | white |
| **Light** | white | gray-50 | emerald-600 | gray-900 |
| **Midnight** | slate-950 | slate-900 | blue-500 | white |
| **Ocean** | slate-900 | slate-800 | cyan-500 | white |
| **Forest** | emerald-950 | emerald-900 | lime-400 | white |
| **Custom** | user pick | user pick | user pick | auto |

---

## Phase 2: Sharing & Embedding (Weeks 4-6)

### Goal
Public dashboard links with custom branding. Embeddable dashboards via iframe. Evolve existing `/share/{token}` to use the new dashboard builder.

### 2.1 Public Dashboard View

`/view/{dashboardId}?token={shareToken}`

- Read-only rendering using same widget components
- No editing UI (palette, config panel hidden)
- Theme applied (including custom branding)
- TrafficClaw branding watermark for free/starter tiers
- Date range picker still functional
- Auto-refresh every 5 minutes
- View count tracking
- SEO meta tags for social sharing (og:title, og:image)

### 2.2 Embed Mode

`/view/{dashboardId}?token={shareToken}&embed=true`

- Same as public view but:
  - No header/navigation
  - No footer
  - Transparent background option
  - `postMessage` API for parent frame communication
  - Responsive to iframe dimensions

### 2.3 Embed Code Generator

In the share dialog:

```html
<!-- Standard embed -->
<iframe 
  src="https://trafficclaw.com/view/{id}?token={token}&embed=true"
  width="100%" 
  height="800"
  frameborder="0"
  style="border-radius: 12px; overflow: hidden;"
></iframe>

<!-- With custom height -->
<script src="https://trafficclaw.com/embed.js" 
  data-dashboard="{id}" 
  data-token="{token}"
  data-theme="dark">
</script>
```

### 2.4 Migration Path

Current `/share/{token}` system remains functional. New dashboards use `/view/{id}?token={token}`. The `ShareDashboardModal` gets an "Upgrade to Custom Dashboard" button that converts a static share to a builder dashboard.

---

## Phase 3: Advanced Features (Weeks 6-10)

### 3.1 PDF Export

- Server-side rendering using Puppeteer (or client-side html2canvas + jsPDF)
- Renders the dashboard as a branded PDF
- Includes: logo, company name, date range, all visible widgets
- Page breaks between widget rows
- "Download PDF" button in dashboard toolbar
- Scheduled PDF generation + email delivery (cron job)

### 3.2 Widget Interactions

- **Click-to-drill:** Click a country in the map → filters all widgets to that country
- **Cross-widget filtering:** Select a date range in one chart → all charts update
- **Widget linking:** KPI card links to detailed view when clicked

### 3.3 Custom Widgets (Agency Tier)

- **Custom CSS:** Inject custom CSS for the dashboard
- **Custom metrics:** Define calculated metrics (e.g., "Revenue per Session")
- **Data blending:** Combine GA4 + GSC data in a single chart
- **iFrame widget:** Embed external content within a widget

### 3.4 AI Widget

- Widget that displays AI-generated summary of the dashboard data
- Auto-refreshes weekly
- Uses existing Gemini integration
- "Ask AI about this dashboard" button

### 3.5 Collaboration

- Multiple users can view the same dashboard
- Editor/viewer permissions per shared link
- Comment/annotation on widgets (for agency-client communication)

---

## Phase 4: Agency Tier (Weeks 10-14)

### 4.1 White-Label Branding

- Remove all TrafficClaw branding
- Custom logo upload
- Custom domain support (CNAME: `analytics.clientdomain.com` → TrafficClaw)
- Custom email sender for scheduled reports
- Client portal login (viewer accounts)

### 4.2 Multi-Client Management

- Agency overview: all client dashboards in one view
- Bulk operations (create dashboard from template for all clients)
- Client-specific color themes
- Usage tracking per client

### 4.3 Scheduled Reports

- Cron-based: daily, weekly, monthly
- PDF attachment via email
- Customizable recipient list per dashboard
- Include AI summary in email body

---

## Implementation Details

### Widget Data Fetching Strategy

Each widget fetches its data independently via SWR:

```typescript
// Pseudocode
function useWidgetData(widget: WidgetConfig, propertyId: string) {
  const fetcher = getWidgetFetcher(widget.dataSource, widget.type);
  
  return useSWR(
    ['widget-data', widget.id, widget.metric, widget.dateRange],
    () => fetcher(propertyId, widget),
    {
      refreshInterval: widget.dataSource === 'realtime' ? 60000 : 300000,
      dedupingInterval: 60000,
      revalidateOnFocus: false,
    }
  );
}
```

For public dashboards, data is fetched server-side and cached:
- GA4 data: cached 5 minutes (same as current embed)
- GSC data: cached 15 minutes
- AI summary: cached 1 hour

### Widget API Route

New unified widget data endpoint:

```
GET /api/dashboards/[id]/widget-data
  ?widgetType=area-chart
  &metric=totalUsers
  &dimension=date
  &dateRange=30d
```

For public dashboards:
```
GET /api/dashboards/public/[token]/widget-data
  ?widgetType=area-chart
  &metric=totalUsers
  &dimension=date
  &dateRange=30d
```

This avoids each widget making separate GA4 API calls. The endpoint batches requests and returns data for multiple widgets in one response.

### Layout Persistence

Layouts are saved as JSON in the `custom_dashboards` table:

```json
{
  "lg": [
    { "i": "widget-1", "x": 0, "y": 0, "w": 3, "h": 2 },
    { "i": "widget-2", "x": 3, "y": 0, "w": 9, "h": 4 },
    { "i": "widget-3", "x": 0, "y": 4, "w": 12, "h": 4 }
  ],
  "md": [...],
  "sm": [...]
}
```

Auto-save: debounced 2s after layout change, with optimistic UI.

### Theme Application

Themes are applied via CSS custom properties on the dashboard container:

```css
.dashboard-view[data-theme="custom"] {
  --db-bg: var(--theme-bg, #09090b);
  --db-card: var(--theme-card, #18181b);
  --db-primary: var(--theme-primary, #10b981);
  --db-text: var(--theme-text, #ffffff);
  --db-radius: var(--theme-radius, 0.5rem);
  --db-font: var(--theme-font, 'Geist Sans', sans-serif);
}
```

This keeps theme isolated to the dashboard without affecting the main app.

---

## Effort Estimates

| Phase | Scope | Estimate | Dependencies |
|-------|-------|----------|--------------|
| **Phase 1** | MVP: grid + 8 widgets + 5 templates + themes + CRUD | 3-4 weeks | None |
| **Phase 2** | Public sharing + embed + migration | 2 weeks | Phase 1 |
| **Phase 3** | PDF + AI widget + interactions + custom CSS | 3-4 weeks | Phase 2 |
| **Phase 4** | White-label + multi-client + scheduled reports | 3-4 weeks | Phase 3 |
| **Total** | Full feature set | ~12-14 weeks | |

**MVP-only (Phase 1+2): ~5-6 weeks** -- This alone creates significant value.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **react-grid-layout performance with many widgets** | Limit to 20 widgets per dashboard. Virtualize off-screen widgets. |
| **GA4 API quota exhaustion from many widgets** | Batch widget data requests. Single API call returns data for multiple widgets. Cache aggressively (5-min TTL). |
| **Layout serialization edge cases** | Use react-grid-layout's built-in `onLayoutChange` which returns clean JSON. Validate on save. |
| **Theme CSS conflicts with main app** | Scope all dashboard-builder styles under a `.dashboard-view` container class. Use CSS custom properties, not globals. |
| **Complex undo/redo** | Use Zustand with immutable snapshots. Limit undo stack to 50 entries. |
| **Migration from old share system** | Keep old `/share/{token}` working. Add "Upgrade" CTA. Don't break existing links. |
| **Mobile editing** | Don't. Dashboard editing is desktop-only (1024px+). Public viewing is responsive. |

---

## Success Metrics

| Metric | Target (3 months post-launch) |
|--------|-------------------------------|
| Custom dashboards created | 100+ |
| Dashboard shares generated | 50+ |
| Agency tier conversions | 5-10 |
| Average widgets per dashboard | 6-8 |
| Public dashboard views | 1,000+ |
| Template usage rate | 70%+ (vs blank canvas) |

---

## Relationship to Existing Roadmap

This feature encompasses and accelerates several items from `06-feature-roadmap.md`:

| Roadmap Item | Status | How Dashboard Builder Covers It |
|-------------|--------|--------------------------------|
| QW-4: Pre-Built Report Templates | Subsumed | Templates are built into the dashboard builder |
| ME-1: White-Label Agency Mode | Accelerated | Phase 4 delivers this as part of the builder |
| ME-4: Automated PDF Reports | Included | Phase 3 adds PDF export |
| FV-6: Multi-Site Management | Partially | Agency tier includes multi-client view |

**Net effect:** Building the dashboard builder delivers 4 roadmap items in one cohesive feature, rather than as separate disconnected features.

---

## Next Steps

1. **Validate with 2-3 users** -- Share this plan with early users/beta testers. Do they want templates + sharing, or full drag-and-drop? This determines whether Phase 1 can be simplified further.
2. **Spike: react-grid-layout integration** -- Build a 2-hour prototype with react-grid-layout + 2 widget types to validate the technical approach.
3. **Design mockups** -- Create wireframes for the builder UI before coding.
4. **Begin Phase 1** -- Start with the data model + admin API + Zustand store, then build UI on top.

---

*Last updated: April 2026*
*Based on: 07-dashboard-builder-research.md, codebase exploration, open-source library analysis*
