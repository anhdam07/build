
import React, { useState } from 'react';

interface MergedResultProps {
  content: string;
  originalFileName: string;
}

const MergedResult: React.FC<MergedResultProps> = ({ content, originalFileName }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merged_${originalFileName.replace(/\.[^/.]+$/, "")}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="mt-8 animate-fade-in">
      <h2 className="text-2xl font-bold text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-blue-400 to-purple-500">Kết quả Phụ Đề Đã Gộp</h2>
      <div className="bg-gray-800/60 rounded-lg border border-gray-700 shadow-inner p-6">
        <textarea
          readOnly
          value={content}
          className="w-full h-96 bg-gray-900 border border-gray-600 rounded-md p-3 text-gray-300 font-mono text-sm focus:ring-purple-500 focus:border-purple-500"
          aria-label="Merged subtitle content"
        />
        <div className="mt-4 flex justify-end space-x-4">
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-colors"
          >
            {copied ? 'Đã chép!' : 'Chép vào Clipboard'}
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-colors"
          >
            Tải tệp .srt
          </button>
        </div>
      </div>
    </div>
  );
};

export default MergedResult;
