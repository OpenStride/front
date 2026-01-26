import type { ProviderPlugin } from '@/types/provider';

const ZipImportProvider: ProviderPlugin = {
  id: 'zip-import',
  label: 'Import ZIP',
  setupComponent: async () => (await import('./Setup.vue')).default,
};

export default ZipImportProvider;
