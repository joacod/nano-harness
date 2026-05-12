# Renderer Design Tokens

Renderer styles use cascade layers and CSS custom properties as the design-system source of truth.

## Layers

Layer order is declared in `styles/index.css`:

```css
@layer reset, tokens, base, components, utilities;
```

Use each layer for one purpose:

- `reset`: browser reset and global accessibility fallbacks.
- `tokens`: primitive, semantic, and component tokens.
- `base`: root/body/element defaults.
- `components`: app component selectors.
- `utilities`: optional utility classes.

## Token Tiers

Use tokens in this order:

- Primitive tokens hold raw values only, like `--color-purple-300`, `--space-3`, `--radius-lg`.
- Semantic tokens describe product meaning, like `--color-bg-app`, `--color-text-primary`, `--color-status-warning`.
- Component tokens describe local UI behavior, like `--button-ghost-bg`, `--message-user-bg`, `--focus-ring-shadow`.

Component CSS should use semantic or component tokens. Do not add raw colors, spacing, typography, borders, shadows, or motion values directly in `styles/components/*.css` unless the value is layout-specific and not reusable.

Use `rem` for scalable size values. `px` is reserved for hairlines, crisp decorative geometry, media breakpoints, and shadow blur/spread values.

## Current Theme

Nano currently ships one dark visual design. Theme switching should happen by overriding semantic tokens only, not by duplicating component selectors.

## Adding Styles

- Add new raw color values in `colors.css`.
- Add meaning in `semantic.css`; keep alpha variants to broad, reused opacity steps instead of exact one-off values.
- Add reusable component-level values in `components.css`.
- Prefer existing spacing, radius, typography, shadow, and motion tokens before adding new ones.
- Keep layout-specific values local when they encode structure, such as grid widths, max widths, or fixed icon sizes.

## Guardrail

Run this after style changes:

```bash
pnpm --filter @nano-harness/desktop check:styles
```

The check prevents raw color, border, radius, spacing, typography, shadow, transition, animation, and transform values from creeping back into component CSS.
