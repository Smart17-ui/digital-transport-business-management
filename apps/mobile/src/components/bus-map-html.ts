import { mapPage } from '@/components/map-page';

const CSS = `
  .bus {
    padding: 5px 10px; border-radius: 999px; font: 700 13px system-ui, sans-serif; white-space: nowrap;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4); cursor: pointer; border: 2px solid #FFFFFF;
    background: #22C55E; color: #0E1116;
  }
  .bus.quiet { background: #5B626C; color: #FFFFFF; }
  .bus.chosen { border-color: #0E1116; }
`;

const SCRIPT = `
  var markers = {};
  var fitted = false;
  map.on('load', ready);

  // Plates are set as text, never as markup.
  window.setBuses = function (buses, chosen) {
    var seen = {};
    buses.forEach(function (bus) {
      seen[bus.id] = true;
      var marker = markers[bus.id];
      if (!marker) {
        var element = document.createElement('div');
        element.addEventListener('click', function (event) {
          event.stopPropagation();
          tell({ type: 'bus', id: bus.id });
        });
        marker = markers[bus.id] = new maplibregl.Marker({ element: element }).setLngLat([bus.longitude, bus.latitude]).addTo(map);
      }
      marker.setLngLat([bus.longitude, bus.latitude]);
      var element = marker.getElement();
      element.textContent = bus.plate;
      // Added to, never replaced: MapLibre keeps its own classes on the marker.
      element.classList.add('bus');
      element.classList.toggle('quiet', !bus.live);
      element.classList.toggle('chosen', bus.id === chosen);
    });
    Object.keys(markers).forEach(function (id) {
      if (!seen[id]) { markers[id].remove(); delete markers[id]; }
    });
    if (!fitted && buses.length > 0) {
      fitted = true;
      if (buses.length === 1) {
        map.jumpTo({ center: [buses[0].longitude, buses[0].latitude], zoom: 14 });
      } else {
        var bounds = new maplibregl.LngLatBounds();
        buses.forEach(function (bus) { bounds.extend([bus.longitude, bus.latitude]); });
        map.fitBounds(bounds, { padding: 70, maxZoom: 14, animate: false });
      }
    }
  };

  window.showBus = function (longitude, latitude) {
    map.easeTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 14) });
  };
`;

export function busMapHtml(dark: boolean): string {
  return mapPage(dark, CSS, SCRIPT);
}
