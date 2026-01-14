# Trypzy Brand Assets

## Logo Files

### Full Logo Variants (SVG)
- `trypzy-light-background-full-logo-with-spacing.svg` - Full logo for light backgrounds
- `trypzy-dark-background-full-logo-with-spacing.svg` - Full logo for dark backgrounds

### Small Mark
- `trypzy-logomark.svg` - Small mark for static icon usage (UI elements, buttons, etc.)

### Legacy Assets
- `trypzy-logo.png` - Legacy full logo (deprecated, use SVG variants)
- `trypzy-icon.png` - Icon for loading spinners ONLY (do not use for static icons)

## Usage Guidelines

### Full Logo (Theme-Aware)

**Use `<TrypzyLogo variant="full" />` component:**
- Headers and navigation bars
- Auth pages (sign in/sign up)
- Landing pages or marketing contexts
- Large header contexts where brand presence is primary
- The component automatically selects the correct SVG based on theme (light/dark)
- Default size: height 32px (h-8) with width auto to preserve aspect ratio

### Small Mark (Static Icons)

**Use `<TrypzyLogo variant="icon" />` component:**
- Navigation bars (when space is limited)
- UI elements and buttons
- Small contexts where space is limited
- Default size: 24-32px

**Do NOT use `trypzy-icon.png` for static icons** - use `trypzy-logomark.svg` via the component instead.

### Loading Spinners

**Use `trypzy-icon.png` ONLY for spinners:**
- Loading spinners (animated) - use `<BrandedSpinner />` component
- Page-load spinners
- The `trypzy-icon.png` is specifically designed for rotation animation
- Default size: 16-32px (varies by context)

### Implementation

- Always use Next.js `Image` component for brand assets
- Set `unoptimized={true}` if needed for local development
- Use `priority` prop for above-the-fold logos
- Maintain aspect ratio - do not stretch or distort
- Preserve clear space around logos (minimum 10% padding)

### Sizing Guidelines

- **Auth pages**: Logo height 120-160px (responsive)
- **Navbar**: Icon 24-32px
- **Buttons/Inline**: Icon 16-20px
- **Loading spinners**: Icon 16-32px (varies by context)
- **Modal headers**: Icon 24px if used

### Do's and Don'ts

✅ **Do:**
- Use Next/Image for all brand assets
- Maintain consistent sizing within contexts
- Use logo on auth, icon in nav
- Keep brand usage tasteful and minimal

❌ **Don't:**
- Recolor, distort, rotate, or crop logos
- Add shadows, gradients, outlines, or filters
- Use generic placeholders instead of brand assets
- Over-brand (keep it subtle and clean)
- Use both logo and icon in the same context (choose one)

## Branded Loading Spinner

The `<BrandedSpinner />` component uses `trypzy-icon.png` with a rotation animation. Use it to replace all generic loading spinners for brand consistency.

**Important:** `trypzy-icon.png` is ONLY for spinners. For static icons, use `trypzy-logomark.svg` via `<TrypzyLogo variant="icon" />`.
