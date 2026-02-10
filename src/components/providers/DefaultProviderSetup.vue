<template>
  <div class="max-w-md mx-auto p-6 bg-white rounded-xl shadow space-y-4">
    <h2 class="text-xl font-semibold text-center">
      {{ $t('providers.setup.title', { provider: providerName }) }}
    </h2>

    <div class="text-center mt-4">
      <p
        class="inline-flex items-center gap-2 text-sm font-medium"
        :class="isConnected ? 'text-green-600' : 'text-red-600'"
      >
        <i :class="isConnected ? 'fas fa-check-circle' : 'fas fa-times-circle'"></i>
        {{
          isConnected
            ? $t('providers.setup.connected', { provider: providerName })
            : $t('providers.setup.notConnected')
        }}
      </p>
    </div>

    <div class="flex flex-wrap justify-center gap-3 mt-6">
      <button
        @click="$emit('connect')"
        :disabled="isLoading"
        class="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg shadow-sm hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <i :class="isLoading ? 'fas fa-spinner fa-spin' : 'fas fa-plug'"></i>
        <template v-if="isLoading">
          {{ $t('providers.setup.connecting') }}
        </template>
        <template v-else>
          {{
            isConnected
              ? $t('providers.setup.reconnect', { provider: providerName })
              : $t('providers.setup.connect', { provider: providerName })
          }}
        </template>
      </button>

      <button
        v-if="isConnected"
        @click="$emit('disconnect')"
        class="inline-flex items-center gap-2 text-sm text-gray-600 font-medium hover:underline hover:text-gray-800 transition"
      >
        <i class="fas fa-unlink"></i>
        {{ $t('providers.setup.disconnect') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ providerName: string; isConnected: boolean; isLoading?: boolean }>()

defineEmits<{
  connect: []
  disconnect: []
}>()
</script>
