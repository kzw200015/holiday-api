package eh

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"myapi/internal/signing"
	"myapi/internal/web"
)

// 图集内容不会变，浏览器缓存住之后来回翻页就不再回源，也就不再消耗 e 站配额。
const imageCacheControl = "private, max-age=2592000, immutable"

// 这两条接口的身份**不来自登录令牌**：<img> 发的请求带不了 Authorization 头，
// 所以它们挂在没有 tokens.Require 的那一组里，改由地址里的签名认人——
// 下面每条都自己解出 uid、校验签名，这一段不能省成「反正中间件挡过了」。
//
// 响应体是二进制流而不是 ApiResponse，所以写成 web.Handler，不走 Router 的 Get。

// galleryImage 流式转发大图，地址形如 .../pages/{page}/image?uid=&e=&s=。
func (h *Handler) galleryImage(w http.ResponseWriter, r *http.Request) error {
	ref, err := galleryRefOf(r)
	if err != nil {
		return err
	}

	query := r.URL.Query()
	// uid 随后由 Service 校验签名，通过后才能用它读取凭据。
	userID, err := strconv.ParseInt(query.Get("uid"), 10, 64)
	if err != nil || userID <= 0 {
		return web.BadRequest("用户标识不合法")
	}
	sig, ok := signing.ParseQuery(query)
	if !ok {
		return errIncompleteSignature()
	}
	// 页码解析失败得到 0，跟「页码为正」那条规则撞在一起，由业务统一报错。
	page, _ := strconv.Atoi(chi.URLParam(r, "page"))

	image, err := h.service.OpenGalleryImage(r.Context(), userID, ref, page, sig)
	if err != nil {
		return err
	}
	return stream(r.Context(), w, image)
}

// thumbnail 转发缩略图，地址形如 /thumbnail?u=&e=&s=，只接受本服务签发过的地址。
func (h *Handler) thumbnail(w http.ResponseWriter, r *http.Request) error {
	query := r.URL.Query()
	encoded := query.Get("u")
	if encoded == "" {
		return web.BadRequest("缺少缩略图地址")
	}
	sig, ok := signing.ParseQuery(query)
	if !ok {
		return errIncompleteSignature()
	}

	thumbnail, err := h.service.OpenThumbnail(r.Context(), encoded, sig)
	if err != nil {
		return err
	}
	return stream(r.Context(), w, thumbnail)
}

// 流式转发，不把整张图读进内存。
func stream(ctx context.Context, w http.ResponseWriter, attachment *Attachment) error {
	defer attachment.Body.Close()

	w.Header().Set("Content-Type", attachment.ContentType)
	w.Header().Set("Cache-Control", imageCacheControl)
	if attachment.ContentLength != "" {
		w.Header().Set("Content-Length", attachment.ContentLength)
	}
	w.WriteHeader(http.StatusOK)

	// 头已经发出去了，转发中途断了没法再改成错误响应，只能记一条日志。
	// 浏览器自己中止的（快速翻页时成批发生）不算故障，降到 debug，免得淹掉真正的上游断流
	if _, err := io.Copy(w, attachment.Body); err != nil {
		if ctx.Err() != nil {
			slog.Debug("客户端中途放弃了图片", "url", attachment.Source)
		} else {
			slog.Warn("转发图片时中断", "url", attachment.Source, "err", err)
		}
	}
	return nil
}
