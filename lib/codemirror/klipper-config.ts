import type { StringStream, StreamParser } from "@codemirror/language";
import { tokenGcode, type GcodeState } from "./gcode";

type KlipperConfigState = GcodeState & {
  block: boolean;
  pair: boolean;
  wasIndented: boolean;
  gcode: boolean;
  gcodeZeroPos: number | null;
  jinja: boolean;
  jinjaHighlightNext: boolean;
  jinjaBraceStack: string[];
  jinjaPercentStack: string[];
};

const jinjaOperators = [
  "\\+",
  "-",
  "\\/\\/",
  "\\/",
  "%",
  "\\*\\*",
  "\\*",
  "\\(",
  "\\)",
  "==",
  "!=",
  ">=",
  ">",
  "<=",
  "<",
  "=",
  "\\|",
  "~",
  ","
];

const jinjaKeywords = [
  "elif",
  "else",
  "endif",
  "if",
  "endfor",
  "for",
  "loop\\.index",
  "loop\\.revindex",
  "loop\\.first",
  "loop\\.last",
  "loop\\.length",
  "loop\\.cycle",
  "loop\\.depth",
  "and",
  "or",
  "not",
  "in",
  "is",
  "endmacro",
  "macro",
  "endcall",
  "call",
  "endfilter",
  "filter",
  "endset",
  "set",
  "extends",
  "block",
  "endblock",
  "include",
  "import",
  "do"
];

const jinjaFiltersAndTests = [
  "abs",
  "attr",
  "batch",
  "capitalize",
  "center",
  "default",
  "dictsort",
  "escape",
  "filesizeformat",
  "first",
  "float",
  "forceescape",
  "format",
  "groupby",
  "indent",
  "int",
  "join",
  "last",
  "length",
  "list",
  "lower",
  "map",
  "max",
  "min",
  "pprint",
  "random",
  "reject",
  "rejectattr",
  "replace",
  "reverse",
  "round",
  "safe",
  "select",
  "selectattr",
  "slice",
  "sort",
  "string",
  "sum",
  "title",
  "trim",
  "truncate",
  "unique",
  "upper",
  "urlencode",
  "wordcount",
  "callable",
  "defined",
  "divisibleby",
  "equalto",
  "escaped",
  "even",
  "iterable",
  "mapping",
  "none",
  "number",
  "odd",
  "sameas",
  "sequence",
  "undefined",
  "range",
  "dict",
  "cycler",
  "joiner"
];

const reJinjaOperator = new RegExp(`^${jinjaOperators.join("|")}`);
const reJinjaKeyword = new RegExp(`^(${jinjaKeywords.join("|")})(?=\\s|}|\\)|,|\\|)`);
const reJinjaFilterOrTest = new RegExp(`^(${jinjaFiltersAndTests.join("|")})(?=\\(|}|,|\\||\\s)`);

function jinjaDone(state: KlipperConfigState) {
  return state.jinjaBraceStack.length === 0 && state.jinjaPercentStack.length === 0;
}

