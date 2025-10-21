import React from 'react';

interface ProgressBarProps {
  progress: number;
  message?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, message }) => {
  return (
    <div className="flex flex-col items-center justify-center my-8 w-full max-w-md mx-auto">
        <p className="mb-2 text-sm text-gray-400">{message || 'Đang xử lý...'}</p>
        <div className="w-full bg-gray-700 rounded-full h-2.5">
            <div 
            className="bg-purple-500 h-2.5 rounded-full transition-all duration-300 ease-linear" 
            style={{ width: `${progress}%` }}
            ></div>
        </div>
    </div>
  );
};

export default ProgressBar;
