package keylock

import (
	"context"
	"errors"
	"testing"
	"testing/synctest"
)

func TestLockerWaitersAndCancellation(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		locks := New()
		unlock, err := locks.Acquire(context.Background(), "user")
		if err != nil {
			t.Fatal(err)
		}

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		canceled := acquireAsync(locks, ctx, "user")
		synctest.Wait()
		waiting := acquireAsync(locks, context.Background(), "user")
		synctest.Wait()
		cancel()
		result := <-canceled
		if !errors.Is(result.err, context.Canceled) || result.unlock != nil {
			t.Fatalf("取消等待 = %+v，期望返回取消错误且不持有锁", result)
		}

		// 一个等待者取消后，其他等待者仍须与原持有者共用同一把锁。
		select {
		case result := <-waiting:
			t.Fatalf("持有者未释放，同 key 的等待者已经返回：%+v", result)
		default:
		}
		unlock()
		result = <-waiting
		if result.err != nil {
			t.Fatal(result.err)
		}

		// 锁已交给等待者，新请求必须继续排队，不能因旧持有者离开而另建锁。
		next := acquireAsync(locks, context.Background(), "user")
		synctest.Wait()
		select {
		case result := <-next:
			t.Fatalf("交接后的锁未释放，新请求已经返回：%+v", result)
		default:
		}
		result.unlock()
		result = <-next
		if result.err != nil {
			t.Fatal(result.err)
		}
		result.unlock()
		synctest.Wait()
		if len(locks.entries) != 0 {
			t.Fatal("所有操作结束后仍保留锁条目")
		}
	})
}

func TestLockerDistinctKeys(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		locks := New()
		unlock, err := locks.Acquire(context.Background(), "user:1")
		if err != nil {
			t.Fatal(err)
		}
		other := acquireAsync(locks, context.Background(), "order:1")
		synctest.Wait()
		select {
		case result := <-other:
			if result.err != nil {
				t.Fatal(result.err)
			}
			result.unlock()
		default:
			t.Error("不同 key 的操作互相阻塞")
		}
		unlock()
	})
}

func TestLockerAlreadyCanceled(t *testing.T) {
	locks := New()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	unlock, err := locks.Acquire(ctx, "")
	if !errors.Is(err, context.Canceled) || unlock != nil {
		t.Fatalf("已取消的请求 = %v，期望不取得锁", err)
	}
	if len(locks.entries) != 0 {
		t.Fatal("已取消的请求遗留了锁条目")
	}
	unlock, err = locks.Acquire(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	unlock()
	if len(locks.entries) != 0 {
		t.Fatal("成功释放后仍保留锁条目")
	}
}

type acquisition struct {
	unlock func()
	err    error
}

func acquireAsync(locks *Locker, ctx context.Context, key string) <-chan acquisition {
	result := make(chan acquisition, 1)
	go func() {
		unlock, err := locks.Acquire(ctx, key)
		result <- acquisition{unlock: unlock, err: err}
	}()
	return result
}
