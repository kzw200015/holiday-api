/* 分类与标签的中文词汇表。这些是展示用的说法，跟接口无关，所以不放在 api 里。 */

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
] as const

/** e 站返回的分类名到中文的映射。没收录的分类原样显示 */
export const categoryLabels: Record<string, string> = {
  ...Object.fromEntries(CATEGORIES.map(({ name, label }) => [name, label])),
  /* 里站独有，只会出现在详情里，不作为筛选项 */
  Private: "私有",
}

/** 分类筛选项。value 必须和后端 categoryBits（eh/category.go）的键逐字对应，拼错会被后端回 400 */
export const galleryCategories = CATEGORIES.map(({ value, label }) => ({ value, label }))

/* 标签形如 artist:gentsuki；没有冒号的归到空命名空间 */
export function splitTag(tag: string): { namespace: string; value: string } {
  const index = tag.indexOf(":")
  return index < 0 ? { namespace: "", value: tag } : { namespace: tag.slice(0, index), value: tag.slice(index + 1) }
}

/* 标签命名空间的中文名，没收录的就原样显示 */
const NAMESPACE_LABELS: Record<string, string> = {
  language: "语言",
  parody: "原作",
  character: "角色",
  group: "社团",
  artist: "作者",
  male: "男性",
  female: "女性",
  mixed: "混合",
  other: "其他",
  cosplayer: "扮演者",
  reclass: "重分类",
  temp: "临时",
}

export function formatNamespace(namespace: string): string {
  return NAMESPACE_LABELS[namespace] ?? namespace
}
