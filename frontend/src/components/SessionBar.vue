<template>
  <el-alert
    v-if="visible"
    :type="alertType"
    :closable="false"
    show-icon
    class="session-bar"
  >
    <div class="session-bar__inner">
      <div class="session-bar__status">
        <template v-if="status === 'warning'">
          <el-icon class="is-warning-icon"><WarningFilled /></el-icon>
          登录状态即将到期，剩余
          <strong class="session-bar__time">{{ formattedRemaining }}</strong>
          ，是否继续保持登录？
        </template>
        <template v-else-if="status === 'valid'">
          <el-icon><CircleCheckFilled /></el-icon>
          登录有效，剩余
          <strong class="session-bar__time">{{ formattedRemaining }}</strong>
        </template>
        <template v-else>
          <el-icon class="is-error-icon"><CircleCloseFilled /></el-icon>
          登录状态已失效，正在安全退出并返回登录页…
        </template>
      </div>
      <div v-if="status !== 'expired'" class="session-bar__actions">
        <el-tag v-if="!authStore.online" type="info" effect="dark" size="small">
          当前网络不可用
        </el-tag>
        <el-button
          type="primary"
          size="small"
          :loading="authStore.renewing"
          :disabled="!authStore.online"
          @click="handleRenew"
        >
          续期登录
        </el-button>
      </div>
    </div>
  </el-alert>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  WarningFilled,
  CircleCheckFilled,
  CircleCloseFilled
} from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const route = useRoute()

// Brief window during which the "session expired, returning to login" notice
// is shown on a protected page even though the token has already been cleared.
const recentInvalidation = computed(
  () =>
    authStore.invalidation &&
    Date.now() - authStore.invalidation.at < 2000
)

// The bar lives on protected pages only (rendered from App.vue) and is the
// in-page home for the session status: shown while a session is usable, and
// for a short grace period after it is invalidated.
const visible = computed(
  () => route.meta.requiresAuth && (authStore.isLoggedIn || recentInvalidation.value)
)
const status = computed(() =>
  recentInvalidation.value && !authStore.isLoggedIn ? 'expired' : authStore.status
)

const alertType = computed(() => {
  if (status.value === 'warning') return 'warning'
  if (status.value === 'expired') return 'error'
  return 'success'
})

const formattedRemaining = computed(() => {
  const ms = authStore.remainingMs
  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n) => String(n).padStart(2, '0')
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
})

async function handleRenew() {
  // The store deduplicates concurrent calls; the disabled state also covers
  // offline conditions so a renewal can never fake success.
  try {
    await authStore.renew()
    ElMessage.success('登录状态已续期')
  } catch (error) {
    if (!error.response) {
      ElMessage.error('网络不可用，暂时无法续期，请检查网络后重试')
    }
    // 401/403 are handled globally by the interceptor (state cleanup + redirect)
  }
}
</script>

<style scoped>
.session-bar {
  margin-bottom: 16px;
  align-items: center;
}

.session-bar__inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.session-bar__status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.session-bar__time {
  font-variant-numeric: tabular-nums;
  font-size: 15px;
  margin: 0 2px;
}

.session-bar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.is-warning-icon {
  color: var(--el-color-warning);
}

.is-error-icon {
  color: var(--el-color-error);
}
</style>
