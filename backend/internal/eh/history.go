package eh

import (
	"context"
	"time"
)

// ReadingHistoryItem 保留进度标识；元数据不可访问时 Gallery 为空，但记录仍可删除。
type ReadingHistoryItem struct {
	GID     int64        `json:"gid"`
	Token   string       `json:"token"`
	Page    int32        `json:"page"`
	ReadAt  time.Time    `json:"readAt"`
	Gallery *GalleryCard `json:"gallery"`
}

type ReadingHistoryPage struct {
	Items      []ReadingHistoryItem `json:"items"`
	NextCursor *string              `json:"nextCursor"`
}

// ReadingHistory 取一页阅读历史：记录来自本站的库，每条的展示信息再向上游补齐。
func (s *Service) ReadingHistory(ctx context.Context, userID int64, cursor string) (ReadingHistoryPage, error) {
	rows, nextCursor, err := s.readingHistoryPage(ctx, userID, cursor)
	if err != nil {
		return ReadingHistoryPage{}, err
	}

	refs := make([]GalleryRef, len(rows))
	for i, row := range rows {
		refs[i] = GalleryRef{GID: row.Gid, Token: row.Token}
	}
	galleries, err := s.loadGalleries(ctx, refs)
	if err != nil {
		// 整批请求失败是可重试错误，不能把网络故障伪装成所有图集失效。
		return ReadingHistoryPage{}, err
	}

	result := ReadingHistoryPage{Items: make([]ReadingHistoryItem, 0, len(rows)), NextCursor: nextCursor}
	for i, row := range rows {
		item := ReadingHistoryItem{GID: row.Gid, Token: row.Token, Page: row.Page, ReadAt: row.UpdatedAt}
		if gallery, ok := galleries[refs[i]]; ok {
			card := s.galleryCard(gallery)
			item.Gallery = &card
		}
		result.Items = append(result.Items, item)
	}
	return result, nil
}
