# Rundwerk

Ein schlanker, OSM-basierter Planer für Fahrrad-Rundtouren. Startpunkt, ungefähre
Distanz und gewünschter Untergrund genügen; die erzeugte Route lässt sich über
verschiebbare Zwischenpunkte anpassen und als GPX für Garmin oder Wahoo exportieren.

Optional lassen sich ein Pflichtziel auf der Runde und gewünschte Höhenmeter
angeben. Mehrere Routenformen werden nach Distanz, Höhenmetern und unnötig doppelt
befahrenen Wegabschnitten bewertet. Ausgewiesene Radwege, Radfahrstreifen und
Fahrradrouten werden bevorzugt; unsichere normale Straßen erhalten eine deutliche
Routingstrafe. Die Ergebnisansicht zeigt Höhenprofil, OSM-Untergrundanteile,
Radweganteil und eine Qualitätsprüfung auf interne Stichstraßen.

## Lokal starten

Voraussetzung ist Node.js 18 oder neuer. Es müssen keine Pakete installiert werden.

```bash
npm run dev
```

Danach `http://127.0.0.1:5173` öffnen.

## Netlify

Das Repository enthält Netlify Functions für `/api/route` und `/api/search`.
`netlify.toml` veröffentlicht die statischen Dateien und leitet beide API-Pfade
serverseitig an BRouter beziehungsweise Nominatim weiter. Nach einem Push auf den
mit Netlify verbundenen Branch ist keine weitere Build-Konfiguration nötig.

## Technik

- OpenStreetMap-Kacheln als Kartenbasis
- Nominatim für die Ortssuche
- BRouter mit den Profilen `fastbike`, `trekking`, `gravel` und `mtb`
- Leaflet für Karte, Route und verschiebbare Wegpunkte
- Höhenprofil und Untergrundauswertung aus den BRouter-/OSM-Segmentdaten
- GPX 1.1 als lokaler Browser-Export
- Kleiner Node-Server als statischer Server und API-Proxy

Die App enthält keine Tracker und speichert keine Standorte. Suchanfragen und
Wegpunkte werden für Suche beziehungsweise Routing an Nominatim und BRouter gesendet.

## Hinweise für einen öffentlichen Betrieb

Die öffentlichen OSM-, Nominatim- und BRouter-Instanzen eignen sich für Entwicklung
und geringe Nutzung. Vor einer größeren Veröffentlichung sollten eigene Instanzen
oder kommerzielle Anbieter mit zugesicherter Kapazität, Caching, Monitoring und
passenden Nutzungsbedingungen verwendet werden.
