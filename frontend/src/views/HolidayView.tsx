import { defineComponent } from "vue"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/* 节假日查询占位页，用于验证导航选中态切换 */
export default defineComponent({
  name: "HolidayView",
  setup() {
    return () => (
      <Card>
        <CardHeader>
          <CardTitle>节假日查询</CardTitle>
          <CardDescription>待接入后端接口 GET /api/holiday/is-holiday。</CardDescription>
        </CardHeader>
      </Card>
    )
  },
})
