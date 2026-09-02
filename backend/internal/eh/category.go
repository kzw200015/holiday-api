package eh

// 图集分类与 e 站搜索参数 f_cats 的换算。
//
// 分类位掩码：f_cats 传的是「要排除哪些」，不是「要哪些」。
var categoryBits = map[string]int{
	"misc":      1,
	"doujinshi": 2,
	"manga":     4,
	"artistcg":  8,
	"gamecg":    16,
	"imageset":  32,
	"cosplay":   64,
	"asianporn": 128,
	"non-h":     256,
	"western":   512,
}

// 十个分类全选中时的位和。
const allCategories = 1023

// toCategoryFilter 把选中的分类换算成 f_cats，返回 -1 表示这次不加这个参数。
//
// 方向很容易写反：传的是**要排除**的分类位和。全不选和全选都表示「不过滤」，
// 此时必须干脆别加参数——按公式算的话全不选会得到 1023，那是「全部排除」，一条结果都搜不出来。
//
// 认不出的分类名不能默默忽略：那一位掩码会算成 0，表现是「筛选点了但结果没变」，无声无息，
// 所以调用方要先校验名字，见 parseCategories。
func toCategoryFilter(categories []string) int {
	selected := 0
	for _, name := range categories {
		selected |= categoryBits[name]
	}
	if selected == 0 || selected == allCategories {
		return -1
	}
	return allCategories &^ selected
}
