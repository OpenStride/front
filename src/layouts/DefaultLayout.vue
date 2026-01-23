<script setup>
import AppHeader from '@/components/AppHeader.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import AutoUpdateNotification from '@/components/AutoUpdateNotification.vue'
import MigrationProgress from '@/components/MigrationProgress.vue'

// App version from build-time injection
const appVersion = __APP_VERSION__
</script>

<template>
  <div class="layout">
    <AppHeader />
    <AutoUpdateNotification />
    <main>
      <router-view />
    </main>
    <ToastContainer />
    <MigrationProgress />
    <footer class="footer">
      <p>
        <a href="/legal">Privacy Policy</a> | <a href="/cgu">Terms of Service</a> |
        <a href="https://discord.gg/V7HHvHC4t7" target="_blank" rel="noopener noreferrer"
          >Discord</a
        >
        |
        <a href="https://github.com/OpenStride/front" target="_blank" rel="noopener noreferrer"
          >GitHub</a
        >
      </p>
      <p class="version">OpenStride v{{ appVersion }}</p>
    </footer>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

main {
  flex-grow: 1;
  padding: 20px;
}

.footer {
  background-color: #f4f4f4;
  padding: 10px 20px;
  text-align: center;
  font-size: 0.9rem;
  color: #555;
}
.footer a {
  color: #0073e6;
  text-decoration: none;
  margin: 0 8px;
}
.footer a:hover {
  text-decoration: underline;
}
.footer .version {
  margin-top: 8px;
  font-size: 0.75rem;
  color: #999;
  font-weight: 300;
}
</style>
