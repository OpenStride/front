import { vi } from 'vitest'
import { config } from '@vue/test-utils'
import i18n from '@/locales'

// Install the real i18n globally for every mounted component, so components that
// call useI18n() work without each test wiring it up. Tests that pass their own
// i18n via mount({ global: { plugins: [...] } }) still override this per-mount.
config.global.plugins = [...(config.global.plugins ?? []), i18n]

// Mock Chart.js to avoid fetch errors in test environment
vi.mock('chart.js/auto', () => ({
  default: class MockChart {
    constructor() {}
    destroy() {}
    update() {}
    resize() {}
    render() {}
    stop() {}
    clear() {}
    toBase64Image() {
      return ''
    }
    generateLegend() {
      return ''
    }
    static register() {}
    static unregister() {}
  }
}))

// Mock Chart.js for direct imports
vi.mock('chart.js', () => ({
  Chart: class MockChart {
    constructor() {}
    destroy() {}
    update() {}
    resize() {}
    render() {}
    stop() {}
    clear() {}
    toBase64Image() {
      return ''
    }
    generateLegend() {
      return ''
    }
    static register() {}
    static unregister() {}
  },
  registerables: []
}))

// Mock Leaflet CSS imports to avoid fetch errors
vi.mock('leaflet/dist/leaflet.css', () => ({}))

// Mock Leaflet library
vi.mock('leaflet', () => ({
  default: {},
  map: vi.fn(() => ({
    setView: vi.fn().mockReturnThis(),
    fitBounds: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    invalidateSize: vi.fn()
  })),
  tileLayer: vi.fn(() => ({
    addTo: vi.fn()
  })),
  marker: vi.fn(() => ({
    addTo: vi.fn(),
    bindPopup: vi.fn().mockReturnThis(),
    remove: vi.fn()
  })),
  circleMarker: vi.fn(() => ({
    addTo: vi.fn().mockReturnThis(),
    bindPopup: vi.fn().mockReturnThis(),
    setLatLng: vi.fn().mockReturnThis(),
    remove: vi.fn()
  })),
  icon: vi.fn(() => ({})),
  polyline: vi.fn(() => ({
    addTo: vi.fn(),
    getBounds: vi.fn(() => ({
      isValid: vi.fn(() => true)
    })),
    remove: vi.fn()
  })),
  latLngBounds: vi.fn(() => ({
    isValid: vi.fn(() => true)
  }))
}))
