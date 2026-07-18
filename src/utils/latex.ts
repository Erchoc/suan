/** 把 LaTeX 内部表达式转换为可读文字 */
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

/** 把文本中所有 $...$ 和 $$...$$ 转换为可读文字 */
export function stripLatex(text: string): string {
  if (!text) return text;
  return text
    .replace(/\$\$([^$]+)\$\$/g, (_, inner) => convertLatexInner(inner))
    .replace(/\$([^$\n]+)\$/g, (_, inner) => convertLatexInner(inner));
}
