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
    map: <Input, ReturnType>(iterable: Iterable<Input>, mapperFunction: (input: Input, index: number) => PromiseLike<ReturnType> | ReturnType) => Promise<ReturnType[]>;
    /**
     * Warning: Avoid calling the same `limit` function inside a function that
     * is already limited by it. This can create a deadlock where inner tasks
     * never run. Use a separate limiter for inner tasks.
     *
     * @returns The promise returned by calling `fn(...arguments)`.
     */
    <Arguments extends unknown[], ReturnType>(function_: (...arguments_: Arguments) => PromiseLike<ReturnType> | ReturnType, ...arguments_: Arguments): Promise<ReturnType>;
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
/**
 * Run multiple promise-returning & async functions with limited concurrency.
 */
export default function pLimit(options: number | Options): LimitFunction;
/**
 * Returns a function with limited concurrency.
 */
export declare function limitFunction<Arguments extends unknown[], ReturnType>(function_: (...arguments_: Arguments) => PromiseLike<ReturnType>, options: Options): ((...arguments_: Arguments) => Promise<ReturnType>) & Pick<LimitFunction, 'clearQueue'>;
