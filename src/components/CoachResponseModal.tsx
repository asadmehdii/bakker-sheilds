import React, { useState, useRef } from 'react';
import { X, Send, FileText, Video, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { checkinService, type Checkin } from '../lib/supabase';

interface CoachResponseModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkin: Checkin;
  onResponseSubmitted: () => void;
}

const CoachResponseModal: React.FC<CoachResponseModalProps> = ({ 
  isOpen, 
  onClose, 
  checkin, 
  onResponseSubmitted 
}) => {
  const [responseType, setResponseType] = useState<'written' | 'video'>('written');
  const [writtenResponse, setWrittenResponse] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError('Please select a text file (.txt, .md, or other text format)');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      reader.readAsText(file);
    });
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      let responseContent = '';

      if (responseType === 'written') {
        if (!writtenResponse.trim()) {
          setError('Please enter a written response');
          setLoading(false);
          return;
        }
        responseContent = writtenResponse.trim();
      } else {
        if (!selectedFile) {
          setError('Please upload a video transcript file');
          setLoading(false);
          return;
        }
        responseContent = await readFileContent(selectedFile);
      }

      const success = await checkinService.submitCoachResponse(
        checkin.id,
        responseContent,
        responseType
      );

      if (success) {
        setSuccess(true);
        setTimeout(() => {
          onResponseSubmitted();
          onClose();
          // Reset form
          setWrittenResponse('');
          setSelectedFile(null);
          setResponseType('written');
          setSuccess(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }, 1500);
      } else {
        setError('Failed to submit response. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting response:', error);
      setError('Failed to submit response. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Respond to Check-in</h2>
            <p className="text-sm text-slate-600 mt-1">
              {checkin.client_name} • {new Date(checkin.date).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors duration-200"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Success Message */}
          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-700 text-sm">Response submitted successfully!</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          {/* Response Type Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">Response Type</label>
            <div className="flex space-x-4">
              <button
                onClick={() => setResponseType('written')}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
                  responseType === 'written'
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <FileText className="w-5 h-5" />
                <span className="font-medium">Written Response</span>
              </button>
              <button
                onClick={() => setResponseType('video')}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
                  responseType === 'video'
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <Video className="w-5 h-5" />
                <span className="font-medium">Video Transcript</span>
              </button>
            </div>
          </div>

          {/* Written Response */}
          {responseType === 'written' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Your Response to {checkin.client_name}
              </label>
              <textarea
                value={writtenResponse}
                onChange={(e) => setWrittenResponse(e.target.value)}
                placeholder="Provide detailed feedback on their check-in, plan modifications, and next steps..."
                className="w-full h-48 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                disabled={loading}
              />
              <p className="text-xs text-slate-500 mt-2">
                Be specific about what's changing in their plan and why. This helps the AI learn your coaching patterns.
              </p>
            </div>
          )}

          {/* Video Transcript Upload */}
          {responseType === 'video' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Upload Video Response Transcript
              </label>
              
              {selectedFile ? (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-5 h-5 text-slate-500" />
                      <span className="text-sm text-slate-700">{selectedFile.name}</span>
                      <span className="text-xs text-slate-500">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button
                      onClick={clearFile}
                      className="p-1 hover:bg-slate-200 rounded transition-colors duration-200"
                    >
                      <X className="w-4 h-4 text-slate-500" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-slate-400 transition-colors duration-200">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-600 mb-2">Upload your video response transcript</p>
                  <p className="text-xs text-slate-500 mb-4">Supports .txt, .md, and other text formats</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,text/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-200 transition-all duration-200"
                  >
                    Choose File
                  </button>
                </div>
              )}
              
              <p className="text-xs text-slate-500 mt-2">
                Upload the transcript of your video response to the client. This helps the AI understand your verbal coaching style.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2 text-slate-600 hover:text-slate-800 font-medium transition-colors duration-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || (!writtenResponse.trim() && !selectedFile)}
              className="bg-gradient-to-r from-teal-600 to-emerald-700 text-white px-6 py-3 rounded-lg font-medium hover:from-teal-700 hover:to-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2 shadow-md hover:shadow-lg"
            >
              <Send className="w-4 h-4" />
              <span>{loading ? 'Submitting...' : 'Submit Response'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoachResponseModal;