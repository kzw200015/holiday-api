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
  const offsets = [0]
  for (const width of widths) {
    offsets.push(offsets[offsets.length - 1] + width)
  }
  const maxScroll = Math.max(0, offsets[total] - viewportWidth)

  function pageAt(x: number) {
    let low = 1
    let high = total
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (offsets[middle - 1] <= x) {
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
    const center = offsets[page - 1] + widths[page - 1] / 2
    return Math.max(0, Math.min(center - viewportWidth / 2, maxScroll))
  }

  function visiblePages(left: number) {
    const first = pageAt(left)
    let last = first
    while (last < total && offsets[last] < left + viewportWidth) {
      last++
    }
    return { first, last }
  }

  return { widths, offsets, maxScroll, pageAtScroll, scrollToPage, visiblePages }
}
