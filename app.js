const defaultCenter = [51.1657, 10.4515];
const state = {
  start: null,
  profile: "trekking",
  distance: 45,
  elevationTarget: null,
  destination: null,
  route: null,
  waypoints: [],
  markers: [],
  variant: 0
};

const $ = (selector) => document.querySelector(selector);
const map = L.map("map", { zoomControl: false, attributionControl: false }).setView(defaultCenter, 6);
L.control.zoom({ position: "topright" }).addTo(map);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  crossOrigin: true
}).addTo(map);

const routeLayer = L.geoJSON(null, {
  style: { color: "#17352d", weight: 5, opacity: .96, lineCap: "round", lineJoin: "round" }
}).addTo(map);
const routeHalo = L.geoJSON(null, {
  style: { color: "#ffffff", weight: 9, opacity: .8, lineCap: "round", lineJoin: "round" }
}).addTo(map);
routeHalo.bringToBack();

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function icon(className, size) {
  return L.divIcon({ className: "", html: `<div class="${className}"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function setStart(lat, lon, label = "Gewählter Startpunkt") {
  state.start = [Number(lat), Number(lon)];
  if (state.startMarker) state.startMarker.remove();
  state.startMarker = L.marker(state.start, { icon: icon("start-pin", 23) }).addTo(map);
  $("#location-hint").textContent = label;
  $("#location-search").value = label;
  map.setView(state.start, Math.max(map.getZoom(), 12));
  $("#empty-state").hidden = false;
}

function setDestination(lat, lon, label) {
  state.destination = [Number(lat), Number(lon)];
  if (state.destinationMarker) state.destinationMarker.remove();
  state.destinationMarker = L.marker(state.destination, { icon: icon("destination-pin", 25) }).addTo(map);
  $("#destination-search").value = label;
  $("#destination-hint").textContent = "Pflichtstopp auf der Rundtour";
  $("#clear-destination").hidden = false;
  if (state.start) map.fitBounds([state.start, state.destination], { padding: [70, 70] });
}

map.on("click", (event) => {
  if (state.route) return;
  setStart(event.latlng.lat, event.latlng.lng, "Startpunkt auf der Karte");
});

$("#distance").addEventListener("input", (event) => {
  state.distance = Number(event.target.value);
  $("#distance-value").textContent = state.distance;
  const min = Number(event.target.min), max = Number(event.target.max);
  const value = ((state.distance - min) / (max - min)) * 100;
  event.target.style.background = `linear-gradient(90deg, #e97655 ${value}%, #d8ddd7 ${value}%)`;
});
$("#distance").dispatchEvent(new Event("input"));

$("#elevation-toggle").addEventListener("change", (event) => {
  const enabled = event.target.checked;
  $("#elevation-target").disabled = !enabled;
  $("#elevation-control").classList.toggle("disabled", !enabled);
  state.elevationTarget = enabled ? Number($("#elevation-target").value) : null;
});
$("#elevation-target").addEventListener("input", (event) => {
  state.elevationTarget = Math.max(0, Number(event.target.value) || 0);
});

document.querySelectorAll(".surface-option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".surface-option").forEach((item) => {
      item.classList.remove("active");
      item.setAttribute("aria-checked", "false");
    });
    button.classList.add("active");
    button.setAttribute("aria-checked", "true");
    state.profile = button.dataset.profile;
  });
});

$("#locate-button").addEventListener("click", () => {
  if (!navigator.geolocation) return showToast("Standortbestimmung wird nicht unterstützt.");
  $("#location-hint").textContent = "Standort wird ermittelt …";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => setStart(coords.latitude, coords.longitude, "Mein Standort"),
    () => showToast("Standort konnte nicht ermittelt werden."),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

let searchTimer;
$("#location-search").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  const query = event.target.value.trim();
  if (query.length < 3) return ($("#search-results").hidden = true);
  searchTimer = setTimeout(() => searchPlaces(query, "#search-results", (place) => {
    const shortLabel = place.display_name.split(",").slice(0, 2).join(",");
    setStart(place.lat, place.lon, shortLabel);
  }), 350);
});

let destinationSearchTimer;
$("#destination-search").addEventListener("input", (event) => {
  clearTimeout(destinationSearchTimer);
  const query = event.target.value.trim();
  if (query.length < 3) return ($("#destination-results").hidden = true);
  destinationSearchTimer = setTimeout(() => searchPlaces(query, "#destination-results", (place) => {
    const shortLabel = place.display_name.split(",").slice(0, 2).join(",");
    setDestination(place.lat, place.lon, shortLabel);
  }), 350);
});

