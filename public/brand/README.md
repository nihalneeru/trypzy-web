# Trypzy Brand Assets

## Logo Files

- `trypzy-logo.png` - Full logo with text
- `trypzy-icon.png` - Icon only (square format)

## Usage Guidelines

### Logo vs Icon

**Use the Logo (`trypzy-logo.png`):**
- Auth pages (sign in/sign up)
- Landing pages or marketing contexts
- Large header contexts where brand presence is primary
- Default size: 120-160px height (responsive)

**Use the Icon (`trypzy-icon.png`):**
- Navigation bars (navbar)
- Favicons and app icons
- Small contexts where space is limited
- Loading spinners (animated)
- Default size: 24-32px in nav, 16-32px for spinners/buttons

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

The `<BrandedSpinner />` component uses the Trypzy icon with a subtle rotation animation. Use it to replace all generic loading spinners for brand consistency.
