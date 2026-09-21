import { computed } from "vue"

import { fetchAuthOptions } from "@/features/auth/api"
import { useRequest } from "@/shared/composables/useRequest"

/**
 * 本站是否开放注册。只有登录页用，每进一次登录页读一次。
 *
 * 读到之前、读失败都当作不开放：注册入口是次要的，宁可先不给，也不给一个点了必然失败的。
 * 读失败不提示，登录照常能用；真开放着的话，刷新一下就回来了。
 */
export function useRegistrationOpen() {
  const { data } = useRequest([], fetchAuthOptions)
  return computed(() => data.value?.allowRegistration === true)
}