$("#clear-destination").addEventListener("click", () => {
  state.destination = null;
  state.destinationMarker?.remove();
  state.destinationMarker = null;
  $("#destination-search").value = "";
  $("#destination-hint").textContent = "Die Tour führt dorthin und wieder zum Start zurück";
  $("#clear-destination").hidden = true;
});

async function searchPlaces(query, resultSelector, onSelect) {
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const results = await response.json();
    const box = $(resultSelector);
    box.innerHTML = results.map((place, index) =>
      `<button class="search-result" data-index="${index}">${escapeHtml(place.display_name)}</button>`
    ).join("");
    box.hidden = !results.length;
    box.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      const place = results[Number(button.dataset.index)];
      onSelect(place);
      box.hidden = true;
    }));
  } catch {
    showToast("Ortssuche ist gerade nicht erreichbar.");
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function destination([lat, lon], distanceKm, bearingDeg) {
  const radius = 6371;
  const bearing = bearingDeg * Math.PI / 180;
  const phi1 = lat * Math.PI / 180;
  const lambda1 = lon * Math.PI / 180;
  const delta = distanceKm / radius;
  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(bearing));
  const lambda2 = lambda1 + Math.atan2(Math.sin(bearing) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2));
  return [phi2 * 180 / Math.PI, ((lambda2 * 180 / Math.PI + 540) % 360) - 180];
}

function bearingBetween([lat1, lon1], [lat2, lon2]) {
  const phi1 = lat1 * Math.PI / 180, phi2 = lat2 * Math.PI / 180;
  const deltaLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(deltaLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function latLngDistance(a, b) {
  return haversine([a[1], a[0]], [b[1], b[0]]);
}

function makeWaypoints() {
  if (state.destination) {
    const direct = latLngDistance(state.start, state.destination);
    const bearing = bearingBetween(state.start, state.destination);
    const mid = destination(state.start, direct / 2, bearing);
    const lateral = Math.max(1.2, (state.distance - direct * 2) / 4.2);
    const side = state.variant % 2 ? -1 : 1;
    const first = destination(mid, lateral * (1 + (state.variant % 3) * .16), bearing - 90 * side);
    const second = destination(mid, lateral * .9, bearing + 90 * side);
    return [state.start, first, state.destination, second, state.start];
  }
  const bearing = (state.variant * 73 + 25) % 360;
  const radius = state.distance / 5.25;
  const left = destination(state.start, radius, bearing - 30);
  const far = destination(state.start, radius * 1.75, bearing + 28);
  const right = destination(state.start, radius, bearing + 92);
  return [state.start, left, far, right, state.start];
}

async function fetchRoute(waypoints) {
  const lonlats = waypoints.map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join("|");
  const response = await fetch(`/api/route?profile=${state.profile}&lonlats=${encodeURIComponent(lonlats)}`);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text.includes("island") ? "Ein Wegpunkt liegt abseits des Wegenetzes." : "Keine passende Route gefunden.");
  }
  if (!response.ok) throw new Error(data.error || "Keine Route gefunden.");
  return data;
}

async function generateRoute(customWaypoints = null) {
  if (!state.start) return showToast("Bitte zuerst einen Startpunkt wählen.");
  if (state.destination) {
    const minimum = latLngDistance(state.start, state.destination) * 2.05;
    if (state.distance < minimum) {
      return showToast(`Mit diesem Ziel sind mindestens ${Math.ceil(minimum / 5) * 5} km nötig.`);
    }
  }
  $("#empty-state").hidden = true;
  $("#route-card").hidden = true;
  $("#loading-state").hidden = false;
  try {
    if (customWaypoints) {
      const data = await fetchRoute(customWaypoints);
      displayRoute(data, customWaypoints);
    } else {
      let lastError;
      const candidates = [];
      const attempts = state.destination ? 5 : state.elevationTarget !== null ? 4 : 3;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const waypoints = makeWaypoints();
        try {
          const data = await fetchRoute(waypoints);
          const metrics = routeMetrics(data);
          candidates.push({ data, waypoints, metrics, score: candidateScore(metrics) });
        } catch (error) {
          lastError = error;
        }
        state.variant += 1;
      }
      if (!candidates.length) throw lastError || new Error("Hier ließ sich keine geschlossene Route finden.");
      candidates.sort((a, b) => a.score - b.score);
      let fitted = await fitRouteToDistance(candidates[0].data, candidates[0].waypoints);
      let fittedScore = candidateScore(routeMetrics(fitted.data));
      if (routeMetrics(fitted.data).backtrackRatio > .006 && candidates[1]) {
        const alternative = await fitRouteToDistance(candidates[1].data, candidates[1].waypoints);
        const alternativeScore = candidateScore(routeMetrics(alternative.data));
        if (alternativeScore < fittedScore) {
          fitted = alternative;
          fittedScore = alternativeScore;
        }
      }
      displayRoute(fitted.data, fitted.waypoints);
    }
  } catch (error) {
    $("#empty-state").hidden = false;
    showToast(error.message || "Route konnte nicht erstellt werden.");
  } finally {
    $("#loading-state").hidden = true;
  }
}

