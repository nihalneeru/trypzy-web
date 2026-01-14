# Trypzy Brand Assets

## Logo Files

### Full Logos (Theme-Aware SVG)
- `trypzy-light-background-full-logo-with-spacing.svg` - Full logo for light theme
- `trypzy-dark-background-full-logo-with-spacing.svg` - Full logo for dark theme

### Legacy Full Logo (PNG - fallback)
- `trypzy-logo.png` - Full logo with text (used as fallback until SVG files are added)

### Logomark (SVG)
- `trypzy-logomark.svg` - Icon-only logomark (for icon-sized renders)

### Legacy Icon (PNG - fallback)
- `trypzy-icon.png` - Icon only (square format, used as fallback until SVG logomark is added)

## Usage Guidelines

### Component Usage

**Always use the `<TrypzyLogo />` component** from `@/components/brand/TrypzyLogo` instead of directly using Image components with logo files.

```jsx
import { TrypzyLogo } from '@/components/brand/TrypzyLogo'

// Full logo variant (default)
<TrypzyLogo variant="full" className="h-8 w-auto" />

// Icon/logomark variant
<TrypzyLogo variant="icon" className="h-8 w-8" />
```

The `TrypzyLogo` component:
- Automatically switches between light/dark full logo variants when SVG files are available
- Uses the logomark SVG for icon variants when available
- Falls back to PNG files for compatibility

### Logo Variants

**Use the Full Logo (`variant="full"`):**
- Auth pages (sign in/sign up)
- Landing pages or marketing contexts
- Large header contexts where brand presence is primary
- Headers/navigation bars
- Default size: 120-160px height (responsive), or `h-8 w-auto` for headers

**Use the Logomark/Icon (`variant="icon"`):**
- Small icon contexts (though `BrandedSpinner` is preferred for spinners)
- Icon-sized renders where full logo would be too large
- Default size: 24-32px

### Implementation

- **Always use the `TrypzyLogo` component** - do not use Image components directly with logo files
- The component handles theme detection and asset selection automatically
- Maintain aspect ratio - do not stretch or distort (use `h-*` with `w-auto` for full logos)
- Preserve clear space around logos (minimum 10% padding)

### Sizing Guidelines

- **Auth pages**: Logo height 120-160px (responsive) - use `h-32` or similar
- **Headers/Navbar**: Full logo `h-8 w-auto` (32px height)
- **Icon contexts**: Logomark `h-8 w-8` (32px square)
- **Loading spinners**: Use `BrandedSpinner` component instead (16-32px varies by context)

### Do's and Don'ts

✅ **Do:**
- Use `TrypzyLogo` component for all logo displays
- Use `BrandedSpinner` component for loading states
- Maintain consistent sizing within contexts
- Use full logo in headers/nav, logomark for icon contexts
- Keep brand usage tasteful and minimal

❌ **Don't:**
- Use Image components directly with logo files
- Recolor, distort, rotate, or crop logos
- Add shadows, gradients, outlines, or filters
- Use generic placeholders instead of brand assets
- Use the logomark for animated spinners (use `BrandedSpinner` instead)
- Over-brand (keep it subtle and clean)
- Use both logo and icon in the same context (choose one)

## Branded Loading Spinner

The `<BrandedSpinner />` component (exported from `@/app/HomeClient`) uses the Trypzy icon with a rotation animation. Use it to replace all generic loading spinners for brand consistency.

**Do not use the logomark/icon variant of TrypzyLogo for spinners** - use `BrandedSpinner` instead.

```jsx
import { BrandedSpinner } from '@/app/HomeClient'

<BrandedSpinner size="default" />  // sizes: sm, default, md, lg
```

## Asset Status

**Current State:**
- PNG fallback files are in use (`trypzy-logo.png`, `trypzy-icon.png`)
- SVG logo files (`trypzy-light-background-full-logo-with-spacing.svg`, `trypzy-dark-background-full-logo-with-spacing.svg`, `trypzy-logomark.svg`) are expected but not yet added
- The `TrypzyLogo` component is structured to automatically use SVG files when they become available

**Future:**
- When SVG files are added, the component will automatically switch to theme-aware SVG variants
- No code changes will be needed - the component handles asset selection internally
