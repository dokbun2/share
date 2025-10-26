"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, X, Check } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";

interface ShareModalProps {
  shareCode: string;
  shareUrl: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareModal({ shareCode, shareUrl, isOpen, onClose }: ShareModalProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (shareUrl) {
      QRCode.toDataURL(shareUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#FFFFFF',
          light: '#000000',
        },
      }).then(setQrCodeUrl);
    }
  }, [shareUrl]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-zinc-900 rounded-3xl p-8 max-w-md w-full border border-zinc-800">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5 text-zinc-400" />
        </button>

        <div className="text-center">
          <h3 className="text-2xl font-semibold text-white mb-6">
            파일 공유
          </h3>

          {qrCodeUrl && (
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-white rounded-2xl">
                <img
                  src={qrCodeUrl}
                  alt="QR Code"
                  className="w-48 h-48"
                />
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <p className="text-sm text-zinc-500 mb-2">공유 코드</p>
              <div className="flex items-center justify-center space-x-2">
                <div className="px-6 py-3 bg-zinc-800 rounded-xl">
                  <span className="text-2xl font-mono font-bold text-white tracking-wider">
                    {shareCode}
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(shareCode)}
                  className={cn(
                    "p-3 rounded-xl transition-all",
                    copied
                      ? "bg-green-500/20 text-green-500"
                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
                  )}
                >
                  {copied ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <p className="text-sm text-zinc-500 mb-2">공유 링크</p>
              <div className="flex items-center space-x-2">
                <div className="flex-1 px-4 py-2 bg-zinc-800 rounded-xl overflow-hidden">
                  <span className="text-sm text-white truncate">
                    {shareUrl}
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(shareUrl)}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    copied
                      ? "bg-green-500/20 text-green-500"
                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
                  )}
                >
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <p className="text-xs text-zinc-600">
              같은 WiFi 네트워크에 연결된 디바이스에서 접속 가능
            </p>
            {shareUrl && (
              <p className="text-xs text-zinc-500">
                💡 팁: 다른 디바이스의 브라우저에서 위 링크를 직접 입력하세요
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}