
// FIX: Replaced require() with ES6 imports and imported necessary React hooks and types.
// This resolves issues with variables being used before declaration, 'require' not being defined in a browser environment,
// and correctly distinguishes between types and values for TypeScript.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import PromptGenerator from './components/PromptGenerator';
import ImageGenerator from './components/ImageGenerator';
import { analyzeContentAndSubtitles } from './services/geminiService';
import { mergeSubtitles } from './services/subtitleService';
import FileUpload from './components/FileUpload';
import ResultsDisplay from './components/ResultsDisplay';
import MergeRules from './components/MergeRules';
import MergedResult from './components/MergedResult';
import ProgressBar from './components/ProgressBar';
import type { AnalysisResult, MergeRule, ImagePromptResult } from './types';

// Define interfaces for the refs to expose component methods
interface SyncAndMergeHandle {
  triggerAutomation: () => Promise<string | null>;
}
interface PromptGeneratorHandle {
  triggerAutomation: (subtitle: string) => Promise<ImagePromptResult[] | null>;
}
interface ImageGeneratorHandle {
  triggerAutomation: (prompts: string[]) => Promise<boolean>;
}


const TabButton: React.FC<{ label: string; isActive: boolean; onClick: () => void; disabled?: boolean; }> = ({ label, isActive, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-300 ${
      isActive
        ? 'border-purple-500 text-purple-400'
        : 'border-transparent text-gray-400 hover:text-gray-200'
    } ${disabled ? 'cursor-not-allowed text-gray-600' : ''}`}
    aria-current={isActive ? 'page' : undefined}
  >
    {label}
  </button>
);


const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'analyze' | 'prompt' | 'image'>('analyze');
  const [isAutomating, setIsAutomating] = useState(false);
  const [automationStatus, setAutomationStatus] = useState('');
  const [automationProgress, setAutomationProgress] = useState(0);

  // Refs for child components
  const syncAndMergeRef = useRef<SyncAndMergeHandle>(null);
  const promptGeneratorRef = useRef<PromptGeneratorHandle>(null);
  const imageGeneratorRef = useRef<ImageGeneratorHandle>(null);
  

  const handleAutomation = async () => {
      setIsAutomating(true);
      
      // --- Step 1 ---
      setAutomationStatus('Bước 1: Đang phân tích và gộp phụ đề...');
      setAutomationProgress(10);
      setActiveTab('analyze');
      const mergedSubtitle = await syncAndMergeRef.current?.triggerAutomation();
      if (!mergedSubtitle) {
          setAutomationStatus('Lỗi ở Bước 1. Đã dừng tự động hóa.');
          setTimeout(() => setIsAutomating(false), 3000);
          return;
      }
      setAutomationProgress(33);

      // --- Step 2 ---
      setAutomationStatus('Bước 2: Đang tạo prompts...');
      setActiveTab('prompt');
      await new Promise(resolve => setTimeout(resolve, 500)); // wait for tab switch
      const prompts = await promptGeneratorRef.current?.triggerAutomation(mergedSubtitle);
       if (!prompts) {
          setAutomationStatus('Lỗi ở Bước 2. Đã dừng tự động hóa.');
          setTimeout(() => setIsAutomating(false), 3000);
          return;
      }
      setAutomationProgress(66);

      // --- Step 3 ---
      setAutomationStatus('Bước 3: Đang tạo hình ảnh...');
      setActiveTab('image');
      await new Promise(resolve => setTimeout(resolve, 500));
      const imagePrompts = prompts.map(p => p.imagePrompt);
      const success = await imageGeneratorRef.current?.triggerAutomation(imagePrompts);

      if (!success) {
          setAutomationStatus('Lỗi ở Bước 3. Đã dừng tự động hóa.');
          setTimeout(() => setIsAutomating(false), 3000);
          return;
      }

      setAutomationProgress(100);
      setAutomationStatus('Hoàn tất! Quá trình tự động đã thành công.');
      setTimeout(() => {
          setIsAutomating(false);
          setAutomationStatus('');
          setAutomationProgress(0);
      }, 5000);
  };


  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
            <div className="flex justify-center items-center gap-4">
                <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                    Trình Xử Lý Phụ Đề & Sáng Tạo Ảnh
                </h1>
                <button 
                  onClick={handleAutomation} 
                  disabled={isAutomating}
                  className="px-4 py-2 bg-gradient-to-r from-teal-400 to-blue-500 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-teal-500 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-opacity-50 transition-all duration-300 transform hover:scale-105 shadow-lg disabled:scale-100 flex items-center gap-2"
                  title="Tự động chạy từ Bước 1 đến Bước 3"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                    </svg>
                    Tự động Hoàn thành
                </button>
            </div>
          <p className="mt-4 text-lg text-gray-400">
            Công cụ AI giúp đồng bộ hóa, gộp phụ đề, tạo prompt và hình ảnh.
          </p>
        </header>

        {isAutomating && (
             <div className="mb-8">
                <ProgressBar progress={automationProgress} message={automationStatus} />
             </div>
        )}

        <div className="w-full border-b border-gray-700 mb-8 flex justify-center space-x-2 md:space-x-4">
            <TabButton label="Bước 1: Đồng bộ & Gộp" isActive={activeTab === 'analyze'} onClick={() => setActiveTab('analyze')} disabled={isAutomating} />
            <TabButton label="Bước 2: Tạo Prompt" isActive={activeTab === 'prompt'} onClick={() => setActiveTab('prompt')} disabled={isAutomating} />
            <TabButton label="Bước 3: Tạo Hình ảnh" isActive={activeTab === 'image'} onClick={() => setActiveTab('image')} disabled={isAutomating} />
        </div>

        <main className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-6 md:p-8 border border-gray-700">
          <div className={activeTab === 'analyze' ? 'block' : 'hidden'}>
            <SyncAndMerge ref={syncAndMergeRef} isAutomating={isAutomating} />
          </div>
          <div className={activeTab === 'prompt' ? 'block' : 'hidden'}>
            <PromptGenerator ref={promptGeneratorRef} isAutomating={isAutomating} />
          </div>
          <div className={activeTab === 'image' ? 'block' : 'hidden'}>
            <ImageGenerator ref={imageGeneratorRef} isAutomating={isAutomating} />
          </div>
        </main>
      </div>
    </div>
  );
};

// Create a new component for Step 1 to encapsulate its logic
const SyncAndMerge = React.forwardRef<SyncAndMergeHandle, { isAutomating: boolean }>(({ isAutomating }, ref) => {
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [numberOfParts, setNumberOfParts] = useState<number>(0);
  const [mergeRules, setMergeRules] = useState<MergeRule[]>([]);
  const [mergedSubtitle, setMergedSubtitle] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [mergeWordsConfig, setMergeWordsConfig] = useState<string>('5');
  const progressIntervalRef = useRef<number | null>(null);

  const startProgress = () => {
    setProgress(0);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = window.setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) {
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
          return 95;
        }
        const increment = (100 - prev) / 20;
        return prev + increment > 95 ? 95 : prev + increment;
      });
    }, 400);
  };

  const stopProgress = (callback: () => void) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setProgress(100);
    setTimeout(() => {
      callback();
      setProgress(0);
    }, 500);
  };

  const handleFileRead = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          resolve(event.target.result as string);
        } else {
          reject(new Error("Không thể đọc tệp."));
        }
      };
      reader.onerror = () => {
        reject(new Error("Lỗi khi đọc tệp."));
      };
      reader.readAsText(file, 'UTF-8');
    });
  };

  const handleAnalyze = useCallback(async (): Promise<AnalysisResult[] | null> => {
    if (!contentFile || !subtitleFile) {
      setError("Vui lòng tải lên cả hai tệp nội dung và phụ đề.");
      return null;
    }
    setIsLoading(true);
    startProgress();
    setError(null);
    setResults([]);
    setMergedSubtitle(null);
    try {
      const contentText = await handleFileRead(contentFile);
      const subtitleText = await handleFileRead(subtitleFile);
      const analysisResults = await analyzeContentAndSubtitles(contentText, subtitleText);
      setResults(analysisResults);
      return analysisResults;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.";
      setError(`Lỗi phân tích: ${errorMessage}`);
      return null;
    } finally {
      stopProgress(() => setIsLoading(false));
    }
  }, [contentFile, subtitleFile]);

  const handleReset = () => {
    setContentFile(null);
    setSubtitleFile(null);
    setResults([]);
    setError(null);
    setIsLoading(false);
    setNumberOfParts(0);
    setMergeRules([]);
    setMergedSubtitle(null);
    setIsMerging(false);
    const contentInput = document.getElementById('content-file-input') as HTMLInputElement;
    if (contentInput) contentInput.value = '';
    const subtitleInput = document.getElementById('subtitle-file-input') as HTMLInputElement;
    if (subtitleInput) subtitleInput.value = '';
  };

  useEffect(() => {
    if (results.length > 0) {
      setNumberOfParts(results.length);
    }
  }, [results]);
  
  useEffect(() => {
    if (numberOfParts === 0 && results.length === 0) {
        setMergeRules([]);
        return;
    }

    const mergeWordsArray = mergeWordsConfig
        .split(';')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);

    const getMergeWordsForPart = (index: number): number => {
        if (mergeWordsArray.length === 0) return 5; // Default value
        if (index < mergeWordsArray.length) return mergeWordsArray[index];
        return mergeWordsArray[mergeWordsArray.length - 1];
    };
    
    const finalRules: MergeRule[] = [];
    for (let i = 0; i < numberOfParts; i++) {
        const mergeLinesWithFewerThan = getMergeWordsForPart(i);
        let processUpToLine: number;
        
        if (results[i]) {
            processUpToLine = results[i].subtitleLine;
        } else {
            const lastValidLine = i > 0 
                ? finalRules[i - 1].processUpToLine
                : (results.length > 0 ? results[results.length - 1].subtitleLine : 0);
            processUpToLine = lastValidLine + 20; // Default increment if user adds parts
        }

        finalRules.push({ processUpToLine, mergeLinesWithFewerThan });
    }
    
    setMergeRules(finalRules);
  }, [numberOfParts, results, mergeWordsConfig]);


  const handleRuleChange = (index: number, rule: MergeRule) => {
    const newRules = [...mergeRules];
    newRules[index] = rule;
    setMergeRules(newRules);
  };

  const handleMerge = useCallback(async (rulesToUse?: MergeRule[]): Promise<string | null> => {
    const finalRules = rulesToUse || mergeRules;
    if (!subtitleFile || finalRules.length === 0) {
      setError("Không có tệp phụ đề hoặc quy tắc để xử lý.");
      return null;
    }
    setIsMerging(true);
    startProgress();
    setError(null);
    setMergedSubtitle(null);
    try {
      const subtitleText = await handleFileRead(subtitleFile);
      const mergedText = mergeSubtitles(subtitleText, finalRules);
      setMergedSubtitle(mergedText);
      return mergedText;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định khi gộp.";
      setError(`Lỗi gộp phụ đề: ${errorMessage}`);
      return null;
    } finally {
      stopProgress(() => setIsMerging(false));
    }
  }, [subtitleFile, mergeRules]);
  
  React.useImperativeHandle(ref, () => ({
    async triggerAutomation() {
        const analysisResults = await handleAnalyze();
        if (analysisResults && analysisResults.length > 0) {
            // Generate rules directly from analysis results to avoid race conditions with state updates
            const mergeWordsArray = mergeWordsConfig
                .split(';')
                .map(s => parseInt(s.trim(), 10))
                .filter(n => !isNaN(n) && n > 0);

            const getMergeWordsForPart = (index: number): number => {
                if (mergeWordsArray.length === 0) return 5;
                if (index < mergeWordsArray.length) return mergeWordsArray[index];
                return mergeWordsArray[mergeWordsArray.length - 1];
            };
            
            const rulesToUse = analysisResults.map((result, i) => ({
                processUpToLine: result.subtitleLine,
                mergeLinesWithFewerThan: getMergeWordsForPart(i)
            }));
            
            // Set state for UI consistency, but don't rely on it for the automation logic
            setNumberOfParts(analysisResults.length);
            setMergeRules(rulesToUse);
            
            const mergedText = await handleMerge(rulesToUse);
            return mergedText;
        }
        if (analysisResults === null) {
            // Error is already set inside handleAnalyze
            return null;
        }
        setError("Phân tích không trả về kết quả nào.");
        return null;
    }
  }), [handleAnalyze, mergeWordsConfig, handleMerge]);

  const showMergeSection = results.length > 0 && !isLoading;

  return (
    <>
      {results.length === 0 && !isLoading && !mergedSubtitle && (
        <>
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <FileUpload id="content-file-input" label="Tệp Nội Dung" onFileSelect={setContentFile} fileName={contentFile?.name} disabled={isAutomating}/>
            <FileUpload id="subtitle-file-input" label="Tệp Phụ Đề" onFileSelect={setSubtitleFile} fileName={subtitleFile?.name} disabled={isAutomating}/>
          </div>
          <div className="mb-6">
            <label htmlFor="merge-words-config" className="block text-sm font-medium text-gray-300 mb-2">
              Ngưỡng gộp (từ)
            </label>
            <input
              type="text"
              id="merge-words-config"
              value={mergeWordsConfig}
              onChange={(e) => setMergeWordsConfig(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-purple-500 focus:border-purple-500"
              placeholder="5;10;15..."
              aria-label="Merge lines with fewer than X words configuration"
              disabled={isAutomating}
            />
             <p className="text-xs text-gray-500 mt-1">
              Nhập các số cách nhau bằng dấu chấm phẩy (;). Số cuối sẽ áp dụng cho các phần còn lại.
            </p>
          </div>
        </>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg relative mb-6" role="alert">
          <strong className="font-bold">Lỗi!</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}

      <div className="flex justify-center mt-4">
        {results.length > 0 || mergedSubtitle ? (
          <button onClick={handleReset} disabled={isAutomating} className="px-8 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition-all duration-300 transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
            Bắt đầu lại
          </button>
        ) : (
          <button onClick={() => handleAnalyze()} disabled={!contentFile || !subtitleFile || isLoading || isAutomating} className="px-10 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-600 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-all duration-300 transform hover:scale-105 shadow-lg disabled:scale-100">
            {isLoading ? 'Đang phân tích...' : 'Bắt đầu Phân Tích'}
          </button>
        )}
      </div>

      {(isLoading || isMerging) && !isAutomating && <ProgressBar progress={progress} message={isLoading ? "AI đang phân tích..." : "Đang gộp phụ đề..."} />}
      
      {results.length > 0 && !isLoading && <ResultsDisplay results={results} />}

      {showMergeSection && (
        <>
          <MergeRules 
            numberOfParts={numberOfParts} 
            onNumberOfPartsChange={setNumberOfParts} 
            rules={mergeRules} 
            onRuleChange={handleRuleChange} 
            analysisResults={results}
            disabled={isAutomating}
          />
          <div className="flex justify-center mt-8">
            <button onClick={() => handleMerge()} disabled={isMerging || isAutomating} className="px-10 py-4 bg-gradient-to-r from-green-500 to-blue-500 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-green-600 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-all duration-300 transform hover:scale-105 shadow-lg disabled:scale-100">
              {isMerging ? 'Đang gộp...' : 'Gộp Phụ Đề'}
            </button>
          </div>
        </>
      )}
      
      {mergedSubtitle !== null && !isMerging && (
        <MergedResult content={mergedSubtitle} originalFileName={subtitleFile?.name || 'subtitles.srt'} />
      )}
    </>
  );
});

export default App;