function candidateScore(metrics) {
  const distanceError = Math.abs(metrics.distance - state.distance) / state.distance;
  const elevationError = state.elevationTarget === null
    ? 0
    : Math.abs(metrics.ascent - state.elevationTarget) / Math.max(250, state.elevationTarget);
  return distanceError * 3 + elevationError * 2 + metrics.backtrackRatio * 35 - metrics.bikeInfraRatio * 1.2;
}

async function fitRouteToDistance(initialData, initialWaypoints) {
  let data = initialData;
  let waypoints = initialWaypoints;
  for (let pass = 0; pass < 2; pass++) {
    const geometry = geometryFrom(data);
    const actual = routeDistance(geometry.coordinates);
    const ratio = state.distance / actual;
    if (ratio >= .88 && ratio <= 1.12) break;
    const factor = Math.max(.62, Math.min(1.38, ratio));
    waypoints = waypoints.map((point, index) => {
      if (index === 0 || index === waypoints.length - 1) return state.start;
      if (state.destination && latLngDistance(point, state.destination) < .01) return state.destination;
      return [
        state.start[0] + (point[0] - state.start[0]) * factor,
        state.start[1] + (point[1] - state.start[1]) * factor
      ];
    });
    data = await fetchRoute(waypoints);
  }
  return { data, waypoints };
}

function geometryFrom(data) {
  if (data.type === "FeatureCollection") return data.features[0]?.geometry;
  if (data.type === "Feature") return data.geometry;
  return data;
}

function propertiesFrom(data) {
  if (data.type === "FeatureCollection") return data.features[0]?.properties || {};
  if (data.type === "Feature") return data.properties || {};
  return {};
}

function routeMetrics(data) {
  const geometry = geometryFrom(data);
  const properties = propertiesFrom(data);
  const distance = routeDistance(geometry.coordinates);
  return {
    distance,
    ascent: Number(properties["filtered ascend"] || properties["track-elevation-gain"] || calculateAscent(geometry.coordinates)),
    bikeInfraRatio: calculateBikeInfra(properties.messages || [], distance),
    ...calculateBacktrack(geometry.coordinates)
  };
}

function displayRoute(data, waypoints) {
  const geometry = geometryFrom(data);
  if (!geometry?.coordinates?.length) throw new Error("Keine passende Route gefunden.");
  state.route = geometry;
  state.waypoints = waypoints;
  routeLayer.clearLayers().addData(geometry);
  routeHalo.clearLayers().addData(geometry).bringToBack();
  addWaypointMarkers();
  const bounds = routeLayer.getBounds();
  map.fitBounds(bounds, { padding: [55, 55] });

  const properties = propertiesFrom(data);
  const distanceKm = routeDistance(geometry.coordinates);
  const ascent = Number(properties["filtered ascend"] || properties["track-elevation-gain"] || calculateAscent(geometry.coordinates));
  const speeds = { fastbike: 25, trekking: 20, gravel: 17, mtb: 14 };
  const minutes = Math.round(distanceKm / speeds[state.profile] * 60);
  $("#actual-distance").textContent = `${distanceKm.toFixed(1)} km`;
  $("#ascent").textContent = ascent ? `${Math.round(ascent)} m` : "—";
  $("#duration").textContent = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;
  renderElevationProfile(geometry.coordinates, distanceKm);
  renderSurfaceDetails(properties.messages || [], distanceKm);
  renderRouteQuality(calculateBacktrack(geometry.coordinates));
  $("#route-card").hidden = false;
  $(".map-tip").classList.add("visible");
  setTimeout(() => $(".map-tip").classList.remove("visible"), 5000);
}

