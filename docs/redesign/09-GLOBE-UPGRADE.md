# 09 — Globe Page Upgrade

## Current State
- Mapbox 3D globe with visitor pins
- Activity feed sidebar
- Country/device/referrer breakdowns
- Visitor warmth scoring

## Target Additions

### Timeline Scrubber Mode
- Slider at top: scrub through time (last 24 hours)
- Visitor pins animate chronologically
- Play/pause button to auto-animate
- Window size dropdown: 30min, 1hr, 6hr, 24hr
- Shows session count at current timestamp

### View Toggle
- 3D (current Mapbox globe) / 2D (flat map view)
- 2D mode: use Mapbox static map or simpler rendering
- Persist preference

### Session Pin Click
- Click a visitor pin → open session detail modal
- Shows: pages visited, duration, device, entry/exit pages
- Link to full session in Sessions page

### Implementation
- Add timeline slider component above globe
- Use existing realtime data, add timestamp filtering
- Store view mode in component state
- Session modal reuses existing DrilldownDrawer pattern