function jinjaToken(stream: StringStream, state: KlipperConfigState) {
  if (stream.match(/^%}/)) {
    state.jinjaPercentStack.pop();
    state.jinja = !jinjaDone(state);
    state.gcodeZeroPos = stream.pos;
    return "tag";
  }

  if (stream.match(/^}/)) {
    state.jinjaBraceStack.pop();
    state.jinja = !jinjaDone(state);
    state.gcodeZeroPos = stream.pos;
    return "tag";
  }

  if (stream.match(/^((?<![\\])['"])((?:.(?!(?<![\\])\1))*.?)\1/)) {
    state.jinjaHighlightNext = true;
    return "string";
  }

  if (state.jinjaHighlightNext && stream.match(reJinjaKeyword)) {
    state.jinjaHighlightNext = false;
    return "keyword";
  }

  if (state.jinjaHighlightNext && stream.match(reJinjaFilterOrTest)) {
    state.jinjaHighlightNext = false;
    return "updateOperator";
  }

  if (stream.match(reJinjaOperator)) {
    state.jinjaHighlightNext = true;
    return "number";
  }

  if (stream.match(/^true\b|^false\b/i)) {
    state.jinjaHighlightNext = false;
    return "atom";
  }

  if (stream.match(/^[-+]?[0-9]*\.?[0-9]+/)) {
    state.jinjaHighlightNext = false;
    return "number";
  }

  if (stream.eatSpace()) {
    state.jinjaHighlightNext = true;
    return null;
  }

  if (stream.match(/^[A-Za-z_][\w.]*/)) {
    state.jinjaHighlightNext = false;
    return "propertyName";
  }

  stream.next();
  state.jinjaHighlightNext = false;
  return "propertyName";
}

function startJinja(stream: StringStream, state: KlipperConfigState) {
  if (stream.match(/^\s*{[%#]?/)) {
    state.jinja = true;
    if (stream.current().includes("{%")) {
      state.jinjaPercentStack.push("{%");
    } else {
      state.jinjaBraceStack.push("{");
    }

    return "tag";
  }

  return null;
}

export const klipperConfigParser: StreamParser<KlipperConfigState> = {
  token(stream: StringStream, state: KlipperConfigState) {
    const ch = stream.peek();

    if (
      stream.match(/^\s+[#;]/) ||
      ((ch === "#" || ch === ";") && (stream.pos === 0 || /\s/.test(stream.string.charAt(stream.pos - 1))))
    ) {
      stream.skipToEnd();
      state.block = false;
      state.pair = false;
      return "comment";
    }

    if (ch !== "[" && stream.indentation() === 0 && stream.sol() && stream.match(/^[^:]+$/i)) {
      stream.skipToEnd();
      return null;
    }

    if (stream.indentation() === 0) {
      if (stream.pos === 0 && ch === "[") {
        state.block = true;
        stream.next();
        return "tag";
      }

      if (state.block) {
        if (!ch || ch === "]" || stream.eol()) {
          stream.next();
          state.block = false;
          return "tag";
        }

        if (stream.match(/^\s[^\]]+/)) return "className";
        if (stream.match(/^[^ \]]+/)) return "namespace";
      }

      if (state.gcode) {
        if (stream.sol() || stream.eol()) {
          state.gcode = false;
          state.gcodeZeroPos = null;
          return null;
        }

        if (state.gcodeZeroPos === null) {
          stream.eatSpace();
          state.gcodeZeroPos = stream.pos;
        }

        const jinjaStart = startJinja(stream, state);
        if (jinjaStart) return jinjaStart;
        if (state.jinja) return jinjaToken(stream, state);
        return tokenGcode(stream, state, state.gcodeZeroPos);
      }
    } else {
      state.wasIndented = true;

      if (state.gcode) {
        if (stream.sol()) {
          stream.eatSpace();
          state.gcodeZeroPos = stream.pos;
        }

        const jinjaStart = startJinja(stream, state);
        if (jinjaStart) return jinjaStart;
        if (state.jinja) return jinjaToken(stream, state);
        return tokenGcode(stream, state, state.gcodeZeroPos ?? stream.pos);
      }

      if (state.pair) {
        stream.eatSpace();
        if (ch !== ",") {
          if (stream.match(/^-?\d*\.?(?:\d+)?($|,)/)) return "number";
          if (stream.match(/^[^#;]+/)) return "string";
        }

        stream.next();
        return null;
      }
    }

    if (state.wasIndented && stream.indentation() === 0) {
      state.pair = false;
      state.gcode = false;
      state.wasIndented = false;
    }

    if (!state.pair && !state.gcode && stream.sol()) {
      if (stream.match(/^(?:[A-Za-z]*_?gcode|enable):/)) {
        state.gcode = true;
      } else {
        stream.match(/^.+?:\s*/);
        state.pair = !stream.eol();
      }

      return "atom";
    }

    if (state.pair) {
      if (ch === ":") {
        stream.next();
        stream.eatSpace();
        return null;
      }

      if (!ch || stream.eol()) {
        state.pair = false;
        return null;
      }

      if (stream.match(/^(-?\d*\.?(?:\d+)?(,|$|\s))+/)) {
        state.pair = false;
        return "number";
      }

      if (stream.match(/^[^#;]+/)) {
        state.pair = false;
        return "string";
      }
    }

    stream.next();
    return null;
  },
  startState() {
    return {
      block: false,
      pair: false,
      wasIndented: false,
      gcode: false,
      gcodeZeroPos: null,
      klipperMacro: false,
      jinja: false,
      jinjaHighlightNext: false,
      jinjaBraceStack: [],
      jinjaPercentStack: []
    };
  },
  languageData: {
    commentTokens: { line: "#" }
  }
};
