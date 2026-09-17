package eh

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"

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

	target, err := s.locator.Resolve(ctx, rc, ref, page)
	if err != nil {
		return nil, err
	}
	attachment, err := s.client.OpenImage(ctx, target)
	var nodeFailure *imageNodeError
	if !errors.As(err, &nodeFailure) {
		return attachment, err
	}

	slog.Info("图床节点取图失败，换源重试", "gid", ref.GID, "page", page, "status", nodeFailure.status)
	target, err = s.locator.Refresh(ctx, rc, ref, page)
	if err != nil {
		return nil, err
	}
	return s.client.OpenImage(ctx, target)
}

// OpenThumbnail 是缩略图代理，只接受本服务签发过的地址，客户端指定不了主机。
// 不需要 userID：缩略图落在图床上，图床不认 e 站的 Cookie，取图与是谁在看无关。
func (s *Service) OpenThumbnail(ctx context.Context, encoded string, sig signing.Signature) (*Attachment, error) {
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil || !s.signer.Verify(string(raw), sig) {
		return nil, errBadSignature("缩略图地址签名不正确或已过期")
	}

	return s.client.OpenImage(ctx, string(raw))
}

// 缩略图在组装响应时签名，签名有效期不受元数据缓存 TTL 影响。
func (s *Service) thumbnailURL(raw string) string {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(raw))
	return fmt.Sprintf("/api/eh/thumbnail?u=%s&%s", encoded, s.signer.Sign(raw).Query())
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
