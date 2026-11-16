export type CommandPaletteGroup = 'navigation' | 'playback' | 'audio' | 'appearance';

export interface CommandPaletteEntry {
  id: string;
  group: CommandPaletteGroup;
  title: string;
  subtitle?: string;
  keywords: string[];
  shortcut?: string;
  badge?: string;
  run: () => void;
}

export const COMMAND_PALETTE_GROUP_ORDER: CommandPaletteGroup[] = [
  'navigation',
  'playback',
  'audio',
  'appearance',
];

function scoreEntry(entry: CommandPaletteEntry, tokens: string[], rawQuery: string): number {
  const title = entry.title.toLowerCase();
  const subtitle = entry.subtitle?.toLowerCase() ?? '';
  const keywords = entry.keywords.join(' ').toLowerCase();
  const haystack = `${title} ${subtitle} ${keywords}`;

  for (const token of tokens) {
    if (!haystack.includes(token)) {
      return -1;
    }
  }

  let score = 0;
  if (title === rawQuery) score += 120;
  else if (title.startsWith(rawQuery)) score += 80;
  else if (title.includes(rawQuery)) score += 45;

  if (subtitle.includes(rawQuery)) score += 20;
  if (keywords.includes(rawQuery)) score += 15;

  for (const token of tokens) {
    if (title.startsWith(token)) score += 18;
    else if (title.includes(token)) score += 10;
    else if (keywords.includes(token)) score += 5;
  }

  return score;
}

export function filterCommandItems<T extends CommandPaletteEntry>(items: T[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return items;

  const scored: Array<{ item: T; score: number; index: number }> = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const score = scoreEntry(item, tokens, normalized);
    if (score >= 0) {
      scored.push({ item, score, index });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  return scored.map((entry) => entry.item);
}

export function groupCommandItems<T extends CommandPaletteEntry>(
  items: T[],
): Array<{ group: CommandPaletteGroup; items: T[] }> {
  const byGroup = new Map<CommandPaletteGroup, T[]>();
  for (const item of items) {
    const bucket = byGroup.get(item.group);
    if (bucket) bucket.push(item);
    else byGroup.set(item.group, [item]);
  }

  const result: Array<{ group: CommandPaletteGroup; items: T[] }> = [];
  for (const group of COMMAND_PALETTE_GROUP_ORDER) {
    const groupItems = byGroup.get(group);
    if (groupItems && groupItems.length > 0) {
      result.push({ group, items: groupItems });
    }
  }
  return result;
}
