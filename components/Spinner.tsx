
import React from 'react';

interface SpinnerProps {
    message?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center my-8">
      <div className="w-12 h-12 border-4 border-t-transparent border-purple-400 rounded-full animate-spin"></div>
      <p className="mt-4 text-gray-400">{message || 'AI đang phân tích, vui lòng chờ trong giây lát...'}</p>
    </div>
  );
};

export default Spinner;
