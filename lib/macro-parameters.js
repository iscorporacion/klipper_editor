/**
 * @typedef {{
 *   name: string,
 *   required: boolean,
 *   kind: "text" | "number" | "boolean",
 *   defaultValue?: string,
 *   defaultExpression?: string
 * }} MacroParameter
 */

function firstDefaultArgument(source, start) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") {
      if (depth === 0) return source.slice(start, index).trim();
      depth -= 1;
    } else if (character === "," && depth === 0) {
      return source.slice(start, index).trim();
    }
  }
  return "";
}

function literalDefault(expression) {
  const trimmed = expression.trim();
  const quoted = trimmed.match(/^(['"])([\s\S]*)\1$/);
  if (quoted) return quoted[2];
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return trimmed;
  if (/^(?:true|false)$/i.test(trimmed)) return trimmed.toLowerCase();
  return undefined;
}

/** @param {string[]} lines @returns {MacroParameter[]} */
export function getMacroParameters(lines) {
  const source = lines
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.replace(/\s+#.*$/, ""))
    .join("\n");
  const names = new Set();
  for (const match of source.matchAll(/\bparams\.([A-Za-z_][A-Za-z0-9_]*)\b/gi)) {
    names.add(match[1].toUpperCase());
  }

  return [...names].sort().map((name) => {
    const defaultMatcher = new RegExp(`params\\.${name}\\s*\\|\\s*default\\s*\\(`, "i");
    const defaultMatch = defaultMatcher.exec(source);
    const defaultExpression = defaultMatch
      ? firstDefaultArgument(source, defaultMatch.index + defaultMatch[0].length)
      : undefined;
    const defaultValue = defaultExpression ? literalDefault(defaultExpression) : undefined;
    const optionalCheck = new RegExp(`params\\.${name}\\s+is\\s+defined`, "i").test(source);
    const requiredCheck = new RegExp(`params\\.${name}\\s+is\\s+not\\s+defined`, "i").test(source);
    const requiredError = new RegExp(
      `params\\.${name}\\s+is\\s+not\\s+defined(?:(?!params\\.[A-Za-z_][A-Za-z0-9_]*\\s+is\\s+not\\s+defined)[\\s\\S]){0,300}?action_raise_error`,
      "i"
    ).test(source);
    const usages = [...source.matchAll(new RegExp(`params\\.${name}\\b([^\\n%}]*)`, "gi"))]
      .map((match) => match[0]);
    const numeric = usages.some((usage) => /\|\s*(?:int|float)\b/i.test(usage));
    const boolean = /^(?:true|false)$/i.test(defaultExpression ?? "") ||
      usages.some((usage) => /\|\s*lower\b[^\n%}]*(?:true|false)/i.test(usage));

    return {
      name,
      required: !defaultMatch && (requiredError || (!optionalCheck && !requiredCheck)),
      kind: boolean ? "boolean" : numeric ? "number" : "text",
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      ...(defaultExpression ? { defaultExpression } : {})
    };
  });
}
