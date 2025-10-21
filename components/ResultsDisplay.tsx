
import React from 'react';
import type { AnalysisResult } from '../types';

interface ResultsDisplayProps {
  results: AnalysisResult[];
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ results }) => {
  return (
    <div className="mt-8 animate-fade-in">
      <h2 className="text-2xl font-bold text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-blue-400 to-purple-500">Kết quả Phân tích</h2>
      <div className="bg-gray-800/60 rounded-lg border border-gray-700 shadow-inner overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800/80">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Phần Nội Dung
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Kết thúc ở Dòng Phụ Đề
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {results.map((result, index) => (
                <tr key={index} className="hover:bg-gray-700/50 transition-colors duration-200">
                  <td className="px-6 py-4 whitespace-nowrap text-lg font-semibold text-gray-100">
                    Phần {result.section}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-lg font-semibold text-purple-400">
                    {result.subtitleLine}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;
