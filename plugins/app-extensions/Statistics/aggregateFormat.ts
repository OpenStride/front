import type { PluginContext } from '@/types/plugin-context'
import { SAMPLE_FIELD_SPECS, type SampleField } from '@/types/sampleFields'

type Units = PluginContext['units']

/**
 * Display helpers shared by the aggregate list and its editor.
 *
 * Shared rather than written twice: the list reads a stored bound back and the
 * form writes one, and the two disagreeing about what a slope of `0.02` means
 * is exactly the class of bug the units layer exists to prevent.
 */

/** The unit symbol a field is read in — the reader's own, when it has a dimension. */
export function unitOf(units: Units, field: SampleField): string {
  const spec = SAMPLE_FIELD_SPECS[field]
  return spec.dimension ? units.convert(spec.dimension, 0).unit : (spec.unit ?? '')
}

/** Stored SI to the number the reader sees. */
export function toDisplay(units: Units, field: SampleField, si: number): number {
  const spec = SAMPLE_FIELD_SPECS[field]
  return spec.dimension ? units.convert(spec.dimension, si).value : si * (spec.scale ?? 1)
}

/** The number the reader typed, back to SI. */
export function toStored(units: Units, field: SampleField, display: number): number {
  const spec = SAMPLE_FIELD_SPECS[field]
  return spec.dimension ? units.toSI(spec.dimension, display) : display / (spec.scale ?? 1)
}

/**
 * Enough digits to be read, no more.
 *
 * A suggested band reading "16.2 km/h" claims a precision a histogram bucket
 * does not have, and a heart rate reading "152.4 bpm" claims one no monitor
 * has either.
 */
export function round(value: number): number {
  return Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10
}

/** A stored value as text, unit included. */
export function formatValue(units: Units, field: SampleField, si: number): string {
  const spec = SAMPLE_FIELD_SPECS[field]
  if (spec.dimension) {
    const { text } = units.format(spec.dimension, si)
    return text
  }
  const unit = spec.unit ? ` ${spec.unit}` : ''
  return `${round(si * (spec.scale ?? 1))}${unit}`
}
