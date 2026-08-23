# Periodic Vision

An interactive, responsive periodic table with a neon glassmorphism interface and smoothly animated 3D element visualizations.

## Features

- Complete 118-element periodic table with atomic number, symbol, name, and atomic mass.
- Organized category filters for Alkali, Alkaline Earth, Transition, Post-Transition, Metalloids, Nonmetals, Halogens, Noble Gases, Lanthanides, and Actinides.
- Interactive 3D layouts:
  - Sphere
  - Helix
  - Grid
  - Wave
  - Cylinder
  - Scatter
  - Pyramid
- Smooth pointer dragging, touch interaction, zooming, rotation, and optional auto-spin.
- Responsive layout for desktop, tablet, and narrow mobile screens.
- Compact mobile periodic-table layout with horizontal scrolling where necessary.
- Crystal-like dark background with subtle grid lines, glow, particles, and animated lighting.
- Keyboard-friendly controls and reduced-motion support.

## Controls

- Select a view from the top navigation.
- Drag the 3D scene to rotate it.
- Scroll or pinch to zoom.
- Use the spin button or press `Space` to toggle automatic rotation.
- Use reset to restore the default camera position.
- Select a category from the bottom legend to filter or highlight elements.

## Run locally

This is a dependency-free static web project. Open `index.html` in a browser, or serve the folder with any local static server:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Project structure

```text
Periodic Table/
├── index.html          # Application markup
├── css/style.css       # Layout, responsive styling, effects, and animations
├── js/main.js          # Rendering, interaction, camera motion, and view layouts
└── data/elements.js    # Periodic-table element data
```

## Browser support

Use a modern browser with support for CSS Grid, CSS custom properties, Pointer Events, Canvas, and `backdrop-filter` for the complete visual experience.
