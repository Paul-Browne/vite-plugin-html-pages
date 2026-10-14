/*!
 * Vendored from p-limit@7.3.3 and its only dependency yocto-queue@1.2.2,
 * ported to TypeScript.
 *
 * https://github.com/sindresorhus/p-limit
 * https://github.com/sindresorhus/yocto-queue
 *
 * MIT License
 *
 * Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

/*
 * yocto-queue
 *
 * How it works:
 * `this.#head` is an instance of `Node` which keeps track of its current value
 * and nests another instance of `Node` that keeps the value that comes after
 * it. When a value is provided to `.enqueue()`, the code needs to iterate
 * through `this.#head`, going deeper and deeper to find the last value.
 * However, iterating through every single item is slow. This problem is
 * solved by saving a reference to the last value as `this.#tail` so that it
 * can reference it to add a new value.
 */

class Node<T> {
  value: T;
  next: Node<T> | undefined;

  constructor(value: T) {
    this.value = value;
  }
}

class Queue<T> {
  #head: Node<T> | undefined;
  #tail: Node<T> | undefined;
  #size = 0;

  constructor() {
    this.clear();
  }

  enqueue(value: T): void {
    const node = new Node(value);

    if (this.#head) {
      this.#tail!.next = node;
      this.#tail = node;
    } else {
      this.#head = node;
      this.#tail = node;
    }

    this.#size++;
  }

  dequeue(): T | undefined {
    const current = this.#head;
    if (!current) {
      return;
    }

    this.#head = current.next;
    this.#size--;

    // Clean up tail reference when queue becomes empty
    if (!this.#head) {
      this.#tail = undefined;
    }

    return current.value;
  }

  peek(): T | undefined {
    return this.#head?.value;
  }

  clear(): void {
    this.#head = undefined;
    this.#tail = undefined;
    this.#size = 0;
  }

  get size(): number {
    return this.#size;
  }

  *[Symbol.iterator](): IterableIterator<T> {
    let current = this.#head;

    while (current) {
      yield current.value;
      current = current.next;
    }
  }

  *drain(): IterableIterator<T> {
    while (this.#head) {
      yield this.dequeue()!;
    }
  }
}

/*
 * p-limit
 */

export type LimitFunction = {
  /**
   * The number of promises that are currently running.
   */
  readonly activeCount: number;

  /**
   * The number of promises that are waiting to run (i.e. their internal `fn`
   * was not called yet).
   */
  readonly pendingCount: number;

  /**
   * Get or set the concurrency limit.
   */
  concurrency: number;

  /**
   * Discard pending promises that are waiting to run.
   *
   * Note: This does not cancel promises that are already running.
   *
   * When `rejectOnClear` is enabled, pending promises are rejected with an
   * `AbortError`.
   */
  clearQueue: () => void;

  /**
   * Process an iterable of inputs with limited concurrency.
   *
   * The mapper function receives the item value and its index.
   *
   * If the iterable throws during iteration, the returned promise rejects
   * with that error. Mapper functions that were already scheduled still run,
   * and their results are discarded.
   */
  map: <Input, ReturnType>(
    iterable: Iterable<Input>,
    mapperFunction: (
      input: Input,
      index: number,
    ) => PromiseLike<ReturnType> | ReturnType,
  ) => Promise<ReturnType[]>;

  /**
   * Warning: Avoid calling the same `limit` function inside a function that
   * is already limited by it. This can create a deadlock where inner tasks
   * never run. Use a separate limiter for inner tasks.
   *
   * @returns The promise returned by calling `fn(...arguments)`.
   */
  <Arguments extends unknown[], ReturnType>(
    function_: (
      ...arguments_: Arguments
    ) => PromiseLike<ReturnType> | ReturnType,
    ...arguments_: Arguments
  ): Promise<ReturnType>;
};

export type Options = {
  /**
   * Concurrency limit.
   *
   * Minimum: `1`.
   */
  readonly concurrency: number;

  /**
   * Reject pending promises with an `AbortError` when `clearQueue()` is
   * called.
   *
   * Default: `false`.
   */
  readonly rejectOnClear?: boolean;
};

type AnyFunction = (...arguments_: any[]) => unknown;

type QueueItem = {
  run: () => void;
  reject: (reason?: unknown) => void;
};

/**
 * Run multiple promise-returning & async functions with limited concurrency.
 */
