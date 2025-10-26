"use client";

import { useState, useEffect } from "react";
import { Wifi, Share2, Moon, Sun, Globe } from "lucide-react";
import FileUploader from "./components/FileUploader";
import PeerCard from "./components/PeerCard";
import TransferProgress from "./components/TransferProgress";
import ShareModal from "./components/ShareModal";
import { generateShareCode } from "./lib/utils/format";

interface Peer {
  id: string;
  name: string;
  deviceType: "desktop" | "mobile" | "tablet";
  connected: boolean;
}

interface Transfer {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  speed: number;
  status: "pending" | "transferring" | "paused" | "completed" | "failed";
}

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [shareCode, setShareCode] = useState<string>("");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  // Mock data for demonstration
  const [peers] = useState<Peer[]>([
    { id: "1", name: "MacBook Pro", deviceType: "desktop", connected: true },
    { id: "2", name: "iPhone 15", deviceType: "mobile", connected: true },
    { id: "3", name: "iPad Air", deviceType: "tablet", connected: false },
  ]);

  useEffect(() => {
    setShareCode(generateShareCode());
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
  };

  const handlePeerSelect = (peerId: string) => {
    setSelectedPeer(peerId === selectedPeer ? null : peerId);
  };

  const handleStartTransfer = () => {
    if (selectedFiles.length > 0 && selectedPeer) {
      const newTransfers = selectedFiles.map((file, index) => ({
        id: `transfer-${Date.now()}-${index}`,
        fileName: file.name,
        fileSize: file.size,
        progress: 0,
        speed: 0,
        status: "pending" as const,
      }));
      setTransfers([...transfers, ...newTransfers]);

      // Simulate transfer progress
      newTransfers.forEach((transfer, index) => {
        setTimeout(() => {
          simulateTransfer(transfer.id);
        }, index * 1000);
      });
    }
  };

  const simulateTransfer = (transferId: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTransfers(prev =>
          prev.map(t =>
            t.id === transferId
              ? { ...t, progress: 100, status: "completed" as const }
              : t
          )
        );
      } else {
        setTransfers(prev =>
          prev.map(t =>
            t.id === transferId
              ? {
                  ...t,
                  progress,
                  status: "transferring" as const,
                  speed: Math.random() * 50 * 1024 * 1024, // Random speed up to 50MB/s
                }
              : t
          )
        );
      }
    }, 500);
  };

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/share/${shareCode}`
    : "";

  return (
    <main className="min-h-screen p-6 md:p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <Globe className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">LocalShare</h1>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShareModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            <Share2 className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-white">{shareCode}</span>
          </button>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-zinc-400" />
            ) : (
              <Moon className="w-5 h-5 text-zinc-400" />
            )}
          </button>
        </div>
      </header>

      {/* Connection Status */}
      <div className="mb-6 p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800">
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Wifi className="w-5 h-5 text-green-500" />
            <div className="absolute -top-1 -right-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
          </div>
          <span className="text-sm text-zinc-400">
            로컬 네트워크에 연결됨 • {peers.filter(p => p.connected).length}개 디바이스 발견
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* File Upload Section */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">
              파일 선택
            </h2>
            <FileUploader onFilesSelected={handleFilesSelected} />
          </div>

          {/* Transfer List */}
          {transfers.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">
                전송 목록
              </h2>
              <div className="space-y-3">
                {transfers.map(transfer => (
                  <TransferProgress
                    key={transfer.id}
                    {...transfer}
                    onPause={() => {
                      setTransfers(prev =>
                        prev.map(t =>
                          t.id === transfer.id
                            ? { ...t, status: "paused" as const }
                            : t
                        )
                      );
                    }}
                    onResume={() => {
                      setTransfers(prev =>
                        prev.map(t =>
                          t.id === transfer.id
                            ? { ...t, status: "transferring" as const }
                            : t
                        )
                      );
                    }}
                    onCancel={() => {
                      setTransfers(prev => prev.filter(t => t.id !== transfer.id));
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Peer List Section */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            연결 가능한 디바이스
          </h2>
          <div className="grid gap-3">
            {peers.map(peer => (
              <PeerCard
                key={peer.id}
                {...peer}
                selected={selectedPeer === peer.id}
                onSelect={() => handlePeerSelect(peer.id)}
              />
            ))}
          </div>

          {selectedFiles.length > 0 && selectedPeer && (
            <button
              onClick={handleStartTransfer}
              className="w-full mt-6 px-6 py-3 rounded-xl bg-white text-black font-medium hover:bg-zinc-200 transition-colors"
            >
              전송 시작
            </button>
          )}
        </div>
      </div>

      {/* Share Modal */}
      <ShareModal
        shareCode={shareCode}
        shareUrl={shareUrl}
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />
    </main>
  );
}