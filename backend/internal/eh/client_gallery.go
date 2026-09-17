package eh

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
)

// gdata 的批量上限属于上游协议，调用方不需要自行切片。
const metadataBatchSize = 25

type galleryList struct {
	Refs       []GalleryRef
	NextCursor *string
}

func (c *Client) Search(ctx context.Context, rc RequestContext, search SearchQuery) (galleryList, error) {
	filter, err := toCategoryFilter(search.Categories)
	if err != nil {
		return galleryList{}, err
	}
	query := url.Values{}
	if search.Keyword != "" {
		query.Set("f_search", search.Keyword)
	}
	if filter >= 0 {
		query.Set("f_cats", strconv.Itoa(filter))
	}
	if search.Cursor != "" {
		query.Set("next", search.Cursor)
	}
	body, err := c.fetchPage(ctx, rc, "/?"+query.Encode())
	if err != nil {
		return galleryList{}, err
	}
	refs, cursor, err := parseGalleryList(body)
	return galleryList{Refs: refs, NextCursor: cursor}, err
}

// 元数据统一匿名请求前站；整批失败报错，单条不可访问则不出现在结果中。
func (c *Client) FetchMetadata(ctx context.Context, refs []GalleryRef) (map[GalleryRef]galleryMetadata, error) {
	result := make(map[GalleryRef]galleryMetadata, len(refs))
	for start := 0; start < len(refs); start += metadataBatchSize {
		chunk := refs[start:min(start+metadataBatchSize, len(refs))]
		list := make([][2]any, len(chunk))
		requested := make(map[GalleryRef]bool, len(chunk))
		for i, ref := range chunk {
			list[i] = [2]any{ref.GID, ref.Token}
			requested[ref] = true
		}
		payload := struct {
			Method    string   `json:"method"`
			GIDList   [][2]any `json:"gidlist"`
			Namespace int      `json:"namespace"`
		}{Method: "gdata", GIDList: list, Namespace: 1}
		var response gdataResponse
		if err := c.callAPI(ctx, RequestContext{Site: SiteE}, payload, &response); err != nil {
			return nil, err
		}
		if response.Error != "" {
			return nil, errUnavailable("e 站元数据接口拒绝了请求：%s", response.Error)
		}
		if response.Gmetadata == nil {
			return nil, errUnavailable("e 站元数据接口没有返回图集数据")
		}
		for _, entry := range response.Gmetadata {
			if entry.Error != "" {
				continue
			}
			ref := GalleryRef{GID: int64(entry.GID), Token: entry.Token}
			if !requested[ref] {
				return nil, errUnavailable("e 站返回的图集定位信息与请求不一致")
			}
			result[ref] = toMetadata(entry)
		}
	}
	return result, nil
}

func (c *Client) FetchGallerySlice(ctx context.Context, rc RequestContext, ref GalleryRef, slice int) (gallerySlice, error) {
	body, err := c.fetchPage(ctx, rc, fmt.Sprintf("/g/%d/%s/?p=%d", ref.GID, ref.Token, slice))
	if err != nil {
		return gallerySlice{}, err
	}
	parsed := parseGalleryPage(body)
	if len(parsed.PageTokens) == 0 {
		return gallerySlice{}, errUnavailable("图集页面没有可识别的图片令牌")
	}
	return parsed, nil
}

func (c *Client) FetchImagePage(ctx context.Context, rc RequestContext, ref GalleryRef, page int, pageToken, reloadToken string) (imagePage, error) {
	path := fmt.Sprintf("/s/%s/%d-%d", pageToken, ref.GID, page)
	if reloadToken != "" {
		path += "?nl=" + url.QueryEscape(reloadToken)
	}
	body, err := c.fetchPage(ctx, rc, path)
	if err != nil {
		return imagePage{}, err
	}
	parsed := parseImagePage(body)
	if parsed.ImageURL == "" {
		return imagePage{}, errUnavailable("第 %d 页没解析出图片地址，e 站版面可能改了", page)
	}
	return parsed, nil
}

func (c *Client) ShowImage(ctx context.Context, rc RequestContext, ref GalleryRef, page int, pageToken, showKey string) (imagePage, error) {
	payload := struct {
		Method   string `json:"method"`
		GID      int64  `json:"gid"`
		Page     int    `json:"page"`
		ImageKey string `json:"imgkey"`
		ShowKey  string `json:"showkey"`
	}{Method: "showpage", GID: ref.GID, Page: page, ImageKey: pageToken, ShowKey: showKey}
	var response showPageResponse
	if err := c.callAPI(ctx, rc, payload, &response); err != nil {
		return imagePage{}, err
	}
	if response.Error == "Key mismatch" {
		return imagePage{}, errShowKeyExpired
	}
	if response.Error != "" {
		return imagePage{}, errUnavailable("e 站图片接口拒绝了请求：%s", response.Error)
	}
	parsed := parseImagePage(response.I3)
	if parsed.ImageURL == "" {
		return imagePage{}, errUnavailable("第 %d 页的图片接口没有返回图片地址", page)
	}
	return parsed, nil
}
