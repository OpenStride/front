import { reactive } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  timeout?: number;
}

class ToastServiceClass {
  private static instance: ToastServiceClass;
  public toasts = reactive<Toast[]>([]);
  private counter = 0;

  static getInstance() {
    if (!this.instance) this.instance = new ToastServiceClass();
    return this.instance;
  }

  push(message: string, opts: { type?: Toast['type']; timeout?: number } = {}) {
    const toast: Toast = {
      id: ++this.counter,
      message,
      type: opts.type || 'info',
      timeout: opts.timeout ?? 3500
    };
    this.toasts.push(toast);
    if (toast.timeout && toast.timeout > 0) {
      setTimeout(() => this.remove(toast.id), toast.timeout);
    }
    return toast.id;
  }

  remove(id: number) {
    const idx = this.toasts.findIndex(t => t.id === id);
    if (idx >= 0) this.toasts.splice(idx, 1);
  }

  clear() {
    this.toasts.splice(0, this.toasts.length);
  }
}

export const ToastService = ToastServiceClass.getInstance();