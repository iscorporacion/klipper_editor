import type { StringStream, StreamParser } from "@codemirror/language";

export type GcodeState = {
  klipperMacro: boolean;
};

export function tokenGcode(stream: StringStream, state: GcodeState, zeroPos = 0) {
  const ch = stream.peek();

  if (stream.pos === zeroPos && state.klipperMacro) {
    state.klipperMacro = false;
  }

  if (stream.pos > zeroPos && state.klipperMacro) {
    stream.eatSpace();
    if (stream.match(/^{/)) return "tag";
    if (stream.match(/^"[^{]+"/) || stream.match(/^'[^{]+'/)) return "string";
    if (stream.match(/^[-+]?[0-9]*\.?[0-9]+/)) return "number";
    if (stream.match(/^[A-Za-z\d_]+/)) return "propertyName";
    if (zeroPos === 0 && stream.match(/^{[^%]+}/)) return "variableName";
  }

  if (ch === ";") {
    stream.skipToEnd();
    return "comment";
  }

  const isCommandStart = stream.pos === zeroPos;

  if (isCommandStart && stream.match(/_?[GMgm][\d.]+/)) return "namespace";
  if (stream.string.substring(zeroPos).toLowerCase().startsWith("m117")) {
    stream.skipToEnd();
    return "string";
  }
  if (stream.pos > zeroPos && stream.match(/[EPXYZIJ]-?([\d]*\.[\d]+|[\d]+)?/i)) return "className";
  if (stream.pos > zeroPos && stream.match(/[Ff]-?([\d]*\.[\d]+|[\d]+)?/)) return "string";
  if (stream.pos > zeroPos && stream.match(/[TtSs]-?([\d]*\.[\d]+|[\d]+)?/)) return "atom";
  if (zeroPos === 0 && stream.pos > zeroPos && stream.match(/^{[^%]+}/)) return "propertyName";

  if (isCommandStart && stream.match(/^\s*[A-Z_\d]+/)) {
    state.klipperMacro = true;
    return "name";
  }

  stream.next();
  return null;
}

export const gcodeParser: StreamParser<GcodeState> = {
  token(stream: StringStream, state: GcodeState) {
    return tokenGcode(stream, state);
  },
  startState() {
    return {
      klipperMacro: false
    };
  },
  languageData: {
    commentTokens: { line: ";" }
  }
};
