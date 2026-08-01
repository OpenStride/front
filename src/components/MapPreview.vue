<template>
  <div class="map-preview" ref="mapRef" :class="{ 'no-pointer-events': !props.canzoom }" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = defineProps<{
  lat?: number
  lon?: number
  zoom?: number
  theme?: string
  polyline?: [number, number][]
  canzoom?: boolean
}>()

const mapRef = ref<HTMLElement | null>(null)
let map: L.Map | null = null
/** Everything drawn from `polyline`, so a redraw can remove exactly that. */
let routeLayers: L.Layer[] = []

const getTileLayerUrl = (theme: string): string => {
  const tileThemes: Record<string, string> = {
    osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    cartoLight: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    cartoDark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    toner: 'https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',
    watercolor: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg'
  }
  return tileThemes[theme] ?? tileThemes.osm
}

onMounted(() => {
  if (!mapRef.value) return

  let lat = props.lat ?? 0
  let lon = props.lon ?? 0
  if (props.polyline && props.polyline.length > 0) {
    lat = props.polyline[0][0]
    lon = props.polyline[0][1]
  }

  map = L.map(mapRef.value, {
    center: [lat, lon],
    zoom: props.zoom ?? 14,
    zoomControl: props.canzoom ?? false,
    dragging: props.canzoom ?? false,
    scrollWheelZoom: props.canzoom ?? false,
    doubleClickZoom: props.canzoom ?? false,
    boxZoom: props.canzoom ?? false,
    keyboard: props.canzoom ?? false,
    touchZoom: props.canzoom ?? false
  })

  const tileLayerUrl = getTileLayerUrl(props.theme ?? 'osm')

  L.tileLayer(tileLayerUrl, {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map)

  drawRoute(lat, lon)
})

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

/**
 * (Re)draw everything that comes from `polyline`. Split out of `onMounted` so a
 * route that arrives — or grows — after mount still reaches the map: the live
 * recorder feeds a track that lengthens every few seconds, and a map drawn once
 * showed it the first two points of the run and nothing else.
 */
function drawRoute(lat: number, lon: number): void {
  if (!map) return
  for (const layer of routeLayers) layer.remove()
  routeLayers = []

  if (props.polyline && props.polyline.length > 1) {
    const latlngs = props.polyline
    const green = cssVar('--color-green-500', '#5f8f1a')
    const ink = cssVar('--color-ink', '#1e1e2e')
    const white = cssVar('--color-white', '#ffffff')

    // White casing under the route for contrast on the map
    routeLayers.push(
      L.polyline(latlngs, {
        color: white,
        weight: 7,
        opacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(map)
    )

    // Green route line on top
    routeLayers.push(
      L.polyline(latlngs, {
        color: green,
        weight: 3.5,
        opacity: 1,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(map)
    )

    // Start marker: white dot ringed with ink
    routeLayers.push(
      L.circleMarker(latlngs[0], {
        radius: 5,
        color: ink,
        weight: 3,
        fillColor: white,
        fillOpacity: 1
      }).addTo(map)
    )

    // End marker: solid ink dot with a thin white ring
    routeLayers.push(
      L.circleMarker(latlngs[latlngs.length - 1], {
        radius: 5,
        color: white,
        weight: 2,
        fillColor: ink,
        fillOpacity: 1
      }).addTo(map)
    )

    map.fitBounds(L.polyline(latlngs).getBounds(), { padding: [24, 24] })
  } else {
    // Fallback: single-point pin when there is no route
    const defaultIcon = L.icon({
      iconUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAC4jAAAuIwF4pT92AAABjUlEQVR4nJVSPUgDUQz+rAodBKGDoA7qICiC3Eu4UnC4TiKCIkURWwQHoaKom+BUF3uv6OTWSXHRSx11cXBw00UHwdHVn0HEQUHsyWkt1/O3H2R4Sb7ke0mAKqAdrGd3MVgNpwwtGNUCt2SnWtCI/8IuQGnBra+AmxUMVCRlMgjZBYxlBA1l3ybCWQczWvDgJ3uWE0xWFNAOFkrBJ9vBhRaca8FjkFhW4J9FPo9628GNFhzkBLM/kfxm76Bd5/ljDqt76PIGY/V3j5gmz9uCo4pkwVk6E4mm5lrjw6n24cRU2+Dadm9HbqvnCkqpFqXUOBFpZr5j5sdkurnvU77t4H56qSlGRNfM7JZs32ssMlb7rsAwjE5f0CWiA28mtoPi6g4SRHQYiKeCmwoFOrjRKE9oQZKIlv1+Zr60LKvuy66ZeSnQ5VopNURELz7/KzP3f3sszFzPzMeBbsXAe+XXi4vFYhEiOgmQPhVtAKj5tYAHy7LCpY14cj3yMxEt/kn85ktxZt41TdOomlwN3gCuUOhglxFREgAAAABJRU5ErkJggg==',
      iconSize: [16, 16],
      iconAnchor: [8, 16],
      popupAnchor: [1, -10]
    })
    routeLayers.push(L.marker([lat, lon], { icon: defaultIcon }).addTo(map))
  }
}

// Identity comparison, not deep: callers hand a new array when the route changes,
// and a deep watch over thousands of points would cost more than the redraw.
watch(
  () => props.polyline,
  next => drawRoute(next?.[0]?.[0] ?? props.lat ?? 0, next?.[0]?.[1] ?? props.lon ?? 0)
)

onUnmounted(() => {
  map?.remove()
  map = null
  routeLayers = []
})
</script>

<style scoped>
.map-preview {
  width: 100%;
  height: 200px;
}

.no-pointer-events {
  pointer-events: none;
}

.map-preview {
  position: relative;
  z-index: 1;
}
</style>