function addWaypointMarkers() {
  state.markers.forEach((marker) => marker.remove());
  state.markers = [];
  state.waypoints.slice(1, -1).forEach((point, index) => {
    const waypointIndex = index + 1;
    if (state.destination && latLngDistance(point, state.destination) < .01) return;
    const marker = L.marker(point, { draggable: true, icon: icon("waypoint-pin", 18), zIndexOffset: 600 }).addTo(map);
    marker.on("dragend", async () => {
      const { lat, lng } = marker.getLatLng();
      state.waypoints[waypointIndex] = [lat, lng];
      await generateRoute(state.waypoints);
    });
    state.markers.push(marker);
  });
}

function haversine(a, b) {
  const toRad = (n) => n * Math.PI / 180, radius = 6371;
  const dLat = toRad(b[1] - a[1]), dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]), lat2 = toRad(b[1]);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function routeDistance(coordinates) {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) total += haversine(coordinates[i - 1], coordinates[i]);
  return total;
}

function calculateAscent(coordinates) {
  let ascent = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const previous = coordinates[i - 1][2], current = coordinates[i][2];
    if (Number.isFinite(previous) && Number.isFinite(current) && current > previous) ascent += current - previous;
  }
  return ascent;
}

function calculateBacktrack(coordinates) {
  const seen = new Map();
  const segments = [];
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const length = haversine(coordinates[i - 1], coordinates[i]);
    segments.push({ a: coordinates[i - 1], b: coordinates[i], length, position: total });
    total += length;
  }
  let internal = 0, atStart = 0;
  for (const segment of segments) {
    const { a, b, length, position } = segment;
    const qa = `${a[0].toFixed(4)},${a[1].toFixed(4)}`;
    const qb = `${b[0].toFixed(4)},${b[1].toFixed(4)}`;
    const key = qa < qb ? `${qa}|${qb}` : `${qb}|${qa}`;
    if (seen.has(key)) {
      const first = seen.get(key);
      const repeated = Math.min(length, first.length);
      const isStartAccess = first.position < 2 && total - position < 2;
      if (isStartAccess) atStart += repeated;
      else internal += repeated;
    }
    seen.set(key, { length, position });
  }
  return {
    backtrackRatio: total ? internal / total : 0,
    startOverlapRatio: total ? atStart / total : 0
  };
}

function renderElevationProfile(coordinates, totalDistance) {
  const points = coordinates.filter((point) => Number.isFinite(point[2]));
  if (points.length < 2) {
    $("#elevation-line").setAttribute("d", "");
    $("#elevation-area").setAttribute("d", "");
    $("#elevation-range").textContent = "Keine Höhendaten";
    return;
  }
  const samples = points.filter((_, index) => index % Math.max(1, Math.floor(points.length / 160)) === 0);
  if (samples.at(-1) !== points.at(-1)) samples.push(points.at(-1));
  const elevations = samples.map((point) => point[2]);
  const min = Math.min(...elevations), max = Math.max(...elevations);
  let travelled = 0;
  const plotted = samples.map((point, index) => {
    if (index) travelled += haversine(samples[index - 1], point);
    const x = travelled / totalDistance * 520;
    const y = 96 - ((point[2] - min) / Math.max(1, max - min)) * 82;
    return [x, y];
  });
  const line = plotted.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  $("#elevation-line").setAttribute("d", line);
  $("#elevation-area").setAttribute("d", `${line} L520,105 L0,105 Z`);
  $("#elevation-range").textContent = `${Math.round(min)}–${Math.round(max)} m`;
  $("#profile-half").textContent = `${(totalDistance / 2).toFixed(0)} km`;
  $("#profile-end").textContent = `${totalDistance.toFixed(0)} km`;
}

