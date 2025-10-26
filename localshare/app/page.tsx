"use client";

import { useState, useEffect } from "react";
import { Wifi, Share2, Moon, Sun, Globe, Users, Loader2 } from "lucide-react";
import FileUploader from "./components/FileUploader";
import TransferProgress from "./components/TransferProgress";
import ShareModal from "./components/ShareModal";
import { generateShareCode } from "./lib/utils/format";
import { PeerConnection } from "./lib/webrtc/peer-connection";

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
  const [shareCode, setShareCode] = useState<string>("");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [isWaitingForPeer, setIsWaitingForPeer] = useState(false);
  const [peerConnection, setPeerConnection] = useState<PeerConnection | null>(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("");

  useEffect(() => {
    const code = generateShareCode();
    setShareCode(code);
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (peerConnection) {
        peerConnection.disconnect();
      }
    };
  }, [peerConnection]);

  const handleFilesSelected = async (files: File[]) => {
    setSelectedFiles(files);

    // If peer is already connected, start transfer immediately
    if (peerConnected && peerConnection && files.length > 0) {
      startFileTransfer(files);
    }
  };

  const initializeSharing = async () => {
    if (!shareCode) return;

    try {
      setIsWaitingForPeer(true);
      setConnectionStatus("공유 준비 중...");

      // Create room in signaling server
      const createResponse = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-room', code: shareCode }),
      });

      const createData = await createResponse.json();

      if (!createData.success) {
        throw new Error('Failed to create room');
      }

      // Initialize peer connection as initiator
      const peer = new PeerConnection(true);
      setPeerConnection(peer);

      peer.onProgressCallback((progress) => {
        setTransfers(prev =>
          prev.map((t, index) =>
            index === 0 ? { ...t, progress, status: "transferring" as const } : t
          )
        );
      });

      // Generate offer
      const offer = await peer.initialize();

      // Send offer to signaling server
      await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-offer',
          code: shareCode,
          data: offer
        }),
      });

      setConnectionStatus("수신자를 기다리는 중...");

      // Poll for answer
      const pollInterval = setInterval(async () => {
        const response = await fetch('/api/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-answer', code: shareCode }),
        });

        const data = await response.json();

        if (data.success && data.answer) {
          clearInterval(pollInterval);
          peer.connectToPeer(data.answer);

          // Wait a bit for connection to establish
          setTimeout(() => {
            if (peer.isConnected()) {
              setPeerConnected(true);
              setIsWaitingForPeer(false);
              setConnectionStatus("연결됨");

              // If files are already selected, start transfer
              if (selectedFiles.length > 0) {
                startFileTransfer(selectedFiles);
              }
            }
          }, 1000);
        }
      }, 1000);

      // Timeout after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (!peerConnected) {
          setIsWaitingForPeer(false);
          setConnectionStatus("연결 시간 초과");
        }
      }, 120000);

    } catch (error) {
      console.error('Error initializing sharing:', error);
      setIsWaitingForPeer(false);
      setConnectionStatus("연결 실패");
    }
  };

  const startFileTransfer = async (files: File[]) => {
    if (!peerConnection || !peerConnection.isConnected()) {
      console.error('Peer not connected');
      return;
    }

    // Create transfer entries
    const newTransfers = files.map((file, index) => ({
      id: `transfer-${Date.now()}-${index}`,
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      speed: 0,
      status: "pending" as const,
    }));

    setTransfers(newTransfers);

    // Send files sequentially
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      setTransfers(prev =>
        prev.map((t, index) =>
          index === i ? { ...t, status: "transferring" as const } : t
        )
      );

      try {
        await peerConnection.sendFile(file);

        setTransfers(prev =>
          prev.map((t, index) =>
            index === i ? { ...t, progress: 100, status: "completed" as const } : t
          )
        );
      } catch (error) {
        console.error('Error sending file:', error);
        setTransfers(prev =>
          prev.map((t, index) =>
            index === i ? { ...t, status: "failed" as const } : t
          )
        );
      }
    }
  };

  const handleStartSharing = () => {
    setShareModalOpen(true);
    if (!isWaitingForPeer && !peerConnected) {
      initializeSharing();
    }
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
            onClick={handleStartSharing}
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
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {peerConnected ? (
              <>
                <div className="relative">
                  <Wifi className="w-5 h-5 text-green-500" />
                  <div className="absolute -top-1 -right-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
                <span className="text-sm text-green-500">P2P 연결됨 • 파일 전송 준비 완료</span>
              </>
            ) : isWaitingForPeer ? (
              <>
                <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />
                <span className="text-sm text-yellow-500">{connectionStatus}</span>
              </>
            ) : (
              <>
                <Wifi className="w-5 h-5 text-zinc-500" />
                <span className="text-sm text-zinc-500">
                  공유 버튼을 눌러 파일 전송을 시작하세요
                </span>
              </>
            )}
          </div>

          {isWaitingForPeer && (
            <div className="text-xs text-zinc-500">
              수신자: {shareUrl}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* File Upload Section */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">
              파일 선택
            </h2>
            <FileUploader
              onFilesSelected={handleFilesSelected}
              disabled={false}
            />
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
                    onPause={() => {}}
                    onResume={() => {}}
                    onCancel={() => {
                      setTransfers(prev => prev.filter(t => t.id !== transfer.id));
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Instructions Section */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            사용 방법
          </h2>
          <div className="space-y-4 p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800">
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-xs font-bold">
                  1
                </div>
                <div>
                  <p className="text-sm text-white font-medium">파일 선택</p>
                  <p className="text-xs text-zinc-500">전송할 파일을 드래그 또는 클릭하여 선택</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-xs font-bold">
                  2
                </div>
                <div>
                  <p className="text-sm text-white font-medium">공유 코드 전달</p>
                  <p className="text-xs text-zinc-500">상단의 공유 버튼을 눌러 QR 코드나 링크 공유</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-xs font-bold">
                  3
                </div>
                <div>
                  <p className="text-sm text-white font-medium">자동 전송</p>
                  <p className="text-xs text-zinc-500">수신자가 연결되면 자동으로 파일 전송 시작</p>
                </div>
              </div>
            </div>

            {peerConnected && (
              <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-green-500 font-medium">
                    수신자가 연결되었습니다
                  </span>
                </div>
              </div>
            )}
          </div>

          {selectedFiles.length > 0 && !peerConnected && (
            <button
              onClick={handleStartSharing}
              className="w-full mt-6 px-6 py-3 rounded-xl bg-white text-black font-medium hover:bg-zinc-200 transition-colors"
            >
              파일 공유 시작
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