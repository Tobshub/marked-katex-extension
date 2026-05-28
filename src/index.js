import katex from 'katex';

const optionalSpace = String.raw`\s*`;
const afterKatex = String.raw`(?=[\s?!\.,:？！。，：)\]]|$)`;

const latexInlineOpen = '\\(';
const latexInlineClose = '\\)';
const latexDisplayOpen = '\\[';
const latexDisplayClose = '\\]';
const latexDollarDisplayOpen = '\\$$';
const latexDollarDisplayClose = '\\$$';

function displayContent() {
  return String.raw`(?:\\.|[^\\\n])+?`;
}

function blockContent() {
  return String.raw`(?:\\[^]|[^\\])+?`;
}

function inlineMathContent(endChar) {
  const escapedEnd = endChar.replace(/[$^\\[\]]/g, '\\$&');
  return String.raw`(?:\\.|[^\\\n])*?(?:\\.|[^\\\n${escapedEnd}])`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createInlineRules(nonStandard) {
  const after = nonStandard ? '' : afterKatex;
  const sp = optionalSpace;

  return [
    { re: new RegExp(`^(\\$\\$)(?!\\$)${sp}(${displayContent()})${sp}\\$\\$(?!\\$)${after}`), displayMode: true },
    { re: new RegExp(`^(\\$(?!\\$))${sp}(${inlineMathContent('$')})${sp}\\$${after}`), displayMode: false },
    { re: new RegExp(`^(${escapeRegex(latexInlineOpen)})${sp}(${displayContent()})${sp}${escapeRegex(latexInlineClose)}${after}`), displayMode: false },
    { re: new RegExp(`^(\\()${sp}(?!\\s*\\$)(${inlineMathContent(')')})${sp}\\)${after}`), displayMode: false },
    { re: new RegExp(`^(\\[)${sp}(?!\\s*\\$)(${displayContent()})${sp}\\](?!\\()${after}`), displayMode: true },
  ];
}

function createBlockRules() {
  const sp = optionalSpace;

  return [
    { re: new RegExp(`^(\\$\\$)(?!\\$)${sp}?\n(${blockContent()})\n\\1(?:\n|$)`), displayMode: true },
    { re: new RegExp(`^(\\$)(?!\\$)\n(${blockContent()})\n\\1(?:\n|$)`), displayMode: false },
    { re: new RegExp(`^(${escapeRegex(latexDisplayOpen)})${sp}?\n(${blockContent()})\n${escapeRegex(latexDisplayClose)}(?:\n|$)`), displayMode: true },
    { re: new RegExp(`^(${escapeRegex(latexDollarDisplayOpen)})(?!\\$)${sp}?\n(${blockContent()})\n\\$\\$(?!\\$)(?:\n|$)`), displayMode: true },
    { re: new RegExp(`^(${escapeRegex(latexDollarDisplayOpen)})(?!\\$)${sp}?\n(${blockContent()})\n${escapeRegex(latexDollarDisplayClose)}(?:\n|$)`), displayMode: true },
  ];
}

function isEscapedBackslash(src, index) {
  return index > 0 && src.charAt(index - 1) === '\\';
}

function isLatexInlineDelimiterStart(src, index) {
  return !isEscapedBackslash(src, index) && src.startsWith(latexInlineOpen, index);
}

function findDelimiterIndexes(src) {
  const indexes = new Set();

  for (const ch of '$([') {
    let search = 0;
    while (search < src.length) {
      const index = src.indexOf(ch, search);
      if (index === -1) {
        break;
      }
      indexes.add(index);
      search = index + 1;
    }
  }

  let search = 0;
  while (search < src.length) {
    const index = src.indexOf('\\', search);
    if (index === -1) {
      break;
    }
    if (isLatexInlineDelimiterStart(src, index)) {
      indexes.add(index);
    }
    search = index + 1;
  }

  return [...indexes].sort((a, b) => a - b);
}

function canStartAt(src, index, nonStandard) {
  if (nonStandard) {
    return true;
  }
  if (index === 0) {
    return true;
  }
  return /[\s(\[]/.test(src.charAt(index - 1));
}

function shouldSkipDelimiter(possibleKatex) {
  return (
    (possibleKatex.startsWith('(') && /^\(\s*\$/.test(possibleKatex))
    || (possibleKatex.startsWith('[') && /^\[\s*\$/.test(possibleKatex))
  );
}

function matchRules(src, rules) {
  for (const { re, displayMode } of rules) {
    const match = src.match(re);
    if (match) {
      return {
        raw: match[0],
        text: match[2].trim(),
        displayMode,
      };
    }
  }
}

function matchInlineKatex(src, nonStandard) {
  const match = matchRules(src, createInlineRules(nonStandard));
  if (match) {
    return {
      type: 'inlineKatex',
      ...match,
    };
  }
}

function matchBlockKatex(src) {
  const match = matchRules(src, createBlockRules());
  if (match) {
    return {
      type: 'blockKatex',
      ...match,
    };
  }
}

export default function(options = {}) {
  return {
    extensions: [
      inlineKatex(options, createRenderer(options, false)),
      blockKatex(options, createRenderer(options, true)),
    ],
  };
}

function createRenderer(options, newlineAfter) {
  return (token) => katex.renderToString(token.text, { ...options, displayMode: token.displayMode }) + (newlineAfter ? '\n' : '');
}

function inlineKatex(options, renderer) {
  const nonStandard = options && options.nonStandard;
  const rules = createInlineRules(nonStandard);
  return {
    name: 'inlineKatex',
    level: 'inline',
    start(src) {
      let indexSrc = src;

      while (indexSrc) {
        const indexes = findDelimiterIndexes(indexSrc);
        if (indexes.length === 0) {
          return;
        }

        const index = indexes[0];
        const ch = indexSrc.charAt(index);

        if (canStartAt(indexSrc, index, nonStandard)) {
          const possibleKatex = indexSrc.substring(index);

          if (shouldSkipDelimiter(possibleKatex)) {
            indexSrc = indexSrc.substring(index + 1);
            continue;
          }

          if (rules.some(({ re }) => possibleKatex.match(re))) {
            return index;
          }
        }

        indexSrc = indexSrc.substring(index + 1);
        if (ch === '$') {
          indexSrc = indexSrc.replace(/^\$+/, '');
        } else if (ch === '\\') {
          indexSrc = indexSrc.replace(/^\\\(/, '');
        }
      }
    },
    tokenizer(src, tokens) {
      return matchInlineKatex(src, nonStandard);
    },
    renderer,
  };
}

function blockKatex(options, renderer) {
  return {
    name: 'blockKatex',
    level: 'block',
    tokenizer(src, tokens) {
      return matchBlockKatex(src);
    },
    renderer,
  };
}