export default function pLimit(options: number | Options): LimitFunction {
  let concurrency: number;
  let rejectOnClear = false;

  if (typeof options === 'object') {
    ({ concurrency, rejectOnClear = false } = options);
  } else {
    concurrency = options;
  }

  validateConcurrency(concurrency);

  if (typeof rejectOnClear !== 'boolean') {
    throw new TypeError('Expected `rejectOnClear` to be a boolean');
  }

  const queue = new Queue<QueueItem>();
  let activeCount = 0;

  const resumeNext = () => {
    // Process the next queued function if we're under the concurrency limit
    if (activeCount < concurrency && queue.size > 0) {
      activeCount++;
      queue.dequeue()!.run();
    }
  };

  const next = () => {
    activeCount--;
    resumeNext();
  };

  const run = async (
    function_: AnyFunction,
    resolve: (value: unknown) => void,
    arguments_: unknown[],
  ) => {
    // Execute the function and capture the result promise
    const result = (async () => function_(...arguments_))();

    // Resolve immediately with the promise (don't wait for completion)
    resolve(result);

    // Wait for the function to complete (success or failure)
    // We catch errors here to prevent unhandled rejections,
    // but the original promise rejection is preserved for the caller
    try {
      await result;
    } catch {}

    // Decrement active count and process next queued function
    next();
  };

  const enqueue = (
    function_: AnyFunction,
    resolve: (value: unknown) => void,
    reject: (reason?: unknown) => void,
    arguments_: unknown[],
  ) => {
    // Queue the internal resolve function instead of the run function
    // to preserve the asynchronous execution context.
    new Promise<void>((internalResolve) => {
      queue.enqueue({ run: () => internalResolve(), reject });
    }).then(() => run(function_, resolve, arguments_));

    // Start processing immediately if we haven't reached the concurrency limit
    if (activeCount < concurrency) {
      resumeNext();
    }
  };

  const generator = (function_: AnyFunction, ...arguments_: unknown[]) =>
    new Promise((resolve, reject) => {
      enqueue(function_, resolve, reject, arguments_);
    });

  Object.defineProperties(generator, {
    activeCount: {
      get: () => activeCount,
    },
    pendingCount: {
      get: () => queue.size,
    },
    clearQueue: {
      value() {
        if (!rejectOnClear) {
          queue.clear();
          return;
        }

        const abortError = AbortSignal.abort().reason;

        while (queue.size > 0) {
          queue.dequeue()!.reject(abortError);
        }
      },
    },
    concurrency: {
      get: () => concurrency,

      set(newConcurrency: number) {
        validateConcurrency(newConcurrency);
        concurrency = newConcurrency;

        queueMicrotask(() => {
          while (activeCount < concurrency && queue.size > 0) {
            resumeNext();
          }
        });
      },
    },
    map: {
      async value(iterable: Iterable<unknown>, function_: AnyFunction) {
        const promises: Promise<unknown>[] = [];

        try {
          Array.from(iterable, (value, index) => {
            const promise = generator(function_, value, index);
            promises.push(promise);
            return promise;
          });
        } catch (error) {
          // The iterable threw, so `Promise.all` never observes the already
          // scheduled promises. Observe them here to avoid unhandled
          // rejections.
          for (const promise of promises) {
            promise.catch(() => {});
          }

          throw error;
        }

        return Promise.all(promises);
      },
    },
  });

  return generator as LimitFunction;
}

/**
 * Returns a function with limited concurrency.
 */
export function limitFunction<Arguments extends unknown[], ReturnType>(
  function_: (...arguments_: Arguments) => PromiseLike<ReturnType>,
  options: Options,
): ((...arguments_: Arguments) => Promise<ReturnType>) &
  Pick<LimitFunction, 'clearQueue'> {
  const limit = pLimit(options);

  const limitedFunction = (...arguments_: Arguments) =>
    limit(() => function_(...arguments_));
  Object.defineProperty(limitedFunction, 'clearQueue', {
    value: limit.clearQueue,
  });

  return limitedFunction as ((
    ...arguments_: Arguments
  ) => Promise<ReturnType>) &
    Pick<LimitFunction, 'clearQueue'>;
}

function validateConcurrency(
  concurrency: unknown,
): asserts concurrency is number {
  if (
    !(
      (Number.isInteger(concurrency) ||
        concurrency === Number.POSITIVE_INFINITY) &&
      (concurrency as number) > 0
    )
  ) {
    throw new TypeError('Expected `concurrency` to be a number from 1 and up');
  }
}
