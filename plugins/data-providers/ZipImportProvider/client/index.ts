import type { ProviderPlugin } from '@/types/provider';

const ZipImportProvider: ProviderPlugin = {
  id: 'zip-import',
  label: 'Import ZIP',
  setupComponent: async () => (await import('@plugins/data-providers/ZipImportProvider/client/Setup.vue')).default,
};

export default ZipImportProvider;
