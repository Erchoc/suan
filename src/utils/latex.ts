/** Converts a LaTeX expression into readable text. */
function convertLatexInner(s: string): string {
  return s
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\cdot/g, '·')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
    .replace(/\\sqrt\{([^}]+)\}/g, '√$1')
    .replace(/\^2/g, '²')
    .replace(/\^3/g, '³')
    .replace(/\\[a-zA-Z]+\{([^}]+)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, '')
    .trim();
}

/** Converts every $...$ and $$...$$ expression in text into readable text. */
export function stripLatex(text: string): string {
  if (!text) return text;
  return text
    .replace(/\$\$([^$]+)\$\$/g, (_, inner) => convertLatexInner(inner))
    .replace(/\$([^$\n]+)\$/g, (_, inner) => convertLatexInner(inner));
}
