<template>
  <div class="map-preview" ref="mapRef" :class="{ 'no-pointer-events': !props.canzoom }" />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
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

  const map = L.map(mapRef.value, {
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

  const defaultIcon = L.icon({
    iconUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAC4jAAAuIwF4pT92AAABjUlEQVR4nJVSPUgDUQz+rAodBKGDoA7qICiC3Eu4UnC4TiKCIkURWwQHoaKom+BUF3uv6OTWSXHRSx11cXBw00UHwdHVn0HEQUHsyWkt1/O3H2R4Sb7ke0mAKqAdrGd3MVgNpwwtGNUCt2SnWtCI/8IuQGnBra+AmxUMVCRlMgjZBYxlBA1l3ybCWQczWvDgJ3uWE0xWFNAOFkrBJ9vBhRaca8FjkFhW4J9FPo9628GNFhzkBLM/kfxm76Bd5/ljDqt76PIGY/V3j5gmz9uCo4pkwVk6E4mm5lrjw6n24cRU2+Dadm9HbqvnCkqpFqXUOBFpZr5j5sdkurnvU77t4H56qSlGRNfM7JZs32ssMlb7rsAwjE5f0CWiA28mtoPi6g4SRHQYiKeCmwoFOrjRKE9oQZKIlv1+Zr60LKvuy66ZeSnQ5VopNURELz7/KzP3f3sszFzPzMeBbsXAe+XXi4vFYhEiOgmQPhVtAKj5tYAHy7LCpY14cj3yMxEt/kn85ktxZt41TdOomlwN3gCuUOhglxFREgAAAABJRU5ErkJggg==',
    iconSize: [16, 16],
    iconAnchor: [8, 16],
    popupAnchor: [1, -10]
  })

  L.marker([lat, lon], { icon: defaultIcon }).addTo(map)

  if (props.polyline?.length) {
    const latlngs = props.polyline

    if (latlngs.length > 1) {
      L.polyline(latlngs, {
        color: '#333333',
        weight: 4,
        opacity: 0.8,
        lineJoin: 'round'
      }).addTo(map)

      map.fitBounds(L.polyline(latlngs).getBounds())
    }
  }
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
