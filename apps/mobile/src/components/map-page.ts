/**
 * The page inside a map's WebView: MapLibre with OpenFreeMap's tiles, which need
 * no key or billing. The library's fingerprints mean a changed copy from the CDN
 * will not run, and the policy lets the page talk to the map host and nothing else.
 * Changing the version means changing both fingerprints.
 */
const MAPLIBRE = 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl';
const SCRIPT_HASH = 'sha384-/L1njH4bbgNt9Uk3HwJ272N9fxJzRBQCxhtwGkZiqgl+Nxpq2ETUNZhNMNV1RgyW';
const STYLE_HASH = 'sha384-Nq6PQ+9vJPvw7U/VfDELyrWoGQMsy0gi6QShhaSrGzkpF5KkM40csg2leky+YMTd';
const TILES = 'https://tiles.openfreemap.org';

/** `script` sees `map` and `tell`, and calls `ready()` once it can take data. */
export function mapPage(dark: boolean, css: string, script: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src data: blob: ${TILES}; connect-src ${TILES}; worker-src blob:; child-src blob:;" />
<link rel="stylesheet" href="${MAPLIBRE}.css" integrity="${STYLE_HASH}" crossorigin="anonymous" />
<style>
  html, body, #map { margin: 0; height: 100%; background: ${dark ? '#0E1116' : '#F5F6F8'}; }
  ${css}
</style>
</head>
<body>
<div id="map"></div>
<script>
  function tell(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  function failed() { tell({ type: 'failed' }); }
</script>
<script src="${MAPLIBRE}.js" integrity="${SCRIPT_HASH}" crossorigin="anonymous" onerror="failed()"></script>
<script>
  var loaded = false;
  var map = new maplibregl.Map({
    container: 'map',
    style: '${TILES}/styles/${dark ? 'dark' : 'liberty'}',
    center: [28.2833, -15.4167],
    zoom: 11,
    attributionControl: { compact: true },
  });
  function ready() { loaded = true; tell({ type: 'ready' }); }
  map.on('error', function () { if (!loaded) failed(); });
  ${script}
</script>
</body>
</html>`;
}
