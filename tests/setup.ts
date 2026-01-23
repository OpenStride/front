import { vi } from 'vitest'

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
    toBase64Image() { return '' }
    generateLegend() { return '' }
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
    toBase64Image() { return '' }
    generateLegend() { return '' }
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
