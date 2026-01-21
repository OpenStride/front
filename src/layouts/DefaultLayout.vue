<script setup>
import AppHeader from "@/components/AppHeader.vue";
import ToastContainer from "@/components/ToastContainer.vue";
</script>

<template>
  <div class="layout">
    <AppHeader />
    <main>
      <router-view />
    </main>
    <ToastContainer />
    <footer class="footer">
      <p>
        <a href="/legal">Privacy Policy</a> |
        <a href="/cgu">Terms of Service</a> |
        <a href="https://discord.gg/V7HHvHC4t7" target="_blank" rel="noopener noreferrer">Discord</a> |
        <a href="https://github.com/OpenStride/front" target="_blank" rel="noopener noreferrer">GitHub</a>
      </p>
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
</style>
