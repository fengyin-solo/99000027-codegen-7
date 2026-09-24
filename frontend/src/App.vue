<template>
  <div id="app">
    <Navbar />
    <main class="main-content">
      <SessionStatus />
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Navbar from './components/Navbar.vue'
import SessionStatus from './components/SessionStatus.vue'
import { useAuthStore, onAuthInvalid } from './stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// 会话失效后的统一跳转：只在受保护页面跳转登录页并携带原目标地址，
// 登录成功后由 Login 页恢复到原目标页。幂等设计避免循环跳转。
// 来源：本地计时到期 / 续期被服务端拒绝 / 其他标签页登出或到期 / 接口返回 401/403
const unsubscribe = onAuthInvalid((reason = 'expired') => {
  if (!route.meta.requiresAuth || route.name === 'Login' || route.query.reason) return
  router.replace({
    name: 'Login',
    query: { redirect: route.fullPath, reason }
  })
})

// 任意受保护接口返回 401/403（服务端先于本地判定到期等）。
// store 内部幂等清理并经 onAuthInvalid 触发上面的跳转。
function onApiUnauthorized() {
  authStore.handleSessionInvalid('rejected')
}

onMounted(() => {
  window.addEventListener('blog:api-unauthorized', onApiUnauthorized)
})

onUnmounted(() => {
  unsubscribe()
  window.removeEventListener('blog:api-unauthorized', onApiUnauthorized)
})
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
