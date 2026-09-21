package io.github.kzw200015.myapi.eh.upstream

import io.github.kzw200015.myapi.AppException

/** 图集分类与 e 站搜索参数 f_cats 的换算：f_cats 传的是「要排除哪些」的位和，不是「要哪些」。 */
private val categoryBits = mapOf(
    "misc" to 1,
    "doujinshi" to 2,
    "manga" to 4,
    "artistcg" to 8,
    "gamecg" to 16,
    "imageset" to 32,
    "cosplay" to 64,
    "asianporn" to 128,
    "non-h" to 256,
    "western" to 512,
)

/** 全部分类的位和，由表求和得来：加第 11 个分类时不用记着同步这里，忘了同步的表现是「全选等于全部排除」。 */
private val allCategories = categoryBits.values.fold(0, Int::or)

/**
 * 把选中的分类换算成 f_cats；返回 null 表示这次不加这个参数。
 *
 * 全不选和全选都表示「不过滤」，此时必须干脆别加参数——按公式算的话全不选会得到 1023，那是「全部排除」，
 * 一条结果都搜不出来。认不出的分类名当场报错：默默忽略的话那一位会算成 0，表现是「筛选点了但结果没变」。
 */
fun categoryFilter(categories: Collection<String>): Int? {
    val selected = categories.fold(0) { bits, name ->
        bits or (categoryBits[name] ?: throw AppException.InvalidArgument("分类名不合法"))
    }
    return if (selected == 0 || selected == allCategories) null else allCategories and selected.inv()
}
