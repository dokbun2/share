"use client";

import { useCallback, useState } from "react";
import { Upload, File, X, Folder } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import { formatBytes } from "@/app/lib/utils/format";

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export default function FileUploader({ onFilesSelected, disabled }: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleClick = () => {
    if (disabled) return;
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    }
  }, []);

  const handleFiles = (files: File[]) => {
    setSelectedFiles(files);
    onFilesSelected(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  return (
    <div className="w-full">
      <div
        className={cn(
          "relative rounded-2xl border-2 border-dashed transition-all duration-300 drop-zone",
          dragActive
            ? "border-white bg-white/10 dragging"
            : "border-zinc-700 hover:border-zinc-600 bg-zinc-900/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          type="file"
          multiple
          onChange={handleFileInput}
          className="sr-only"
          id="file-upload"
          disabled={disabled}
          tabIndex={-1}
        />

        <div
          className={cn(
            "flex flex-col items-center justify-center p-12",
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          )}
        >
          <div className="rounded-full bg-zinc-800 p-6 mb-4">
            <Upload className="w-8 h-8 text-zinc-400" />
          </div>

          <p className="text-lg font-medium text-white mb-1">
            파일을 드래그하거나 클릭하여 선택
          </p>
          <p className="text-sm text-zinc-500">
            최대 10GB까지 전송 가능
          </p>
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-zinc-400 mb-2">
            선택된 파일 ({selectedFiles.length}개)
          </p>
          <div className="space-y-2">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 group hover:border-zinc-700 transition-all"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-zinc-800">
                    {file.type.startsWith("image/") ? (
                      <File className="w-4 h-4 text-blue-400" />
                    ) : file.type.startsWith("video/") ? (
                      <File className="w-4 h-4 text-purple-400" />
                    ) : (
                      <File className="w-4 h-4 text-zinc-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white truncate max-w-[300px]">
                      {file.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="p-1 rounded-lg hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="w-4 h-4 text-zinc-500 hover:text-white" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}