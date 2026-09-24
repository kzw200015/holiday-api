/* 写失败由调用方自己处理，这里只关心它什么时候结束 */
const ignore = () => {}

/**
 * 一类数据的写入：依次发出；读这类数据之前先等已经发出的写入落地（见 ADR-0006）。
 *
 * 依次发出，是因为同一字段先后两次改动、先记后删同一个词，乱序到达就会得到错的结果。读之前要等，是因为读回来的是
 * 服务端那一刻的样子：写入还没到，就会把本地刚改好的那份按回去。
 *
 * scope 是写入所属的范围（本站账号）：排队期间它变了，这次写入就不再发出，否则会带着新账号的令牌出去。
 */
export function createWrites(scope: () => unknown = () => undefined) {
  let tail: Promise<unknown> = Promise.resolve()
  let settled: Promise<unknown> = Promise.resolve()

  /** 记下一次已经发出、不必排队的写入（如阅读进度上报），读之前同样要等它落地。 */
  function track<T>(write: Promise<T>): Promise<T> {
    /* 一环接一环而不是 Promise.all：后者的结果数组一层套一层，整次会话每一次的结果都留在内存里。 */
    settled = settled.then(() => write.catch(ignore))
    return write
  }

  /** 等前一次写完（成败都算）再发这一次。 */
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const queuedIn = scope()
    const write = tail.then(() => {
      if (scope() !== queuedIn) {
        throw new Error("账号已经换了，这次改动不再提交")
      }
      return task()
    })
    tail = write.catch(ignore)
    return track(write)
  }

  return {
    track,
    serial,
    /** 此刻已经发出（含排着队）的写入全部落地，成败都算。 */
    settled: () => settled,
  }
}
