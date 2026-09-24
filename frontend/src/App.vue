<template>
  <div id="app">
    <Navbar />
    <main class="main-content">
      <SessionBar v-if="route.meta.requiresAuth" />
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import Navbar from './components/Navbar.vue'
import SessionBar from './components/SessionBar.vue'
import { useAuthStore } from './stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const INVALIDATION_MESSAGES = {
  expired: '登录状态已到期，已为你安全退出',
  server: '登录状态已失效，请重新登录',
  external: '登录状态已在其他标签页退出'
}

// Single coordination point: when the session is definitively lost (local
// countdown hit zero, the server rejected the token, or another tab logged
// out), state cleanup happens in the store; here we show one notice and
// return to the login page while preserving the protected URL as redirect
// target. The router guard is what authoritatively blocks protected routes.
watch(
  () => authStore.invalidation,
  (invalidation) => {
    // Manual logout navigates itself; a session that never held a token has
    // nothing to redirect away from.
    if (!invalidation || !invalidation.hadToken) return
    if (!route.meta.requiresAuth) return

    ElMessage.warning(INVALIDATION_MESSAGES[invalidation.reason] || INVALIDATION_MESSAGES.server)

    // Small delay so the expired banner on the protected page is visible
    // before the login page is shown. If a fresh login/renewal landed in the
    // meantime (e.g. another tab), don't redirect at all.
    setTimeout(() => {
      if (!authStore.sessionUsable) {
        router.push({
          name: 'Login',
          query: { redirect: route.fullPath, reason: invalidation.reason }
        })
      }
    }, 800)
  }
)
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: #f5f7fa;
  color: #333;
  line-height: 1.6;
}

.main-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  min-height: calc(100vh - 60px);
}

a {
  color: #409eff;
  text-decoration: none;
}

a:hover {
  color: #66b1ff;
}
</style>
