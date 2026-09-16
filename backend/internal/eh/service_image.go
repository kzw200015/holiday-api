package eh

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"myapi/internal/signing"
)

// 大图地址模板里的页码占位符，前端替换成实际页码。
const pagePlaceholder = "{page}"

// OpenGalleryImage 校验签名后读取用户凭据并取图，节点失效时换源重试一次。
// 返回可直接转发的图片流，调用方负责关闭 Body。
func (s *Service) OpenGalleryImage(ctx context.Context, userID int64, ref GalleryRef, page int,
	sig signing.Signature) (*Attachment, error) {
	if !s.signer.Verify(imageSubject(userID, ref), sig) {
		return nil, errBadSignature("图片地址签名不正确或已过期，回到详情页重进一次")
	}

	rc, err := s.credentials.RequestContext(ctx, userID, "")
	if err != nil {
		return nil, err
	}

	response, err := s.openPage(ctx, rc, ref, page, false)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		slog.Info("图床节点取图失败，换源重试", "gid", ref.GID, "page", page, "status", response.StatusCode)
		if response, err = s.openPage(ctx, rc, ref, page, true); err != nil {
			return nil, err
		}
		// 换源也没成就到此为止（OpenImage 已经把失败响应的 body 关了）。
		// 不能再往下交给 toAttachment：那边只看 Content-Type，错误页要是恰好带着 image/ 就会被当成图转发出去
		if response.StatusCode != http.StatusOK {
			return nil, errUnavailable("第 %d 页取不到（图床返回 HTTP %d），过一会儿再试", page, response.StatusCode)
		}
	}
	return toAttachment(response, fmt.Sprintf("第 %d 页", page))
}

func (s *Service) openPage(ctx context.Context, rc RequestContext, ref GalleryRef, page int, reload bool) (*http.Response, error) {
	target, err := s.locator.Resolve(ctx, rc, ref, page, reload)
	if err != nil {
		return nil, err
	}
	return s.client.OpenImage(ctx, target)
}

// OpenThumbnail 是缩略图代理，只接受本服务签发过的地址，客户端指定不了主机。
// 不需要 userID：缩略图落在图床上，图床不认 e 站的 Cookie，取图与是谁在看无关。
func (s *Service) OpenThumbnail(ctx context.Context, encoded string, sig signing.Signature) (*Attachment, error) {
	// 解码失败也照样往下走：得到的只是一串乱码，挡住它的是随后的签名比对
	raw, _ := base64.RawURLEncoding.DecodeString(encoded)
	if !s.signer.Verify(string(raw), sig) {
		return nil, errBadSignature("缩略图地址签名不正确或已过期")
	}

	response, err := s.client.OpenImage(ctx, string(raw))
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		return nil, errUnavailable("缩略图取不到（HTTP %d）", response.StatusCode)
	}
	return toAttachment(response, "缩略图")
}

// 把 e 站的缩略图地址换成本站的代理地址，并签上名。
// 签名防止客户端篡改目标；上游提供的地址仍由 Client 的主机白名单约束。
func (s *Service) withThumbnail(gallery GalleryDetail) GalleryDetail {
	// 只修改值副本，缓存继续保留上游地址，避免把签名有效期绑到缓存 TTL 上。
	raw := gallery.Thumbnail
	encoded := base64.RawURLEncoding.EncodeToString([]byte(raw))
	gallery.Thumbnail = fmt.Sprintf("/api/eh/thumbnail?u=%s&%s", encoded, s.signer.Sign(raw).Query())
	return gallery
}

// 大图地址模板，前端只需替换 {page}，无需逐页请求签名。
func (s *Service) imageURLTemplate(userID int64, ref GalleryRef) string {
	return fmt.Sprintf("/api/eh/galleries/%d/%s/pages/%s/image?uid=%d&%s",
		ref.GID, ref.Token, pagePlaceholder, userID, s.signer.Sign(imageSubject(userID, ref)).Query())
}

// 大图通行证签的是「谁能看哪个图集」，页码不在里面。
func imageSubject(userID int64, ref GalleryRef) string {
	return fmt.Sprintf("%d:%d:%s", userID, ref.GID, ref.Token)
}

// Attachment 包含已校验的图片流及转发所需的响应头。
type Attachment struct {
	ContentType string
	// 上游给的长度，可能为空（分块传输）。
	ContentLength string
	// 上游地址，只用于转发中断时的日志。
	Source string
	Body   io.ReadCloser
}

// 上游出错时回的是 HTML 错误页，原样转发会让浏览器显示一张裂图，日志里也查不出原因。
func toAttachment(response *http.Response, what string) (*Attachment, error) {
	contentType := response.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		response.Body.Close()
		if contentType == "" {
			contentType = "无类型"
		}
		return nil, errUnavailable("%s返回的不是图片（%s）", what, contentType)
	}
	return &Attachment{
		ContentType:   contentType,
		ContentLength: response.Header.Get("Content-Length"),
		Source:        response.Request.URL.String(),
		Body:          response.Body,
	}, nil
}
