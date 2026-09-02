package eh

import (
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

// 两个图片接口，同样挂在 /api/eh 下，但**不要求登录**。
//
// <img src> 是浏览器自己发的请求，带不了 Authorization 头也就拿不到 JWT，
// 所以这两个接口靠地址里的签名认身份：签名由 service 签发，覆盖「这是哪一份附件、给谁看、什么时候过期」。
//
// 单独一个文件而不是在 handler.go 里挑几条路由豁免，是因为「哪些接口不需要登录」必须一眼看得出来。
func imageRoutes(router chi.Router, service *Service) {
	// GET /api/eh/galleries/{gid}/{token}/pages/{page}/image?uid=&e=&s=，流式转发大图
	router.Method(http.MethodGet, "/galleries/{gid}/{token}/pages/{page}/image",
		web.Handler(func(w http.ResponseWriter, r *http.Request) error {
			web.Quiet(r)

			ref, err := parseGalleryRef(r)
			if err != nil {
				return err
			}
			page, err := strconv.Atoi(chi.URLParam(r, "page"))
			if err != nil || page <= 0 {
				return web.BadRequest("页码不合法")
			}
			// userId 只能来自签名过的 uid 参数，不能取当前登录者——这条链路根本没有登录者，
			// 而信客户端随便给的值等于拿别人的 e 站凭据取图
			userID, err := strconv.ParseInt(r.URL.Query().Get("uid"), 10, 64)
			if err != nil || userID <= 0 {
				return web.BadRequest("用户标识不合法")
			}
			sig, err := parseSignature(r)
			if err != nil {
				return err
			}

			response, err := service.OpenGalleryImage(r.Context(), userID, ref, page, sig)
			if err != nil {
				return err
			}
			return stream(w, response)
		}))

	// GET /api/eh/thumbnail?u=&e=&s=，只接受本服务签发过的地址
	router.Method(http.MethodGet, "/thumbnail", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		web.Quiet(r)

		encoded := r.URL.Query().Get("u")
		if encoded == "" {
			return web.BadRequest("缺少缩略图地址")
		}
		sig, err := parseSignature(r)
		if err != nil {
			return err
		}

		response, err := service.OpenThumbnail(r.Context(), encoded, sig)
		if err != nil {
			return err
		}
		return stream(w, response)
	}))
}

// 签名地址上固定的两个参数：过期时间与签名。这里只管「有没有」，对不对由 service 校验。
func parseSignature(r *http.Request) (signing.Signature, error) {
	query := r.URL.Query()
	if query.Get("e") == "" {
		return signing.Signature{}, web.BadRequest("缺少过期时间")
	}
	if query.Get("s") == "" {
		return signing.Signature{}, web.BadRequest("缺少签名")
	}
	return signing.Signature{ExpiresAt: query.Get("e"), Value: query.Get("s")}, nil
}

// 流式转发，不把整张图读进内存。
func stream(w http.ResponseWriter, response *http.Response) error {
	defer response.Body.Close()

	w.Header().Set("Content-Type", response.Header.Get("Content-Type"))
	w.Header().Set("Cache-Control", imageCacheControl)
	if length := response.Header.Get("Content-Length"); length != "" {
		w.Header().Set("Content-Length", length)
	}
	w.WriteHeader(http.StatusOK)

	// 头已经发出去了，转发中途断了没法再改成错误响应，只能记一条日志
	if _, err := io.Copy(w, response.Body); err != nil {
		slog.Warn("转发图片时中断", "url", response.Request.URL.String(), "err", err)
	}
	return nil
}
