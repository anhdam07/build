import React, { useState, useCallback, useEffect, useImperativeHandle } from 'react';
import JSZip from 'jszip';
import { generateImage, TokenError, fixPromptWithAI } from '../services/imageService';
import type { AspectRatio, ImageResult, TokenStatus } from '../types';
import ProgressBar from './ProgressBar';

const EditPromptModal: React.FC<{ prompt: string; onSave: (newPrompt: string) => void; onCancel: () => void; }> = ({ prompt, onSave, onCancel }) => {
    const [editedPrompt, setEditedPrompt] = useState(prompt);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg border border-gray-700">
                <h3 className="text-lg font-bold mb-4">Sửa Prompt</h3>
                <textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    rows={5}
                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-3 text-gray-300 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm"
                />
                <div className="flex justify-end space-x-4 mt-4">
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-500">Hủy</button>
                    <button onClick={() => onSave(editedPrompt)} className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700">Lưu & Tạo lại</button>
                </div>
            </div>
        </div>
    );
};

interface ImageGeneratorProps {
    isAutomating: boolean;
}

interface ImageGeneratorHandle {
    triggerAutomation: (prompts: string[]) => Promise<boolean>;
}


const ImageGenerator = React.forwardRef<ImageGeneratorHandle, ImageGeneratorProps>(({ isAutomating }, ref) => {
    const [rawTokenInput, setRawTokenInput] = useState('');
    const [bearerTokens, setBearerTokens] = useState<TokenStatus[]>([]);
    const [rawPromptInput, setRawPromptInput] = useState('');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
    const [results, setResults] = useState<ImageResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [editingResult, setEditingResult] = useState<ImageResult | null>(null);

    useEffect(() => {
        if (!rawTokenInput) {
            setBearerTokens([]);
            return;
        }
        const parsedTokens = rawTokenInput
            .split('ya29.')
            .filter(part => part.trim() !== '')
            .map(part => 'ya29.' + part.trim().split(/\s/)[0]);

        setBearerTokens(prevTokens => {
            const newTokensMap = new Map<string, TokenStatus>();
            parsedTokens.forEach(token => {
                const existing = prevTokens.find(pt => pt.token === token);
                newTokensMap.set(token, existing || { token, status: 'valid' });
            });
            return Array.from(newTokensMap.values());
        });
    }, [rawTokenInput]);

    const updateResult = (id: number, updates: Partial<ImageResult>) => {
        setResults(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    };
    
    const updateTokenStatus = (token: string, status: 'invalid' | 'valid') => {
        setBearerTokens(prev => prev.map(t => t.token === token ? {...t, status} : t));
    };

    const processSinglePrompt = async (result: ImageResult, token: TokenStatus) => {
        try {
            const imageData = await generateImage(result.prompt, aspectRatio, token.token);
            updateResult(result.id, { status: 'success', error: undefined, imageData });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
            updateResult(result.id, { status: 'failed', error: errorMessage, imageData: undefined });
            if (error instanceof TokenError) {
                updateTokenStatus(token.token, 'invalid');
            }
        }
    };

    const handleGenerate = async (promptsToProcess: string[], tokensToUse: TokenStatus[]) => {
        const validTokens = tokensToUse.filter(t => t.status === 'valid');
        const prompts = promptsToProcess.filter(p => p.trim() !== '');

        if (prompts.length === 0 || validTokens.length === 0) return false;

        setIsLoading(true);
        setProgress(0);
        
        const initialResults = prompts.map((prompt, i) => ({
            id: i, prompt, status: 'pending' as const
        }));
        setResults(initialResults);

        let completed = 0;
        const promises = initialResults.map((result, i) => {
            const token = validTokens[i % validTokens.length];
            return processSinglePrompt(result, token).finally(() => {
                completed++;
                setProgress((completed / prompts.length) * 100);
            });
        });

        await Promise.all(promises);
        setIsLoading(false);
        return true;
    };
    
    useImperativeHandle(ref, () => ({
        async triggerAutomation(prompts) {
            setRawPromptInput(prompts.join('\n'));
            // Automation uses the state of tokens already present in the UI
            return await handleGenerate(prompts, bearerTokens);
        }
    }));

    const handleRegen = async (result: ImageResult) => {
        const validTokens = bearerTokens.filter(t => t.status === 'valid');
        if (validTokens.length === 0) {
            updateResult(result.id, { status: 'failed', error: "Không có token hợp lệ để thử lại."});
            return;
        }
        const token = validTokens[Math.floor(Math.random() * validTokens.length)];
        updateResult(result.id, { status: 'pending', error: undefined, imageData: undefined });
        await processSinglePrompt(result, token);
    };
    
    const handleRegenAllFailed = async () => {
        setIsBatchProcessing(true);
        const failedResults = results.filter(r => r.status === 'failed');
        const promises = failedResults.map(result => handleRegen(result));
        await Promise.all(promises);
        setIsBatchProcessing(false);
    };

    const handleFixAllFailed = async () => {
        setIsBatchProcessing(true);
        const failedResults = results.filter(r => r.status === 'failed');
        
        const processFix = async (result: ImageResult) => {
            try {
                updateResult(result.id, { error: 'Đang sửa bằng AI...' });
                const fixedPrompt = await fixPromptWithAI(result.prompt);
                const updatedResult = { ...result, prompt: fixedPrompt };
                
                setResults(prev => prev.map(r => r.id === result.id ? updatedResult : r));
                
                await handleRegen(updatedResult);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
                updateResult(result.id, { error: `Sửa lỗi thất bại: ${errorMessage}` });
            }
        };

        const promises = failedResults.map(processFix);
        await Promise.all(promises);
        setIsBatchProcessing(false);
    };

    const handleSaveEdit = (newPrompt: string) => {
        if (!editingResult) return;
        const resultToEdit = { ...editingResult, prompt: newPrompt };
        setResults(prev => prev.map(r => r.id === resultToEdit.id ? resultToEdit : r));
        setEditingResult(null);
        handleRegen(resultToEdit);
    };

    const handleDownloadZip = async () => {
        const zip = new JSZip();
        const successfulResults = results.filter(r => r.status === 'success' && r.imageData);

        successfulResults.forEach((result) => {
            const imageData = result.imageData!;
            const filename = `${String(result.id + 1).padStart(3, '0')}.png`;
            zip.file(filename, imageData, { base64: true });
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = 'generated_images.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    };
    
    const activeTokens = bearerTokens.filter(t => t.status === 'valid').length;
    const successfulResultsCount = results.filter(r => r.status === 'success').length;
    const failedResultsCount = results.filter(r => r.status === 'failed').length;

    return (
        <div className="grid md:grid-cols-2 gap-8 animate-fade-in">
             {editingResult && (
                <EditPromptModal 
                    prompt={editingResult.prompt}
                    onSave={handleSaveEdit}
                    onCancel={() => setEditingResult(null)}
                />
            )}
            {/* Left Column: Controls */}
            <div className="space-y-6">
                <div>
                    <label htmlFor="bearer-tokens" className="block text-sm font-medium text-gray-300 mb-2">Bearer Tokens</label>
                    <textarea id="bearer-tokens" value={rawTokenInput} onChange={e => setRawTokenInput(e.target.value)} rows={5} className="w-full bg-gray-900 border border-gray-600 rounded-md p-3 text-gray-300 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm disabled:bg-gray-800 disabled:cursor-not-allowed" placeholder="Dán các token vào đây, mỗi token cách nhau bởi khoảng trắng hoặc xuống dòng." disabled={isAutomating}/>
                    <p className="text-xs text-gray-400 mt-1">Đã phát hiện: {bearerTokens.length} token ({activeTokens} hoạt động)</p>
                </div>
                <div>
                    <label htmlFor="prompts" className="block text-sm font-medium text-gray-300 mb-2">Prompts (mỗi dòng một prompt)</label>
                    <textarea id="prompts" value={rawPromptInput} onChange={e => setRawPromptInput(e.target.value)} rows={8} className="w-full bg-gray-900 border border-gray-600 rounded-md p-3 text-gray-300 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm disabled:bg-gray-800 disabled:cursor-not-allowed" placeholder="A cinematic shot of a curious robot..." disabled={isAutomating}/>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Tỷ lệ khung hình</label>
                    <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value as AspectRatio)} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-800 disabled:cursor-not-allowed" disabled={isAutomating}>
                        <option value="16:9">Landscape (16:9)</option>
                        <option value="1:1">Square (1:1)</option>
                        <option value="9:16">Portrait (9:16)</option>
                    </select>
                </div>
                <button onClick={() => handleGenerate(rawPromptInput.trim().split('\n'), bearerTokens)} disabled={isLoading || isBatchProcessing || bearerTokens.length === 0 || rawPromptInput.trim() === '' || isAutomating} className="w-full px-10 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-600 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-all duration-300 transform hover:scale-105 shadow-lg disabled:scale-100">
                    {isLoading ? `Đang tạo... (${Math.round(progress)}%)` : `Tạo ${rawPromptInput.trim().split('\n').filter(p=>p.trim()).length} Ảnh`}
                </button>
                {isLoading && !isAutomating && <ProgressBar progress={progress} />}
            </div>

            {/* Right Column: Results */}
            <div>
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <h3 className="text-xl font-bold">Kết quả</h3>
                    <div className="flex gap-2 flex-wrap justify-end">
                       {failedResultsCount > 0 && !isLoading && (
                            <>
                                <button onClick={handleFixAllFailed} disabled={isBatchProcessing || isAutomating} className="px-3 py-2 text-sm bg-yellow-600 text-white font-semibold rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                    {isBatchProcessing ? 'Đang xử lý...' : `Sửa & Tạo lại ${failedResultsCount} lỗi`}
                                </button>
                                <button onClick={handleRegenAllFailed} disabled={isBatchProcessing || isAutomating} className="px-3 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                    {isBatchProcessing ? 'Đang xử lý...' : `Tạo lại ${failedResultsCount} lỗi`}
                                </button>
                            </>
                        )}
                        {successfulResultsCount > 0 && !isLoading && (
                             <button onClick={handleDownloadZip} disabled={isAutomating} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors disabled:opacity-50">
                                Tải {successfulResultsCount} ảnh (.zip)
                             </button>
                        )}
                    </div>
                </div>
                <div className="bg-gray-800/60 rounded-lg border border-gray-700 shadow-inner p-4 space-y-3 h-[60vh] overflow-y-auto">
                    {results.length === 0 && <p className="text-gray-500 text-center py-10">Chưa có kết quả.</p>}
                    {results.map(result => (
                        <div key={result.id} className="flex items-center gap-4 bg-gray-900/50 p-3 rounded-md">
                            <div className="flex-shrink-0">
                                {result.status === 'success' && <div className="w-5 h-5 bg-green-500 rounded-full" title="Thành công"></div>}
                                {result.status === 'failed' && <div className="w-5 h-5 bg-red-500 rounded-full" title={`Thất bại: ${result.error}`}></div>}
                                {result.status === 'pending' && <div className="w-5 h-5 border-2 border-t-transparent border-purple-400 rounded-full animate-spin"></div>}
                            </div>
                            <p className="flex-1 text-sm text-gray-300 truncate" title={result.prompt}>{result.error ? <span className="text-red-400">{result.error}</span> : result.prompt}</p>
                            {result.status !== 'pending' && (
                                <div className="flex-shrink-0 flex gap-2">
                                    <button onClick={() => setEditingResult(result)} disabled={isAutomating} className="text-xs bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-1 px-2 rounded disabled:opacity-50">Sửa</button>
                                    <button onClick={() => handleRegen(result)} disabled={isAutomating} className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-2 rounded disabled:opacity-50">Tạo lại</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});

export default ImageGenerator;
