import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';

type SourceLocation = {
  file: string;
  line: number;
  column: number;
};

function extractSourceLocation(
  error: Error,
  root: string,
): SourceLocation | null {
  const stack = error.stack ?? '';

  for (const stackLine of stack.split('\n')) {
    // Supports:
    // at eval (/project/src/index.ht.js:6:20)
    // at /project/src/index.ht.js:6:20
    // at eval (file:///project/src/index.ht.js:6:20)
    const match = stackLine.match(
      /(?:\()?((?:file:\/\/\/)?[^()\n]+?):(\d+):(\d+)\)?\s*$/,
    );

    if (!match) continue;

    let file = match[1].trim();

    // Remove the leading stack-frame text.
    file = file.replace(/^at\s+(?:.+?\s+\()?/, '');

    // Vite module IDs can contain cache-busting query strings.
    file = file.split('?')[0].split('#')[0];

    try {
      if (file.startsWith('file://')) {
        file = fileURLToPath(file);
      } else {
        file = decodeURIComponent(file);
      }
    } catch {
      continue;
    }

    if (!path.isAbsolute(file)) continue;
    if (file.includes(`${path.sep}node_modules${path.sep}`)) continue;

    const relativeFile = path.relative(root, file);

    if (
      relativeFile === '..' ||
      relativeFile.startsWith(`..${path.sep}`)
    ) {
      continue;
    }

    if (!fs.existsSync(file)) continue;

    return {
      file,
      line: Number(match[2]),
      column: Number(match[3]),
    };
  }

  return null;
}

function refineReferenceErrorLocation(
  error: Error,
  location: SourceLocation,
): SourceLocation {
  const match = error.message.match(
    /^([A-Za-z_$][A-Za-z0-9_$]*) is not defined$/,
  );

  if (!match || !fs.existsSync(location.file)) {
    return location;
  }

  const identifier = match[1];
  const lines = fs.readFileSync(location.file, 'utf8').split(/\r?\n/);

  const reportedIndex = location.line - 1;
  const start = Math.max(0, reportedIndex - 2);
  const end = Math.min(lines.length - 1, reportedIndex + 3);

  const identifierPattern = new RegExp(
    `\\b${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
  );

  let bestMatch:
    | {
        line: number;
        column: number;
        distance: number;
      }
    | undefined;

  for (let index = start; index <= end; index++) {
    const column = lines[index].search(identifierPattern);

    if (column === -1) continue;

    const distance = Math.abs(index - reportedIndex);

    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = {
        line: index + 1,
        column: column + 1,
        distance,
      };
    }
  }

  if (!bestMatch) {
    return location;
  }

  return {
    ...location,
    line: bestMatch.line,
    column: bestMatch.column,
  };
}

function createSourceFrame(
  location: SourceLocation,
  contextLines = 3,
): string | null {
  if (!fs.existsSync(location.file)) return null;

  const lines = fs.readFileSync(location.file, 'utf8').split(/\r?\n/);

  const errorIndex = location.line - 1;
  const start = Math.max(0, errorIndex - contextLines);
  const end = Math.min(lines.length - 1, errorIndex + contextLines);
  const lineNumberWidth = String(end + 1).length;

  const output: string[] = [];

  for (let index = start; index <= end; index++) {
    const number = String(index + 1).padStart(lineNumberWidth, ' ');
    const isErrorLine = index === errorIndex;
    const marker = isErrorLine ? pc.red('>') : ' ';

    const line = lines[index];

    output.push(
      `${marker} ${pc.dim(number)} ${pc.dim('│')} ${line}`,
    );

    if (isErrorLine) {
      const indentation = ' '.repeat(Math.max(0, location.column - 1));

      output.push(
        `  ${' '.repeat(lineNumberWidth)} ${pc.dim('│')} ${indentation}${pc.red('^')}`,
      );
    }
  }

  return output.join('\n');
}

export function formatDevPageError(args: {
  error: unknown;
  root: string;
  phase: 'load' | 'reload';
  debug?: boolean;
}): string {
  const { root, phase, debug = false } = args;

  const error =
    args.error instanceof Error
      ? args.error
      : new Error(String(args.error));

    const extractedLocation = extractSourceLocation(error, root);

    const location = extractedLocation
      ? refineReferenceErrorLocation(error, extractedLocation)
      : null;

    const sourceFrame = location
      ? createSourceFrame(location)
      : null;

  const heading =
    phase === 'load' ? 'PAGE LOAD ERROR' : 'PAGE RELOAD ERROR';

  const fileLabel = location
    ? ` ${path.relative(root, location.file)}:${location.line}:${location.column}`
    : '';

  const separatorLength = Math.max(
    12,
    64 - heading.length - fileLabel.length,
  );

  const output = [
    '',
    pc.cyan(
      `── ${heading} ${'─'.repeat(separatorLength)}${fileLabel}`,
    ),
    '',
    `${pc.red(error.name + ':')} ${error.message}`,
  ];

  if (location && sourceFrame) {
    output.push('', path.relative(root, location.file), '', sourceFrame);
  }

  if (debug && error.stack) {
    output.push('', pc.dim(error.stack));
  }

  output.push(
    '',
    pc.yellow('Fix the error and save again.'),
    pc.dim('Watching for file changes...'),
    '',
  );

  return output.join('\n');
}