"use client";

import { useState, useEffect } from "react";
import { X, Pause, Play, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import { formatBytes, formatSpeed, formatTime } from "@/app/lib/utils/format";

interface TransferProgressProps {
  fileName: string;
  fileSize: number;
  progress: number;
  speed: number;
  status: "pending" | "transferring" | "paused" | "completed" | "failed";
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
}

export default function TransferProgress({
  fileName,
  fileSize,
  progress,
  speed,
  status,
  onPause,
  onResume,
  onCancel,
}: TransferProgressProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    if (speed > 0 && progress < 100) {
      const bytesRemaining = fileSize * (1 - progress / 100);
      setTimeRemaining(bytesRemaining / speed);
    }
  }, [progress, speed, fileSize]);

  const getStatusIcon = () => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "failed":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-white truncate">{fileName}</h4>
          <div className="flex items-center space-x-4 mt-1 text-sm text-zinc-500">
            <span>{formatBytes(fileSize * (progress / 100))} / {formatBytes(fileSize)}</span>
            {status === "transferring" && speed > 0 && (
              <>
                <span>•</span>
                <span>{formatSpeed(speed)}</span>
                <span>•</span>
                <span>{formatTime(timeRemaining)} 남음</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {status === "transferring" && (
            <button
              onClick={onPause}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <Pause className="w-4 h-4 text-zinc-400" />
            </button>
          )}
          {status === "paused" && (
            <button
              onClick={onResume}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <Play className="w-4 h-4 text-zinc-400" />
            </button>
          )}
          {status !== "completed" && (
            <button
              onClick={onCancel}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          )}
          {getStatusIcon()}
        </div>
      </div>

      <div className="relative">
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              status === "completed" && "bg-green-500",
              status === "failed" && "bg-red-500",
              status === "transferring" && "bg-white",
              status === "paused" && "bg-yellow-500",
              status === "pending" && "bg-zinc-600"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="absolute right-0 -bottom-5 text-xs text-zinc-500">
          {progress.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}