package holiday

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestNextDailyIsTheNext430InChina(t *testing.T) {
	at := func(day, hour, minute int) time.Time {
		return time.Date(2026, time.January, day, hour, minute, 0, 0, china)
	}
	for _, c := range []struct{ now, next time.Time }{
		{at(1, 0, 0), at(1, 4, 30)},
		{at(1, 4, 30), at(2, 4, 30)},
		{at(1, 23, 59), at(2, 4, 30)},
		// 服务器在 UTC：UTC 的 1 月 1 日 21:00 已是北京时间 1 月 2 日 5:00
		{time.Date(2026, time.January, 1, 21, 0, 0, 0, time.UTC), at(3, 4, 30)},
	} {
		require.True(t, c.next.Equal(nextDaily(c.now)), "%s 之后应是 %s，实际是 %s", c.now, c.next, nextDaily(c.now))
	}
}
