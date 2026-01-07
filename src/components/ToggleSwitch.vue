<template>
    <label class="switch">
      <input
        type="checkbox"
        :checked="value"
        @change="onToggle"
      />
      <span class="slider"></span>
      <span class="label">{{ label }}</span>
    </label>
  </template>
  
  <script setup lang="ts">
  import { ref, onMounted, watch } from 'vue'
  import { IndexedDBService } from '@/services/IndexedDBService'
  
  const props = defineProps<{
    settingKey: string
    label: string
  }>()
  
  const value = ref(false);
  
  const load = async () => {
    const db = await IndexedDBService.getInstance()
    const stored = await db.getData(props.settingKey)
    value.value = stored === true
  }
  
  const onToggle = async (event: Event) => {
    const checked = (event.target as HTMLInputElement).checked
    value.value = checked
  
    const db = await IndexedDBService.getInstance()
    await db.saveData(props.settingKey, checked)
  }
  
  onMounted(load)
  </script>
  
  <style scoped>
  .switch {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .slider {
    position: relative;
    width: 40px;
    height: 20px;
    background: #ccc;
    border-radius: 999px;
    cursor: pointer;
  }
  .slider::before {
    content: "";
    position: absolute;
    width: 18px;
    height: 18px;
    background: white;
    border-radius: 50%;
    top: 1px;
    left: 1px;
    transition: 0.2s;
  }
  input:checked + .slider::before {
    transform: translateX(20px);
  }
  input:checked + .slider {
    background: var(--secondary-color);
  }
  input {
    display: none;
  }
  </style>
  