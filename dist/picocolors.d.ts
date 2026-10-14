/*!
 * Vendored from picocolors@1.1.1, ported to TypeScript.
 *
 * https://github.com/alexeyraspopov/picocolors
 *
 * ISC License
 *
 * Copyright (c) 2021-2024 Oleksii Raspopov, Kostiantyn Denysov, Anton Verinov
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
export type Formatter = (input: string | number | null | undefined) => string;
export declare function createColors(enabled?: boolean): {
    isColorSupported: boolean;
    reset: Formatter;
    bold: Formatter;
    dim: Formatter;
    italic: Formatter;
    underline: Formatter;
    inverse: Formatter;
    hidden: Formatter;
    strikethrough: Formatter;
    black: Formatter;
    red: Formatter;
    green: Formatter;
    yellow: Formatter;
    blue: Formatter;
    magenta: Formatter;
    cyan: Formatter;
    white: Formatter;
    gray: Formatter;
    bgBlack: Formatter;
    bgRed: Formatter;
    bgGreen: Formatter;
    bgYellow: Formatter;
    bgBlue: Formatter;
    bgMagenta: Formatter;
    bgCyan: Formatter;
    bgWhite: Formatter;
    blackBright: Formatter;
    redBright: Formatter;
    greenBright: Formatter;
    yellowBright: Formatter;
    blueBright: Formatter;
    magentaBright: Formatter;
    cyanBright: Formatter;
    whiteBright: Formatter;
    bgBlackBright: Formatter;
    bgRedBright: Formatter;
    bgGreenBright: Formatter;
    bgYellowBright: Formatter;
    bgBlueBright: Formatter;
    bgMagentaBright: Formatter;
    bgCyanBright: Formatter;
    bgWhiteBright: Formatter;
};
export type Colors = ReturnType<typeof createColors>;
declare const _default: {
    isColorSupported: boolean;
    reset: Formatter;
    bold: Formatter;
    dim: Formatter;
    italic: Formatter;
    underline: Formatter;
    inverse: Formatter;
    hidden: Formatter;
    strikethrough: Formatter;
    black: Formatter;
    red: Formatter;
    green: Formatter;
    yellow: Formatter;
    blue: Formatter;
    magenta: Formatter;
    cyan: Formatter;
    white: Formatter;
    gray: Formatter;
    bgBlack: Formatter;
    bgRed: Formatter;
    bgGreen: Formatter;
    bgYellow: Formatter;
    bgBlue: Formatter;
    bgMagenta: Formatter;
    bgCyan: Formatter;
    bgWhite: Formatter;
    blackBright: Formatter;
    redBright: Formatter;
    greenBright: Formatter;
    yellowBright: Formatter;
    blueBright: Formatter;
    magentaBright: Formatter;
    cyanBright: Formatter;
    whiteBright: Formatter;
    bgBlackBright: Formatter;
    bgRedBright: Formatter;
    bgGreenBright: Formatter;
    bgYellowBright: Formatter;
    bgBlueBright: Formatter;
    bgMagentaBright: Formatter;
    bgCyanBright: Formatter;
    bgWhiteBright: Formatter;
};
export default _default;
