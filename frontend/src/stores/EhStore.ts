import { defineStore } from "pinia"
import { ref } from "vue"

/* e 站凭据变化只使 EH 内部页面失效，不干预其他模块或账号级缓存。 */
export const useEhStore = defineStore("EhStore", () => {
  const cacheRevision = ref(0)

  function invalidateCache() {
    cacheRevision.value += 1
  }

  return { cacheRevision, invalidateCache }
})
