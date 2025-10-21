import React from 'react';
import type { MergeRule, AnalysisResult } from '../types';

interface MergeRulesProps {
  numberOfParts: number;
  onNumberOfPartsChange: (num: number) => void;
  rules: MergeRule[];
  onRuleChange: (index: number, rule: MergeRule) => void;
  analysisResults: AnalysisResult[];
  disabled?: boolean;
}

const MergeRules: React.FC<MergeRulesProps> = ({ 
  numberOfParts, 
  onNumberOfPartsChange, 
  rules, 
  onRuleChange, 
  analysisResults,
  disabled,
}) => {

  const handlePartsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    onNumberOfPartsChange(isNaN(val) || val < 1 ? 1 : val);
  };

  const handleProcessUpToLineChange = (index: number, value: string) => {
    const newRule = { ...rules[index] };
    const numValue = parseInt(value, 10);
    newRule.processUpToLine = isNaN(numValue) ? 0 : numValue;
    onRuleChange(index, newRule);
  };
  
  const handleMergeLinesChange = (index: number, value: string) => {
    const newRule = { ...rules[index] };
    const numValue = parseInt(value, 10);
    newRule.mergeLinesWithFewerThan = isNaN(numValue) || numValue < 0 ? 0 : numValue;
    onRuleChange(index, newRule);
  };

  const getStartLine = (index: number) => {
    if (index === 0) return 1;
    if (rules[index-1]) {
      return rules[index-1].processUpToLine + 1;
    }
    if(analysisResults[index-1]) {
        return analysisResults[index-1].subtitleLine + 1;
    }
    return '?';
  };

  return (
    <div className="mt-8 animate-fade-in">
      <h2 className="text-2xl font-bold text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-blue-400 to-purple-500">Thiết lập Quy tắc Gộp</h2>
      <div className="bg-gray-800/60 rounded-lg border border-gray-700 shadow-inner p-6">
        <div className="mb-6">
          <div>
            <label htmlFor="number-of-parts" className="block text-sm font-medium text-gray-300 mb-2">Số lượng phần</label>
            <input
              type="number"
              id="number-of-parts"
              value={numberOfParts}
              onChange={handlePartsChange}
              min="1"
              className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-800 disabled:cursor-not-allowed"
              aria-label="Number of parts"
              disabled={disabled}
            />
          </div>
        </div>
        
        <div className="space-y-4">
          {rules.slice(0, numberOfParts).map((rule, index) => (
            <div key={index} className="p-4 rounded-lg border border-gray-700 bg-gray-900/50">
              <h3 className="font-bold text-lg mb-3">Phần {index + 1}</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`process-up-to-${index}`} className="block text-sm font-medium text-gray-400">Xử lý đến dòng:</label>
                  <p className="text-xs text-gray-500 mb-1">Bắt đầu từ dòng {getStartLine(index)}</p>
                  <input
                    type="number"
                    id={`process-up-to-${index}`}
                    value={rule.processUpToLine}
                    onChange={(e) => handleProcessUpToLineChange(index, e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed"
                    aria-label={`Process up to line for part ${index + 1}`}
                    disabled={disabled}
                  />
                </div>
                <div>
                  <label htmlFor={`merge-lines-with-fewer-than-${index}`} className="block text-sm font-medium text-gray-400">Gộp các dòng có ít hơn (từ):</label>
                  <p className="text-xs text-gray-500 mb-1">&nbsp;</p>
                  <input
                    type="number"
                    id={`merge-lines-with-fewer-than-${index}`}
                    value={rule.mergeLinesWithFewerThan}
                    onChange={(e) => handleMergeLinesChange(index, e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed"
                    aria-label={`Merge lines with fewer than X words for part ${index + 1}`}
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MergeRules;