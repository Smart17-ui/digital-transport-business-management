import { mapPage } from '@/components/map-page';

const CSS = `
  .car {
    width: 38px; height: 38px; border-radius: 50%; background: #22C55E; border: 3px solid #FFFFFF;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center;
  }
  .place { width: 18px; height: 18px; border-radius: 50%; background: #B3261E; border: 3px solid #FFFFFF; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45); }
`;

const SCRIPT = `
  var EMPTY = { type: 'FeatureCollection', features: [] };
  var car = null;
  var place = null;
  var knownCar = null;

  map.on('load', function () {
    map.addSource('routes', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'other-routes', type: 'line', source: 'routes', filter: ['==', ['get', 'chosen'], false],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#8E96A1', 'line-width': 6, 'line-opacity': 0.8 },
    });
    map.addLayer({
      id: 'route-edge', type: 'line', source: 'routes', filter: ['==', ['get', 'chosen'], true],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#0F6B3C', 'line-width': 10 },
    });
    map.addLayer({
      id: 'route', type: 'line', source: 'routes', filter: ['==', ['get', 'chosen'], true],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#22C55E', 'line-width': 6 },
    });
    map.on('click', 'other-routes', function (event) {
      tell({ type: 'route', index: event.features[0].properties.index });
    });
    ready();
  });

  // routes: a list of coordinate lists.
  window.setRoutes = function (routes, chosen) {
    map.getSource('routes').setData({
      type: 'FeatureCollection',
      features: routes.map(function (line, index) {
        return { type: 'Feature', properties: { index: index, chosen: index === chosen }, geometry: { type: 'LineString', coordinates: line } };
      }),
    });
  };

  window.setPlace = function (position) {
    if (place) { place.remove(); place = null; }
    if (!position) return;
    var element = document.createElement('div');
    element.className = 'place';
    place = new maplibregl.Marker({ element: element }).setLngLat(position).addTo(map);
  };

  // The vehicle: an arrow that turns with the direction of travel.
  window.setCar = function (position, heading) {
    if (!car) {
      var element = document.createElement('div');
      element.className = 'car';
      element.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2 20 21 12 16.5 4 21Z" fill="#0E1116" /></svg>';
      car = new maplibregl.Marker({ element: element, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(position).addTo(map);
      if (!knownCar) map.jumpTo({ center: position, zoom: 14 });
    }
    knownCar = position;
    car.setLngLat(position);
    if (heading !== null) car.setRotation(heading);
  };

  // Everything in view from above, for choosing a route.
  window.showAll = function (line) {
    var bounds = new maplibregl.LngLatBounds();
    line.forEach(function (point) { bounds.extend(point); });
    if (knownCar) bounds.extend(knownCar);
    map.fitBounds(bounds, { padding: 60, pitch: 0, bearing: 0, maxZoom: 16, duration: 500 });
  };

  // Close behind the vehicle, with the way ahead at the top of the screen.
  window.follow = function (position, heading) {
    map.easeTo({ center: position, bearing: heading === null ? map.getBearing() : heading, pitch: 50, zoom: 16.5, duration: 900, offset: [0, 90] });
  };
`;

export function navMapHtml(dark: boolean): string {
  return mapPage(dark, CSS, SCRIPT);
}
