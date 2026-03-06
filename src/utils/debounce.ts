// src/utils/debounce.ts
export function debounce<F extends (...args: never[]) => void>(fn: F, wait: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<F>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}
