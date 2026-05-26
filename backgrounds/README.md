# backgrounds/

Homepage background assets for Litzium.

| File | Purpose |
|------|---------|
| `gradients.json` | Named CSS gradient presets for the New Tab page background. Add your own entries and reference them by `id`. |

## Adding a custom background image

Drop a `.jpg` or `.png` into this folder and reference it from `theming/newtab.css`:

```css
.nt-bg {
  background-image: url('../../backgrounds/my-photo.jpg');
  background-size: cover;
  background-position: center;
}
```
