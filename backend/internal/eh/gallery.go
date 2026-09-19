package eh

import (
	"regexp"
	"time"

	"myapi/internal/apperr"
)

// token 固定 10 位十六进制。它和 gid 都会被拼进上游地址，不校验就等于把用户输入直接发给 e 站。
var tokenPattern = regexp.MustCompile(`^[0-9a-f]{10}$`)

// newGalleryRef 是 GalleryRef 唯一的入口：凡是从外部来的 gid/token 都得先过这里，
// 之后拿着 ref 的代码不必再各自提防一遍。
func newGalleryRef(gid int64, token string) (GalleryRef, error) {
	if err := checkGID(gid); err != nil {
		return GalleryRef{}, err
	}
	if !tokenPattern.MatchString(token) {
		return GalleryRef{}, apperr.New(apperr.InvalidArgument, "图集令牌不合法")
	}
	return GalleryRef{GID: gid, Token: token}, nil
}

// 图集编号必须是正整数。新建 ref 和按 gid 删历史两条入口共用这一份规则和文案。
func checkGID(gid int64) error {
	if gid <= 0 {
		return apperr.New(apperr.InvalidArgument, "图集编号不合法")
	}
	return nil
}

// 页码必须是正整数。上报进度和取图两条入口共用这一份规则和文案。
func checkPage(page int) error {
	if page <= 0 {
		return apperr.New(apperr.InvalidArgument, "页码不合法")
	}
	return nil
}

// galleryMetadata 保留标准化后的上游数据，不包含本站签名地址或用户阅读状态。
type galleryMetadata struct {
	Ref          GalleryRef
	Title        string
	TitleJpn     string
	Category     string
	ThumbnailURL string
	Uploader     string
	PostedAt     time.Time
	FileCount    int
	Rating       float64
	Tags         []string
	FileSize     int64
	TorrentCount int
	Expunged     bool
}

func (s *Service) galleryCard(gallery galleryMetadata) GalleryCard {
	return GalleryCard{
		GID:       gallery.Ref.GID,
		Token:     gallery.Ref.Token,
		Title:     gallery.Title,
		TitleJpn:  gallery.TitleJpn,
		Category:  gallery.Category,
		Thumbnail: s.thumbnailURL(gallery.ThumbnailURL),
		Uploader:  gallery.Uploader,
		PostedAt:  gallery.PostedAt.UTC().Format(isoLayout),
		FileCount: gallery.FileCount,
		Rating:    gallery.Rating,
		Tags:      gallery.Tags,
	}
}

func (s *Service) galleryDetail(gallery galleryMetadata) GalleryDetail {
	return GalleryDetail{
		GalleryCard:  s.galleryCard(gallery),
		FileSize:     gallery.FileSize,
		TorrentCount: gallery.TorrentCount,
		Expunged:     gallery.Expunged,
	}
}
