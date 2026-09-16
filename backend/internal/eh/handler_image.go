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

func (h *Handler) imageRoutes(router chi.Router) {
	// 这两条一次阅读就是几十个请求，访问日志统一降到 debug
	router.Use(web.Quiet)

	// GET /api/eh/galleries/{gid}/{token}/pages/{page}/image?uid=&e=&s=，流式转发大图
	router.Method(http.MethodGet, "/galleries/{gid}/{token}/pages/{page}/image",
		web.Handler(func(w http.ResponseWriter, r *http.Request) error {
			ref, err := parseGalleryRef(r)
			if err != nil {
				return err
			}
			page, err := parsePage(chi.URLParam(r, "page"))
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

			image, err := h.service.OpenGalleryImage(r.Context(), userID, ref, page, sig)
			if err != nil {
				return err
			}
			return stream(r.Context(), w, image)
		}))

	// GET /api/eh/thumbnail?u=&e=&s=，只接受本服务签发过的地址
	router.Method(http.MethodGet, "/thumbnail", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
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
	}))
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
