# reactive-launch

Hosts `animations.js` for the **Reactive launch** Webflow project, served via GitHub Pages.

## Usage

Add to Webflow → Site Settings → Custom Code → Footer Code (before `</body>`):

```html
<script src="https://florian-silvester.github.io/reactive-launch/animations.js?v=1"></script>
```

Bump the `?v=` query parameter to bust the browser cache after updating the file.

## Updating

```bash
git add animations.js
git commit -m "Update animations"
git push
```

GitHub Pages rebuilds in ~30–60 seconds after the push.
