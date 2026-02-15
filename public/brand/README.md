# Tripti Brand Assets

## Logo Files

### Active Assets
- `tripti-logo.svg` - Full logo with wordmark (primary color, light backgrounds)
- `tripti-icon.svg` - Red logomark for UI elements, buttons, spinners

Source files are in `tripti.ai-logo-final-versions/` (not committed to repo).

## Usage Guidelines

### Full Logo (Theme-Aware)

**Use `<TriptiLogo variant="full" />` component:**
- Headers and navigation bars
- Auth pages (sign in/sign up)
- Landing pages or marketing contexts
- Large header contexts where brand presence is primary
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
**Don't:**
- Recolor, distort, rotate, or crop logos
- Add shadows, gradients, outlines, or filters
- Use generic placeholders instead of brand assets
- Over-brand (keep it subtle and clean)
- Use both logo and icon in the same context (choose one)

## Branded Loading Spinner

The `<BrandedSpinner />` component provides a branded rotation animation for loading states. Use it to replace all generic loading spinners for brand consistency.

**Important:** For static icons, use `<TriptiLogo variant="icon" />`, not the spinner asset.
