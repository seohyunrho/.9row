const compact = value => String(value || '').normalize('NFKC').replace(/\s+/g, '');
const center = line => line.x + line.width / 2;
const inBand = (line, top, bottom) => line.y + line.height / 2 > top && line.y + line.height / 2 < bottom;
const ordered = lines => [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
const uniqueRows = values => values.sort((a, b) => a - b).filter((value, index, all) => index === 0 || value - all[index - 1] > 4);

/** Ruled recruitment tables. No company names, job vocabulary, or invented cell contents. */
export function recruitmentTables(layouts, body) {
  const words = compact(body), tables = [];
  for (const image of Array.isArray(layouts) ? layouts : []) {
    if (!Array.isArray(image?.lines) || !Array.isArray(image?.rules)) continue;
    const lines = image.lines.filter(line => typeof line?.text === 'string' && words.includes(compact(line.text)));
    const rules = image.rules.filter(rule => ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rule?.[key]) && rule[key] >= 0));
    const headers = ordered(lines.filter(line => /^(?:모집직무|모집분야|모집직종)$/.test(compact(line.text))));
    for (let index = 0; index < headers.length; index++) {
      const heading = headers[index];
      const sameHeader = lines.filter(line => Math.abs(line.y - heading.y) < Math.max(line.height, heading.height));
      const conditions = sameHeader.find(line => /필수.*우대|자격.*우대/.test(compact(line.text)));
      const major = sameHeader.find(line => compact(line.text) === '전공');
      if (!conditions || !major || center(heading) >= center(major) || center(major) >= center(conditions)) continue;
      const top = heading.y + heading.height;
      const next = headers[index + 1]?.y ?? image.height;
      const horizontal = rules.filter(rule => rule.height <= 3 && rule.width > image.width * 0.18 && rule.y > top && rule.y < next);
      const vertical = rules.filter(rule => rule.width <= 3 && rule.height >= 60 && rule.y < next && rule.y + rule.height > top);
      const boundary = (x, side) => {
        const choices = vertical.filter(rule => side === 'left' ? rule.x < x : rule.x > x).map(rule => rule.x);
        return choices.length ? (side === 'left' ? Math.max(...choices) : Math.min(...choices)) : null;
      };
      const roleLeft = boundary(center(heading), 'left'), roleRight = boundary(center(heading), 'right');
      const majorLeft = boundary(center(major), 'left'), majorRight = boundary(center(major), 'right');
      const conditionLeft = boundary(center(conditions), 'left');
      if ([roleLeft, roleRight, majorLeft, majorRight, conditionLeft].some(value => value === null)) continue;
      const edges = uniqueRows([top, ...horizontal.filter(rule => rule.x < center(heading) && rule.x + rule.width > center(heading)).map(rule => rule.y)]);
      if (edges.length < 2) continue;
      const bottom = edges.at(-1);
      const rows = [];
      for (let edge = 0; edge < edges.length - 1; edge++) {
        const start = edges[edge], end = edges[edge + 1];
        if (end - start < 25 || end - start > 650) continue;
        const rowLines = ordered(lines.filter(line => inBand(line, start, end)));
        const column = (left, right) => rowLines.filter(line => line.x >= left - 3 && line.x + line.width <= right + 3);
        const roleLines = column(roleLeft, roleRight);
        if (!roleLines.length) continue;
        rows.push({ roleLines, conditions: column(conditionLeft, image.width), major: column(majorLeft, majorRight), top: start, bottom: end });
      }
      tables.push({ image, lines, top, bottom, rows });
    }
  }
  return tables;
}

export function outsideTableLines(table) {
  return ordered(table.lines.filter(line => line.y + line.height < table.top));
}

export function cellParagraphs(lines) {
  const paragraphs = [];
  for (const line of ordered(lines)) {
    const text = line.text.trim();
    if (/^[-*•·▪■□○●◎▶▷◆◇※]/.test(text) || /^[\[【]/.test(text) || !paragraphs.length) paragraphs.push(text);
    else paragraphs[paragraphs.length - 1] += ` ${text}`;
  }
  return paragraphs;
}
