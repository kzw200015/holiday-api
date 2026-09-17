// Package keylock 提供进程内按 key 互斥、可取消等待的锁。
package keylock

import (
	"context"
	"sync"

	"golang.org/x/sync/semaphore"
)

// Locker 让同一个实例上的相同字符串 key 互斥，不同 key 可并行。
// 必须通过 New 创建，创建后不得复制，也不支持对同一 key 重入加锁。
type Locker struct {
	mu      sync.Mutex
	entries map[string]*entry
}

type entry struct {
	semaphore  *semaphore.Weighted
	references int
}

// New 创建独立的按 key 锁管理器。
func New() *Locker {
	return &Locker{entries: make(map[string]*entry)}
}

// Acquire 等待取得 key 的锁，等待期间可通过 ctx 取消。
// 成功后必须调用返回的释放函数一次，通常紧接着 defer；取消 ctx 不会释放已取得的锁。
// 锁条目在最后一个持有者或等待者离开后回收。
func (l *Locker) Acquire(ctx context.Context, key string) (func(), error) {
	l.mu.Lock()
	lock := l.entries[key]
	if lock == nil {
		lock = &entry{semaphore: semaphore.NewWeighted(1)}
		l.entries[key] = lock
	}
	lock.references++
	l.mu.Unlock()

	if err := lock.semaphore.Acquire(ctx, 1); err != nil {
		l.releaseReference(key, lock)
		return nil, err
	}
	return func() {
		lock.semaphore.Release(1)
		l.releaseReference(key, lock)
	}, nil
}

func (l *Locker) releaseReference(key string, lock *entry) {
	l.mu.Lock()
	defer l.mu.Unlock()
	lock.references--
	if lock.references == 0 {
		delete(l.entries, key)
	}
}
