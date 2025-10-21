// FIX: Define and export all necessary types for the application.
// This resolves "file is not a module" errors in files that import from it.
export interface AnalysisResult {
  section: number;
  subtitleLine: number;
}

export interface MergeRule {
  processUpToLine: number;
  mergeLinesWithFewerThan: number;
}

export interface ImagePromptResult {
  subtitleIndex: number;
  subtitleText: string;
  imagePrompt: string;
}

export interface SubtitleBlock {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

export type AspectRatio = '1:1' | '16:9' | '9:16';

export interface TokenStatus {
  token: string;
  status: 'valid' | 'invalid';
}

export interface ImageResult {
  id: number;
  prompt: string;
  status: 'pending' | 'success' | 'failed';
  error?: string;
  imageData?: string; // base64 string
}
