package app

import (
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kzw200015/myapi/internal/holiday"
)

// detail 是 detail 接口对这一天的响应体。
func detail(t *testing.T, date string) string {
	t.Helper()
	r := shared.get(t, "/api/holiday/detail?date="+date)
	require.Equal(t, http.StatusOK, r.status, r.body)
	return r.body
}

func TestIsHolidayAnswersBareBoolean(t *testing.T) {
	reset(t)
	// 2026-01-04 是调休上班的周日，2026-01-10 是普通周六，2026-01-07 是普通周三
	for date, expected := range map[string]string{"2026-01-04": "false", "2026-01-10": "true", "2026-01-07": "false"} {
		r := shared.get(t, "/api/holiday/is-holiday?date="+date)
		require.Equal(t, http.StatusOK, r.status)
		require.JSONEq(t, expected, r.body, date)
	}
}

func TestDetailAnswersDateOffDayAndName(t *testing.T) {
	reset(t)
	require.JSONEq(t, `{"date": "2026-01-01", "isOffDay": true, "name": "元旦"}`, detail(t, "2026-01-01"))
	require.JSONEq(t, `{"date": "2026-01-10", "isOffDay": true, "name": ""}`, detail(t, "2026-01-10"))
}

func TestMissingOrEmptyDateMeansTodayInChina(t *testing.T) {
	reset(t)
	today := holiday.Today().Format(time.DateOnly)
	for _, path := range []string{"/api/holiday/detail", "/api/holiday/detail?date="} {
		r := shared.get(t, path)
		require.Equal(t, http.StatusOK, r.status, r.body)
		require.Equal(t, today, r.json(t)["date"], path)
	}
}

func TestUnparsableDatesGetTheBadRequestBody(t *testing.T) {
	reset(t)
	for _, date := range []string{"2026-02-30", "20260104", "abc"} {
		r := shared.get(t, "/api/holiday/detail?date="+date)
		require.Equal(t, http.StatusBadRequest, r.status, date)
		body := r.json(t)
		require.Equal(t, "INVALID_PARAMETER", body["code"])
		// 文案是 Echo 的原话，随它的版本变，只认提到了参数名
		require.Contains(t, body["message"], "date")
	}
}

func TestRefreshKeepsTheYearWhenTheSourceIsEmptyOrFailing(t *testing.T) {
	reset(t)
	fake.respond(func(path string) (int, string) {
		if path == "/2026.json" {
			return http.StatusOK, `{"days": []}`
		}
		return holidayCN(path)
	})
	require.NoError(t, refresher.OneYear(t.Context(), 2026))
	require.JSONEq(t, `{"date": "2026-01-01", "isOffDay": true, "name": "元旦"}`, detail(t, "2026-01-01"))

	fake.respond(func(string) (int, string) { return http.StatusBadGateway, "bad gateway" })
	require.ErrorContains(t, refresher.OneYear(t.Context(), 2026), "HTTP 502")
	require.JSONEq(t, `{"date": "2026-01-01", "isOffDay": true, "name": "元旦"}`, detail(t, "2026-01-01"))
}

func TestRefreshReplacesTheWholeYear(t *testing.T) {
	reset(t)
	fake.respond(func(path string) (int, string) {
		if path == "/2026.json" {
			return http.StatusOK, `{"days": [{"name": "元旦", "date": "2026-01-02", "isOffDay": true}]}`
		}
		return holidayCN(path)
	})
	require.NoError(t, refresher.OneYear(t.Context(), 2026))

	require.JSONEq(t, `{"date": "2026-01-02", "isOffDay": true, "name": "元旦"}`, detail(t, "2026-01-02"))
	// 调休上班的那个周日不在新数据里了，回到按周末判断
	require.JSONEq(t, `{"date": "2026-01-04", "isOffDay": true, "name": ""}`, detail(t, "2026-01-04"))
}

func TestMalformedSourceDataIsRejected(t *testing.T) {
	reset(t)
	fake.respond(func(string) (int, string) {
		return http.StatusOK, `{"days": [{"name": "元旦", "date": "2026-1-1", "isOffDay": true}]}`
	})
	require.ErrorContains(t, refresher.OneYear(t.Context(), 2026), "格式不对")
	require.JSONEq(t, `{"date": "2026-01-04", "isOffDay": false, "name": "元旦"}`, detail(t, "2026-01-04"))
}
