# StanfordTube

A static, browser-only way to explore the public video items listed in `videos.csv`.

From this report: https://argo.stanford.edu/catalog?f%5Bcontent_file_mimetypes_ssimdv%5D%5B%5D=video%2Fmp4&f%5Bcontent_file_mimetypes_ssimdv%5D%5B%5D=image%2Fjp2&f%5Bcontent_type_ssimdv%5D%5B%5D=media&f%5Brights_descriptions_ssimdv%5D%5B%5D=world

## Run locally

Serve this directory with any static file server, for example:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. The site also works from a static host such as GitHub Pages. Opening `index.html` directly as a local file may block the CSV request in some browsers.

## How it works

- Search uses the CSV titles and collections. The grid loads cards in batches as you scroll.
- Thumbnail filenames come from each item's structural metadata and are recorded in `thumbnails.json`. The site only requests images listed there; items without a public image show a fallback tile.
- Video views use Stanford's embed service. Item details load from each PURL's `.json` endpoint.
- Likes, watch later, history, playlists, and the selected library view are stored in this browser's local storage. They do not sync between devices.

No build tools, JavaScript frameworks, or backend are required.

When `videos.csv` gains new items, run `python3 scripts/build-thumbnails.py` to update the manifest and sort the CSV: other thumbnails first, then resources labeled “Image of media,” then items without an image.
