// src/utils/debounce.ts
export function debounce<F extends (...args: any[]) => void>(fn: F, wait: number) {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: Parameters<F>) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}
