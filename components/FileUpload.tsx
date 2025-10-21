
import React from 'react';

interface FileUploadProps {
  id: string;
  label: string;
  onFileSelect: (file: File) => void;
  fileName: string | undefined;
  disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ id, label, onFileSelect, fileName, disabled }) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div className="w-full">
      <label htmlFor={id} className={`block text-sm font-medium mb-2 ${disabled ? 'text-gray-500' : 'text-gray-300'}`}>{label}</label>
      <div className={`mt-2 flex justify-center rounded-lg border border-dashed px-6 py-10 transition-colors duration-300 ${disabled ? 'border-gray-700 bg-gray-800/20 cursor-not-allowed' : 'border-gray-600 hover:border-purple-400 bg-gray-800/50'}`}>
        <div className="text-center">
          <svg className={`mx-auto h-12 w-12 ${disabled ? 'text-gray-600' : 'text-gray-500'}`} stroke="currentColor" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <div className="mt-4 flex text-sm leading-6 text-gray-400">
            <label htmlFor={id} className={`relative rounded-md font-semibold ${disabled ? 'text-gray-500 cursor-not-allowed' : 'text-purple-400 focus-within:outline-none focus-within:ring-2 focus-within:ring-purple-500 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 hover:text-purple-300 cursor-pointer'}`}>
              <span>Tải lên một tệp</span>
              <input id={id} name={id} type="file" className="sr-only" onChange={handleFileChange} accept=".txt,.srt,.vtt" disabled={disabled} />
            </label>
            <p className="pl-1">hoặc kéo và thả</p>
          </div>
          <p className="text-xs leading-5 text-gray-500">TXT, SRT, VTT</p>
          {fileName && (
             <p className="text-sm text-green-400 mt-4 truncate" title={fileName}>
                Đã chọn: {fileName}
             </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUpload;