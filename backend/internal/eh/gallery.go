package eh

import "time"

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
