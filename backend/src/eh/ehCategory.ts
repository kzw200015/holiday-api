/**
 * 图集分类与 e 站搜索参数 f_cats 的换算。
 *
 * 单独一个文件是因为控制器只需要分类名单来做入参校验，不该为此把整个 EhService 拽进来；
 * 换算规则本身也是纯函数，跟远程调用、缓存都没有关系。
 */

/** 分类位掩码。f_cats 传的是「要排除哪些」，不是「要哪些」。 */
const CATEGORY_BITS = {
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
} as const

/** 十个分类全选中时的位和。 */
const ALL_CATEGORIES = 1023

export type EhCategory = keyof typeof CATEGORY_BITS

/**
 * 分类名的唯一来源，控制器拿它做入参校验。
 * 不校验的话前端把名字拼错只会让那一位掩码算成 0，表现是「筛选点了但结果没变」，无声无息。
 */
export const CATEGORY_NAMES = Object.keys(CATEGORY_BITS) as [EhCategory, ...EhCategory[]]

/**
 * 把选中的分类换算成 f_cats。
 *
 * f_cats 传的是**要排除**的分类位和，方向很容易写反。
 * 全不选和全选都表示「不过滤」，此时返回 null 让调用方干脆别加这个参数——
 * 按公式算的话全不选会得到 1023，那是「全部排除」，一条结果都搜不出来。
 */
export function toCategoryFilter(categories: EhCategory[]): number | null {
  const selected = categories.reduce((bits, name) => bits | CATEGORY_BITS[name], 0)
  if (selected === 0 || selected === ALL_CATEGORIES) {
    return null
  }
  return ALL_CATEGORIES & ~selected
}
