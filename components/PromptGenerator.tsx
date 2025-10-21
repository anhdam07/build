import React, { useState, useCallback, useRef, useImperativeHandle } from 'react';
import { generateImagePrompts } from '../services/geminiService';
import type { ImagePromptResult } from '../types';
import ProgressBar from './ProgressBar';

interface PromptGeneratorProps {
    isAutomating: boolean;
}

interface PromptGeneratorHandle {
    triggerAutomation: (subtitle: string) => Promise<ImagePromptResult[] | null>;
}

const PromptGenerator = React.forwardRef<PromptGeneratorHandle, PromptGeneratorProps>(({ isAutomating }, ref) => {
    const [subtitleText, setSubtitleText] = useState<string>('');
    const [conditions, setConditions] = useState<string>('cinematic, 4k, hyper-realistic, detailed, professional color grading, soft light');
    const [prompts, setPrompts] = useState<ImagePromptResult[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [copyAllStatus, setCopyAllStatus] = useState<string>('Copy tất cả');
    const [progress, setProgress] = useState<number>(0);
    const intervalRef = useRef<number | null>(null);

    const handleGenerate = useCallback(async (subtitleToProcess: string) => {
        if (!subtitleToProcess.trim()) {
            setError("Vui lòng nhập nội dung phụ đề.");
            return null;
        }
        if (!conditions.trim()) {
            setError("Vui lòng nhập điều kiện hoặc phong cách.");
            return null;
        }
        setIsLoading(true);
        setError(null);
        setPrompts([]);
        setProgress(0);

        if (intervalRef.current) clearInterval(intervalRef.current);

        intervalRef.current = window.setInterval(() => {
          setProgress(prev => {
            if (prev >= 95) {
              if (intervalRef.current) clearInterval(intervalRef.current);
              return 95;
            }
            const increment = (100 - prev) / 20;
            return prev + increment > 95 ? 95 : prev + increment;
          });
        }, 400);

        try {
            const results = await generateImagePrompts(subtitleToProcess, conditions);
            setPrompts(results);
            return results;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.";
            setError(`Lỗi tạo prompt: ${errorMessage}`);
            console.error(err);
            return null;
        } finally {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            setProgress(100);
            setTimeout(() => {
                setIsLoading(false);
            }, 500);
        }
    }, [conditions]);

    useImperativeHandle(ref, () => ({
        async triggerAutomation(subtitle) {
            setSubtitleText(subtitle);
            return await handleGenerate(subtitle);
        }
    }));
    
    const handleCopyAll = () => {
        const content = prompts.map(p => p.imagePrompt).join('\n');
        navigator.clipboard.writeText(content).then(() => {
            setCopyAllStatus('Đã chép!');
            setTimeout(() => setCopyAllStatus('Copy tất cả'), 2000);
        });
    };

    const handleDownloadAll = () => {
        const content = prompts.map((p, index) => `${index + 1}. ${p.imagePrompt}`).join('\n\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'generated_prompts.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="animate-fade-in">
            <h2 className="text-2xl font-bold text-center mb-4 text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-blue-400 to-purple-500">Tạo Prompt Hình ảnh</h2>
            <p className="text-gray-400 text-center mb-6">Nhập nội dung phụ đề và các điều kiện bạn muốn. AI sẽ tạo một prompt hình ảnh (bằng tiếng Anh) cho mỗi dòng.</p>
            
            <div className="space-y-6">
                 <div>
                    <label htmlFor="subtitle-input" className="block text-sm font-medium text-gray-300 mb-2">Nội dung Phụ đề</label>
                    <textarea 
                        id="subtitle-input" 
                        value={subtitleText} 
                        onChange={(e) => setSubtitleText(e.target.value)} 
                        rows={8} 
                        className="w-full bg-gray-900 border border-gray-600 rounded-md p-3 text-gray-300 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm disabled:bg-gray-800 disabled:cursor-not-allowed"
                        placeholder="Dán nội dung phụ đề đã gộp của bạn vào đây..."
                        disabled={isAutomating}
                    />
                </div>
                <div>
                    <label htmlFor="conditions" className="block text-sm font-medium text-gray-300 mb-2">Điều kiện & Phong cách</label>
                    <textarea 
                        id="conditions" 
                        value={conditions} 
                        onChange={(e) => setConditions(e.target.value)} 
                        rows={3} 
                        className="w-full bg-gray-900 border border-gray-600 rounded-md p-3 text-gray-300 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-800 disabled:cursor-not-allowed"
                        placeholder="e.g., cinematic, 4k, hyper-realistic..."
                        disabled={isAutomating}
                    />
                </div>
            </div>

            <div className="flex justify-center mt-8">
                <button 
                    onClick={() => handleGenerate(subtitleText)} 
                    disabled={isLoading || isAutomating} 
                    className="px-10 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-600 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-all duration-300 transform hover:scale-105 shadow-lg disabled:scale-100"
                >
                    {isLoading ? 'Đang tạo...' : 'Tạo Prompts'}
                </button>
            </div>
            
            {isLoading && !isAutomating && <ProgressBar progress={progress} message="AI đang tạo prompts, vui lòng chờ..." />}

            {error && (
                <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg relative my-6" role="alert">
                  <strong className="font-bold">Lỗi!</strong>
                  <span className="block sm:inline ml-2">{error}</span>
                </div>
            )}

            {prompts.length > 0 && !isLoading && (
                 <div className="mt-8">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold">Kết quả Prompts</h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleCopyAll}
                                className="px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-colors"
                            >
                               {copyAllStatus}
                            </button>
                            <button
                                onClick={handleDownloadAll}
                                className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-colors"
                            >
                               Tải tất cả (.txt)
                            </button>
                        </div>
                    </div>
                    <div className="bg-gray-800/60 rounded-lg border border-gray-700 shadow-inner p-6 max-h-[60vh] overflow-y-auto">
                       <ol className="list-decimal list-inside space-y-4">
                            {prompts.map((p) => (
                                <li key={p.subtitleIndex} className="text-gray-300">
                                    <p className="font-mono text-purple-300">{p.imagePrompt}</p>
                                </li>
                            ))}
                       </ol>
                    </div>
                 </div>
            )}
        </div>
    );
});

export default PromptGenerator;
