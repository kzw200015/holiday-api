/** 图集图片按比例容纳于视口；所有位置计算共用同一份宽度和累计偏移。 */
export function createReaderLayout(
  total: number,
  viewportWidth: number,
  viewportHeight: number,
  ratios: Record<number, number>,
) {
  const widths = Array.from({ length: total }, (_, index) =>
    Math.min(viewportWidth, viewportHeight * (ratios[index + 1] ?? 0.7)),
  )
  /* offsets[i] 是第 i + 1 页的左边缘，末尾多一项是整条的长度 */
  const offsets = [0]
  let end = 0
  for (const width of widths) {
    end += width
    offsets.push(end)
  }
  const maxScroll = Math.max(0, end - viewportWidth)

  /** 第 page 页的左边缘，页码从 1 起；total + 1 是整条的末端，超出范围的按两端算。 */
  const offsetOf = (page: number) => offsets[page - 1] ?? (page < 1 ? 0 : end)
  /** 第 page 页的宽度，页码从 1 起；没有这一页时是 0。 */
  const widthOf = (page: number) => widths[page - 1] ?? 0

  function pageAt(x: number) {
    let low = 1
    let high = total
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (offsetOf(middle) <= x) {
        low = middle
      } else {
        high = middle - 1
      }
    }
    return low
  }

  function pageAtScroll(left: number) {
    if (left <= 1) {
      return 1
    }
    if (left >= maxScroll - 1) {
      return total
    }
    return pageAt(left + viewportWidth / 2)
  }

  function scrollToPage(page: number) {
    const center = offsetOf(page) + widthOf(page) / 2
    return Math.max(0, Math.min(center - viewportWidth / 2, maxScroll))
  }

  function visiblePages(left: number) {
    const first = pageAt(left)
    let last = first
    while (last < total && offsetOf(last + 1) < left + viewportWidth) {
      last++
    }
    return { first, last }
  }

  return { offsetOf, widthOf, maxScroll, pageAtScroll, scrollToPage, visiblePages }
}
