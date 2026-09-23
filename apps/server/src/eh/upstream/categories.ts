import type { GalleryCategory } from "@myapi/shared"

/** 图集分类与 e 站搜索参数 f_cats 的换算：f_cats 传的是「要排除哪些」的位和，不是「要哪些」。 */
const CATEGORY_BITS: Record<GalleryCategory, number> = {
  misc: 1,
  doujinshi: 2,
  manga: 4,
  artistcg: 8,
  gamecg: 16,
  imageset: 32,
  cosplay: 64,
  asianporn: 128,
  "non-h": 256,
  western: 512,
}

const ALL = Object.values(CATEGORY_BITS).reduce((bits, bit) => bits | bit, 0)

/**
 * 把选中的分类换算成 f_cats；返回 null 表示这次不加这个参数。
 * 全不选和全选都表示「不过滤」，此时必须干脆别加参数——按公式算的话全不选会得到 1023，那是「全部排除」。
 */
export function categoryFilter(categories: readonly GalleryCategory[]): number | null {
  const selected = categories.reduce((bits, name) => bits | CATEGORY_BITS[name], 0)
  return selected === 0 || selected === ALL ? null : ALL & ~selected
}
