<template>
  <div v-if="visible">
    <!-- 临近到期：警告并允许主动续期 -->
    <el-alert
      v-if="authStore.isWarning"
      :title="title"
      type="warning"
      show-icon
      :closable="false"
      class="session-alert"
    >
      <div class="session-body">
        <span>
          登录态将在 <strong>{{ formatted }}</strong> 后到期，到期后需重新登录
          <span v-if="!authStore.isOnline" class="offline-hint">（当前网络已断开）</span>
        </span>
        <el-button
          type="primary"
          size="small"
          :loading="authStore.renewing"
          :disabled="authStore.renewing || !authStore.isOnline"
          @click="handleRenew"
        >
          {{ authStore.renewing ? '续期中...' : '立即续期' }}
        </el-button>
      </div>
      <div v-if="authStore.renewError" class="renew-error">
        {{ authStore.renewError }}
        <el-button
          v-if="authStore.isOnline"
          link
          type="primary"
          size="small"
          @click="handleRenew"
        >重试</el-button>
      </div>
    </el-alert>

    <!-- 正常状态：展示会话有效期剩余时间 -->
    <div v-else class="session-ok">
      <el-icon><Clock /></el-icon>
      <span>登录有效剩余 {{ formattedLong }}</span>
      <span v-if="!authStore.isOnline" class="offline-hint">· 网络已断开</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Clock } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const authStore = useAuthStore()

const visible = computed(() => authStore.isLoggedIn && !!route.meta.requiresAuth)
const remaining = computed(() => authStore.remainingMs)

function pad(value) {
  return String(value).padStart(2, '0')
}

// 警告窗口内 mm:ss 倒计时
const formatted = computed(() => {
  const totalSeconds = Math.max(Math.ceil(remaining.value / 1000), 0)
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`
})

// 正常状态展示 HH:mm:ss（超过 1 小时带小时）
const formattedLong = computed(() => {
  const totalSeconds = Math.max(Math.floor(remaining.value / 1000), 0)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours} 小时 ${pad(minutes)} 分 ${pad(seconds)} 秒`
    : `${pad(minutes)} 分 ${pad(seconds)} 秒`
})

const title = computed(() => {
  if (!authStore.isOnline) return '网络已断开，无法续期，请检查网络'
  return '管理员会话即将到期'
})

async function handleRenew() {
  await authStore.renew()
  if (authStore.renewError) {
    ElMessage.warning(authStore.renewError)
  } else if (authStore.isLoggedIn) {
    ElMessage.success('会话已续期')
  }
}
</script>

<style scoped>
.session-alert {
  margin-bottom: 16px;
}

.session-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.session-ok {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  padding: 6px 12px;
  font-size: 13px;
  color: #67c23a;
  background-color: #f0f9eb;
  border: 1px solid #e1f3d8;
  border-radius: 4px;
}

.offline-hint {
  color: #e6a23c;
}

.renew-error {
  margin-top: 4px;
  font-size: 12px;
  color: #f56c6c;
}
</style>
