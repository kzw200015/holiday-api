import { z } from "zod"

import { utf8Length } from "./text"

/* 前后端都要执行的规则：前端据此列选项、提交前预校验、当场改本地那份，后端据此校验入参、落库。请求的形状不在这里，见后端的路由。 */

/** 搜索词的字节上限。搜索历史存的就是搜过的词，两处共用这一份：各写各的，能搜的词就可能存不进历史。 */
export const KEYWORD_MAX_BYTES = 200

/* 搜索历史最多留几条。 */
const SEARCH_HISTORY_LIMIT = 10

/** 自动翻页间隔的取值范围，单位秒。 */
export const READER_INTERVAL_MIN = 1
export const READER_INTERVAL_MAX = 20

/**
 * 图集分类，也是搜索与偏好里认的名字。e 站的分类就这十个，服务端据此换算筛选参数，前端据此列筛选项。
 */
export const GALLERY_CATEGORIES = [
  "doujinshi",
  "manga",
  "artistcg",
  "gamecg",
  "western",
  "non-h",
  "imageset",
  "cosplay",
  "asianporn",
  "misc",
] as const

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number]

/** 最低评分可选的星数。e 站只有这几档下限，「不限」用 null 表示，不拿哪个数冒充。 */
export const GALLERY_MIN_RATINGS = [2, 3, 4, 5] as const

export type GalleryMinRating = (typeof GALLERY_MIN_RATINGS)[number]

const READER_INTERVAL_RULE = `自动翻页间隔应为 ${READER_INTERVAL_MIN}–${READER_INTERVAL_MAX} 秒`

/** 自动翻页间隔：前端调间隔前先过一遍，服务端存偏好时校验的也是它。 */
export const readerIntervalSchema = z
  .int({ error: READER_INTERVAL_RULE })
  .min(READER_INTERVAL_MIN, { error: READER_INTERVAL_RULE })
  .max(READER_INTERVAL_MAX, { error: READER_INTERVAL_RULE })

/** 还没存过偏好时的样子，与表上的列默认值一致。 */
export const DEFAULT_GALLERY_PREFERENCES: {
  categories: GalleryCategory[]
  minRating: GalleryMinRating | null
  readerInterval: number
} = {
  categories: [],
  minRating: null,
  readerInterval: 5,
}

const SEARCH_HISTORY_ENTRY_RULE = `搜索历史关键词应为 1–${KEYWORD_MAX_BYTES} 字节`

/** 搜索历史里的一条。空串存下来没有意义，超长的存不进去：前端记之前先挡掉，服务端记与删时校验的也是它。 */
export const searchHistoryEntrySchema = z
  .string({ error: SEARCH_HISTORY_ENTRY_RULE })
  .min(1, SEARCH_HISTORY_ENTRY_RULE)
  .refine((entry) => utf8Length(entry) <= KEYWORD_MAX_BYTES, SEARCH_HISTORY_ENTRY_RULE)

/**
 * 记下一个搜过的词：最近的排最前，同一个词只留一条，总共留 {@link SEARCH_HISTORY_LIMIT} 条。
 * 服务端按它落库，前端按它当场改本地那份，两边是同一条规则。
 */
export function recordSearchKeyword(entries: readonly string[], keyword: string): string[] {
  return [keyword, ...entries.filter((entry) => entry !== keyword)].slice(0, SEARCH_HISTORY_LIMIT)
}
