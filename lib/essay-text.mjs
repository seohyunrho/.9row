// Count Unicode code points consistently in the editor, question list and AI preview.
export function essayCharacterCount(text, includeSpaces = true) {
  return Array.from(includeSpaces ? text : text.replace(/\s/g, '')).length;
}
