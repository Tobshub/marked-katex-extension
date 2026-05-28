import katex from 'katex';

const optionalSpace = String.raw`\s*`;
const afterKatex = String.raw`(?=[\s?!\.,:？！。，：)\]]|$)`;

function inlineContent(endChar) {
  const escapedEnd = endChar.replace(/[$^\\[\]]/g, '\\$&');
  return String.raw`(?:\\.|[^\\\n])*?(?:\\.|[^\\\n${escapedEnd}])`;
}

function createInlineRules(nonStandard) {
  const after = nonStandard ? '' : afterKatex;
  const sp = optionalSpace;

  return [
    { re: new RegExp(`^(\\$\\$)${sp}(${inlineContent('$')})${sp}\\$\\$${after}`), displayMode: true },
    { re: new RegExp(`^(\\$(?!\\$))${sp}(${inlineContent('$')})${sp}\\$${after}`), displayMode: false },
    { re: new RegExp(`^(\\()${sp}(?!\\s*\\$)(${inlineContent(')')})${sp}\\)${after}`), displayMode: false },
    { re: new RegExp(`^(\\[)${sp}(?!\\s*\\$)(${inlineContent(']')})${sp}\\](?!\\()${after}`), displayMode: true },
  ];
}

const blockRule = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;

const delimiterStartChars = '$([';

function canStartAt(src, index, nonStandard) {
  return nonStandard || index === 0 || /[\s(\[]/.test(src.charAt(index - 1));
}

function matchInlineKatex(src, nonStandard) {
  const rules = createInlineRules(nonStandard);
  for (const { re, displayMode } of rules) {
    const match = src.match(re);
    if (match) {
      return {
        type: 'inlineKatex',
        raw: match[0],
        text: match[2].trim(),
        displayMode,
      };
    }
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
        let index = -1;

        for (const ch of delimiterStartChars) {
          const candidate = indexSrc.indexOf(ch);
          if (candidate !== -1 && (index === -1 || candidate < index)) {
            index = candidate;
          }
        }

        if (index === -1) {
          return;
        }

        if (canStartAt(indexSrc, index, nonStandard)) {
          const possibleKatex = indexSrc.substring(index);

          if (
            (possibleKatex.startsWith('(') && /^\(\s*\$/.test(possibleKatex))
            || (possibleKatex.startsWith('[') && /^\[\s*\$/.test(possibleKatex))
          ) {
            indexSrc = indexSrc.substring(index + 1);
            continue;
          }

          if (rules.some(({ re }) => possibleKatex.match(re))) {
            return index;
          }
        }

        const ch = indexSrc.charAt(index);
        indexSrc = indexSrc.substring(index + 1);
        if (ch === '$') {
          indexSrc = indexSrc.replace(/^\$+/, '');
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
      const match = src.match(blockRule);
      if (match) {
        return {
          type: 'blockKatex',
          raw: match[0],
          text: match[2].trim(),
          displayMode: match[1].length === 2,
        };
      }
    },
    renderer,
  };
}