function renderSurfaceDetails(messages, totalDistance) {
  const surfaces = { Asphalt: 0, Gravel: 0, Naturweg: 0, Pflaster: 0, Unbekannt: 0 };
  for (const row of messages.slice(1)) {
    const distance = Number(row[3]) || 0;
    const tags = String(row[9] || "");
    const match = tags.match(/(?:^| )surface=([^ ]+)/);
    const surface = match?.[1] || "";
    if (/^(asphalt|paved|concrete|concrete:plates)$/.test(surface)) surfaces.Asphalt += distance;
    else if (/^(gravel|fine_gravel|compacted|pebblestone)$/.test(surface)) surfaces.Gravel += distance;
    else if (/^(ground|dirt|earth|grass|sand|mud|woodchips)$/.test(surface)) surfaces.Naturweg += distance;
    else if (/^(paving_stones|sett|cobblestone|unhewn_cobblestone)$/.test(surface)) surfaces.Pflaster += distance;
    else surfaces.Unbekannt += distance;
  }
  const totalMeters = totalDistance * 1000;
  const known = totalMeters ? Math.max(0, 100 - surfaces.Unbekannt / totalMeters * 100) : 0;
  $("#surface-known").textContent = `${Math.round(known)} % erfasst`;
  const entries = Object.entries(surfaces).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  $("#surface-bars").innerHTML = entries.map(([name, meters]) => {
    const percent = Math.min(100, meters / totalMeters * 100);
    return `<div class="surface-row"><span>${name}</span><div class="surface-track"><div class="surface-fill" style="width:${percent.toFixed(1)}%"></div></div><strong>${Math.round(percent)}%</strong></div>`;
  }).join("") || "<div class=\"field-hint\">Keine OSM-Angaben verfügbar</div>";
  const bikePercent = calculateBikeInfra(messages, totalDistance) * 100;
  $("#bike-infra").textContent = `↗ ${Math.round(bikePercent)} % auf Radwegen, Radstreifen oder Fahrradrouten`;
}

function calculateBikeInfra(messages, totalDistance) {
  let bikeMeters = 0;
  for (const row of messages.slice(1)) {
    const distance = Number(row[3]) || 0;
    const tags = String(row[9] || "");
    const isBikeInfra =
      /(?:^| )highway=cycleway(?: |$)/.test(tags) ||
      /(?:^| )cycleway(?::(?:left|right|both))?=(?:lane|track|shared_lane|share_busway|opposite|opposite_lane|opposite_track)(?: |$)/.test(tags) ||
      /(?:^| )route_bicycle_(?:icn|ncn|rcn|lcn)=yes(?: |$)/.test(tags) ||
      /(?:^| )(?:bicycle_road|cyclestreet)=yes(?: |$)/.test(tags);
    if (isBikeInfra) bikeMeters += distance;
  }
  return totalDistance ? Math.min(1, bikeMeters / (totalDistance * 1000)) : 0;
}

function renderRouteQuality({ backtrackRatio, startOverlapRatio }) {
  const element = $("#route-quality");
  const percent = backtrackRatio * 100;
  const startPercent = startOverlapRatio * 100;
  element.classList.toggle("warning", percent >= .75);
  element.textContent = percent < .25
    ? `✓ Keine unnötigen Stichstraßen erkannt${startPercent >= .25 ? ` · ${startPercent.toFixed(1)} % gemeinsame Startzufahrt` : ""}`
    : percent < .75
      ? `✓ Nur ${percent.toFixed(1)} % interne Überlappung${startPercent >= .25 ? ` · ${startPercent.toFixed(1)} % am Start` : ""}`
      : `Hinweis: ${percent.toFixed(1)} % unnötige Doppelwege${startPercent >= .25 ? ` · zusätzlich ${startPercent.toFixed(1)} % am Start` : ""}`;
}

function exportGpx() {
  if (!state.route) return;
  const points = state.route.coordinates.map(([lon, lat, elevation]) =>
    `<trkpt lat="${lat}" lon="${lon}">${Number.isFinite(elevation) ? `<ele>${elevation}</ele>` : ""}</trkpt>`
  ).join("");
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Rundwerk" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Rundwerk Rundtour</name></metadata><trk><name>Rundwerk ${state.distance} km</name><type>cycling</type><trkseg>${points}</trkseg></trk></gpx>`;
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `rundwerk-${new Date().toISOString().slice(0, 10)}.gpx`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("GPX-Datei wurde exportiert.");
}

$("#generate-button").addEventListener("click", () => generateRoute());
$("#reroute-button").addEventListener("click", () => {
  state.variant += 1;
  generateRoute();
});
$("#export-button").addEventListener("click", exportGpx);
$("#close-route").addEventListener("click", () => {
  $("#route-card").hidden = true;
});

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") generateRoute();
});
