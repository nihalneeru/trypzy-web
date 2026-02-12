# Tripti Brand Assets

## Logo Files

### Primary Assets (Tripti rebrand)
- `tripti-logo.svg` - Full logo for light backgrounds
- `tripti-logo-dark.svg` - Full logo for dark backgrounds
- `tripti-icon.svg` - Small mark / icon for UI elements, buttons, spinners

### Legacy Assets (pre-rebrand, being phased out)
- `trypzy-light-background-full-logo-with-spacing.svg` - Legacy full logo for light backgrounds
- `trypzy-dark-background-full-logo-with-spacing.svg` - Legacy full logo for dark backgrounds
- `trypzy-logomark.svg` - Legacy small mark
- `trypzy-logo.png` - Legacy full logo (deprecated)
- `trypzy-icon.png` - Legacy icon for loading spinners

## Usage Guidelines

### Full Logo (Theme-Aware)

**Use `<TriptiLogo variant="full" />` component:**
- Headers and navigation bars
- Auth pages (sign in/sign up)
- Landing pages or marketing contexts
- Large header contexts where brand presence is primary
- The component automatically selects the correct SVG based on theme (light/dark)
- Default size: height 32px (h-8) with width auto to preserve aspect ratio

### Small Mark (Static Icons)

**Use `<TriptiLogo variant="icon" />` component:**
- Navigation bars (when space is limited)
- UI elements and buttons
- Small contexts where space is limited
- Default size: 24-32px

### Loading Spinners

**Use `<BrandedSpinner />` component:**
- Loading spinners (animated)
- Page-load spinners
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

**Do:**
- Use Next/Image for all brand assets
- Maintain consistent sizing within contexts
- Use logo on auth, icon in nav
- Keep brand usage tasteful and minimal
- Use the new `tripti-*` assets for all new work

**Don't:**
- Recolor, distort, rotate, or crop logos
- Add shadows, gradients, outlines, or filters
- Use generic placeholders instead of brand assets
- Over-brand (keep it subtle and clean)
- Use both logo and icon in the same context (choose one)
- Reference old `trypzy-*` assets in new code

## Branded Loading Spinner

The `<BrandedSpinner />` component provides a branded rotation animation for loading states. Use it to replace all generic loading spinners for brand consistency.

**Important:** For static icons, use `<TriptiLogo variant="icon" />`, not the spinner asset.
