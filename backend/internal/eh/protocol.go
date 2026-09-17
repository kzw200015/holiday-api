package eh

import (
	"strconv"
	"strings"
	"time"
)

// e 站的 JSON 接口对数字的写法不统一：gid 是数字，而 filecount、rating 这些是字符串（"329"、"4.68"）。
// 两种都收下，写死成 float64 会在字符串那一侧整片报错。
type flexNumber float64

func (n *flexNumber) UnmarshalJSON(data []byte) error {
	text := strings.Trim(string(data), `"`)
	// 缺省值也照单全收：null 和空串都算 0，别让一个没填的字段废掉整批元数据
	if text == "" || text == "null" {
		*n = 0
		return nil
	}
	value, err := strconv.ParseFloat(text, 64)
	if err != nil {
		return err
	}
	*n = flexNumber(value)
	return nil
}

// gdata 的一条记录。字段名是 e 站 API 的原样，转换成标准化元数据由 Client 负责。
//
// 单个图集被删或转私有时，那一条会变成 `{ gid, error }`，所以 Error 也收进来，
// 让整批不至于因为一条坏数据全废。
type gdataEntry struct {
	GID          flexNumber `json:"gid"`
	Token        string     `json:"token"`
	Title        string     `json:"title"`
	TitleJpn     string     `json:"title_jpn"`
	Category     string     `json:"category"`
	Thumb        string     `json:"thumb"`
	Uploader     string     `json:"uploader"`
	Posted       flexNumber `json:"posted"`
	FileCount    flexNumber `json:"filecount"`
	FileSize     flexNumber `json:"filesize"`
	Expunged     bool       `json:"expunged"`
	Rating       flexNumber `json:"rating"`
	TorrentCount flexNumber `json:"torrentcount"`
	Tags         []string   `json:"tags"`
	Error        string     `json:"error"`
}

// 整个请求被拒时（gidlist 格式不对、条数超限）没有 gmetadata，只有一个顶层的 error。
type gdataResponse struct {
	Gmetadata []gdataEntry `json:"gmetadata"`
	Error     string       `json:"error"`
}

// showpage 的响应。成功时 i3 里是 `<img id="img" src=...>` 加上指向下一页的链接，
// showkey 过期时则是 `{"error":"Key mismatch"}`。
type showPageResponse struct {
	I3    string `json:"i3"`
	Error string `json:"error"`
}

// 上游的数字、HTML 实体和时间在协议边界统一转换。
func toMetadata(entry gdataEntry) galleryMetadata {
	tags := make([]string, len(entry.Tags))
	for i, tag := range entry.Tags {
		tags[i] = decodeEntities(tag)
	}
	return galleryMetadata{
		Ref:          GalleryRef{GID: int64(entry.GID), Token: entry.Token},
		Title:        decodeEntities(entry.Title),
		TitleJpn:     decodeEntities(entry.TitleJpn),
		Category:     entry.Category,
		ThumbnailURL: entry.Thumb,
		Uploader:     entry.Uploader,
		PostedAt:     time.Unix(int64(entry.Posted), 0).UTC(),
		FileCount:    int(entry.FileCount),
		Rating:       float64(entry.Rating),
		Tags:         tags,
		FileSize:     int64(entry.FileSize),
		TorrentCount: int(entry.TorrentCount),
		Expunged:     entry.Expunged,
	}
}
