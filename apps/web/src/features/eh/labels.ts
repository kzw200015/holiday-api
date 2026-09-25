/* 分类与最低评分的中文词汇表。这些是展示用的说法，跟接口无关，所以不放在 api 里。标签的中文名由服务端连同标签一起给出。 */

import { GALLERY_MIN_RATINGS, type GalleryCategory, type GalleryMinRating } from "@myapi/shared/eh"

/**
 * 分类的三种叫法：value 是后端筛选参数认的名字，name 是 gdata 返回的展示名，label 是界面文案。
 * 合成一张表是因为中文标签本来两处都要用，分开写就会出现「卡片上写『漫画』、筛选按钮上写别的」。
 */
const CATEGORIES = [
  { value: "doujinshi", name: "Doujinshi", label: "同人志" },
  { value: "manga", name: "Manga", label: "漫画" },
  { value: "artistcg", name: "Artist CG", label: "画师 CG" },
  { value: "gamecg", name: "Game CG", label: "游戏 CG" },
  { value: "western", name: "Western", label: "西方" },
  { value: "non-h", name: "Non-H", label: "非 H" },
  { value: "imageset", name: "Image Set", label: "图集" },
  { value: "cosplay", name: "Cosplay", label: "Cosplay" },
  { value: "asianporn", name: "Asian Porn", label: "亚洲写真" },
  { value: "misc", name: "Misc", label: "杂项" },
] as const satisfies readonly { value: GalleryCategory; name: string; label: string }[]

/** e 站返回的分类名到中文的映射。没收录的分类原样显示 */
export const categoryLabels: Record<string, string> = {
  ...Object.fromEntries(CATEGORIES.map(({ name, label }) => [name, label])),
  /* 里站独有，只会出现在详情里，不作为筛选项 */
  Private: "私有",
}

/** 分类筛选项。value 的取值由共享包的 GalleryCategory 约束，拼错编译不过 */
export const galleryCategories = CATEGORIES.map(({ value, label }) => ({ value, label }))

/** 最低评分的选项，头一项是不限 */
export const minRatingOptions: readonly { value: GalleryMinRating | null; label: string }[] = [
  { value: null, label: "不限" },
  ...GALLERY_MIN_RATINGS.map((value) => ({ value, label: `${value} 星` })),
]
