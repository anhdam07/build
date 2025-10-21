import type { SubtitleBlock, MergeRule } from '../types';

const parseSrt = (srtContent: string): SubtitleBlock[] => {
  const blocks = srtContent.trim().replace(/\r/g, '').split(/\n\s*\n/);
  return blocks.map((block) => {
    const lines = block.trim().split('\n');
    if (lines.length < 3) return null;

    const index = parseInt(lines[0], 10);
    const timeMatch = lines[1]?.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3}) --> (\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!timeMatch) return null;

    const startTime = timeMatch[1].replace('.', ',');
    const endTime = timeMatch[2].replace('.', ',');
    const text = lines.slice(2).join('\n');
    return { index, startTime, endTime, text };
  }).filter((b): b is SubtitleBlock => b !== null && !isNaN(b.index));
};

const stringifySrt = (blocks: SubtitleBlock[]): string => {
  return blocks.map(block => 
    `${block.index}\n${block.startTime} --> ${block.endTime}\n${block.text}`
  ).join('\n\n') + '\n';
};

const getWordCount = (text: string): number => {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

const getRuleForLine = (lineNumber: number, rules: MergeRule[]) => {
    let startLine = 1;
    for (const rule of rules) {
        if (lineNumber >= startLine && lineNumber <= rule.processUpToLine) {
            return rule;
        }
        startLine = rule.processUpToLine + 1;
    }
    // For lines after the last rule, apply the last rule
    if (rules.length > 0 && lineNumber > rules[rules.length - 1].processUpToLine) {
        return rules[rules.length - 1];
    }
    return null;
}

export const mergeSubtitles = (
  subtitleFileText: string,
  rules: MergeRule[]
): string => {
  const originalBlocks = parseSrt(subtitleFileText);
  if (originalBlocks.length < 2) return subtitleFileText;

  const newBlocks: SubtitleBlock[] = [];
  let i = 0;
  while (i < originalBlocks.length) {
    let currentBlock = { ...originalBlocks[i] };
    const ruleForCurrent = getRuleForLine(currentBlock.index, rules);

    // Only attempt to merge if the block has a rule and is initially short.
    if (ruleForCurrent && getWordCount(currentBlock.text) < ruleForCurrent.mergeLinesWithFewerThan) {
      // Loop to look ahead for potential merges.
      while ((i + 1) < originalBlocks.length) {
        const nextBlock = originalBlocks[i + 1];
        const ruleForNext = getRuleForLine(nextBlock.index, rules);

        // Break if the next block is in a different rule section.
        if (ruleForCurrent !== ruleForNext) {
          break;
        }
        
        // Perform the merge.
        currentBlock.endTime = nextBlock.endTime;
        currentBlock.text = [currentBlock.text.trim(), nextBlock.text.trim()]
          .filter(Boolean)
          .join(' ');
        
        // We have consumed the next block, so advance the index.
        i++;
        
        // CRITICAL CHANGE: Check if the newly merged block is now "long enough".
        // If it is, stop trying to merge more lines into it.
        if (getWordCount(currentBlock.text) >= ruleForCurrent.mergeLinesWithFewerThan) {
          break;
        }
      }
    }
    
    newBlocks.push(currentBlock);
    i++;
  }
  
  const reindexedBlocks = newBlocks.map((block, index) => ({
      ...block,
      index: index + 1
  }));

  return stringifySrt(reindexedBlocks);
};