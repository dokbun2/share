"use client";

import { useState, useEffect } from "react";
import { Wifi, Moon, Sun, Globe, Users, Loader2, Send } from "lucide-react";
import FileUploader from "./components/FileUploader";
import TransferProgress from "./components/TransferProgress";
import NetworkInfo from "./components/NetworkInfo";
import { generateShareCode, formatBytes } from "./lib/utils/format";
import { PeerConnection } from "./lib/webrtc/peer-connection";
import { cn } from "./lib/utils/cn";
import { getLocalNetworkIP, getShareUrl } from "./lib/utils/network";
import JSZip from "jszip";

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
  const [darkMode, setDarkMode] = useState(true);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [isWaitingForPeer, setIsWaitingForPeer] = useState(false);
  const [peerConnection, setPeerConnection] = useState<PeerConnection | null>(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("");
  const [networkIP, setNetworkIP] = useState<string>("");
  const [isCompressing, setIsCompressing] = useState(false);

  useEffect(() => {
    const code = generateShareCode();
    setShareCode(code);

    // 네트워크 IP 자동 감지 (API 사용)
    fetch('/api/network')
      .then(res => res.json())
      .then(data => {
        setNetworkIP(data.ip || 'localhost');
        console.log('Detected network IP:', data.ip);
      })
      .catch(err => {
        console.error('Error fetching IP:', err);
        setNetworkIP('localhost');
      });
  }, []);

  // Room will be created when user clicks "연결 시작" button
  // No auto-connection on mount

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
      // Cleanup peer connection on unmount
      if (peerConnection) {
        peerConnection.disconnect();
      }
    };
  }, [peerConnection]);

  const handleFilesSelected = async (files: File[]) => {
    // Append new files to existing ones instead of replacing
    setSelectedFiles(prev => [...prev, ...files]);
    // Don't start transfer automatically - wait for user to click transfer button
  };

  const createZipFile = async (files: File[]): Promise<File> => {
    const zip = new JSZip();

    // Add all files to the zip
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      zip.file(file.name, arrayBuffer);
    }

    // Generate the zip file
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 } // Medium compression for speed
    });

    // Create a File object from the Blob
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const zipFileName = `files_${timestamp}.zip`;
    return new File([zipBlob], zipFileName, { type: 'application/zip' });
  };

  const handleSendFiles = async () => {
    if (!peerConnection) {
      setConnectionStatus('연결을 먼저 설정해주세요');
      alert('수신자와의 연결이 필요합니다. 공유 버튼을 눌러 QR코드를 공유하세요.');
      return;
    }

    if (!peerConnection.isConnected()) {
      setConnectionStatus('수신자 연결 대기 중...');
      alert('수신자가 아직 연결되지 않았습니다. QR코드를 스캔하거나 링크를 열어주세요.');
      return;
    }

    if (selectedFiles.length === 0) {
      setConnectionStatus('파일을 먼저 선택해주세요');
      return;
    }

    try {
      let filesToSend: File[];

      // If multiple files, create a ZIP
      if (selectedFiles.length > 1) {
        setConnectionStatus('파일 압축 중...');
        setIsCompressing(true);
        const zipFile = await createZipFile(selectedFiles);
        filesToSend = [zipFile];
        setIsCompressing(false);
        console.log(`Created ZIP file: ${zipFile.name} (${formatBytes(zipFile.size)})`);
      } else {
        filesToSend = selectedFiles;
      }

      setConnectionStatus('파일 전송 중...');
      await startFileTransfer(filesToSend);
      setConnectionStatus('전송 완료');
    } catch (error) {
      console.error('Transfer error:', error);
      setConnectionStatus('전송 실패');
      setIsCompressing(false);
      alert('파일 전송 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  const initializeSharing = async () => {
    console.log('=== initializeSharing called ===');
    console.log('shareCode:', shareCode);
    console.log('peerConnection:', peerConnection);
    console.log('isWaitingForPeer:', isWaitingForPeer);
    console.log('peerConnected:', peerConnected);
    
    if (!shareCode) {
      console.log('❌ No share code, skipping initialization');
      return;
    }

    if (peerConnection && peerConnection.isConnected()) {
      console.log('✅ Already connected, skipping initialization');
      return;
    }

    try {
      console.log('🚀 Starting initialization with code:', shareCode);
      
      // Clean up old connection if exists
      if (peerConnection) {
        console.log('🧹 Cleaning up old peer connection...');
        peerConnection.disconnect();
        setPeerConnection(null);
        // Wait a bit for cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      setIsWaitingForPeer(true);
      setPeerConnected(false);
      setConnectionStatus("공유 준비 중...");
      console.log('📝 State updated: waiting for peer');

      // Create room in signaling server (will reset if exists)
      console.log('Creating/resetting room...');
      const createResponse = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-room', code: shareCode }),
      });

      const createData = await createResponse.json();
      console.log('Create room response:', createData);

      if (!createData.success) {
        throw new Error('Failed to create room');
      }

      // Initialize peer connection as initiator
      console.log('Initializing peer connection as offerer...');
      const peer = new PeerConnection(true);
      setPeerConnection(peer);

      peer.onProgressCallback((progress) => {
        setTransfers(prev =>
          prev.map((t, index) =>
            index === 0 ? { ...t, progress, status: "transferring" as const } : t
          )
        );
      });

      // Set up connection callback
      peer.onConnectedCallback(() => {
        console.log('✅ Sender: P2P connection established');
        setPeerConnected(true);
        setIsWaitingForPeer(false);
        setConnectionStatus("수신자와 연결됨 - 파일 전송 준비 완료");
        // Don't auto-start transfer - wait for user action
      });

      // Generate offer
      console.log('Generating WebRTC offer...');
      const offer = await peer.initialize();

      if (!offer) {
        throw new Error('Failed to generate WebRTC offer');
      }

      console.log('✅ Offer generated successfully');
      console.log('Offer type:', JSON.parse(offer).type);
      console.log('Offer length:', offer.length);

      // Send offer to signaling server
      console.log('Sending offer to signaling server...');
      const offerResponse = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-offer',
          code: shareCode,
          data: offer
        }),
      });

      if (!offerResponse.ok) {
        const errorData = await offerResponse.json();
        throw new Error(`Failed to send offer: ${errorData.error}`);
      }

      const offerData = await offerResponse.json();
      console.log('✅ Offer sent successfully:', offerData);

      setConnectionStatus("수신자를 기다리는 중...");
      console.log('Waiting for answer from receiver...');

      let pollCount = 0;
      const maxPolls = 120; // 2 minutes

      // Poll for answer
      const pollInterval = setInterval(async () => {
        pollCount++;
        
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          console.error('❌ Polling timeout - no answer received');
          setIsWaitingForPeer(false);
          setConnectionStatus("연결 시간 초과");
          return;
        }

        if (pollCount % 10 === 0) {
          console.log(`Polling for answer... (${pollCount}/${maxPolls})`);
        }

        try {
          const response = await fetch('/api/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get-answer', code: shareCode }),
          });

          const data = await response.json();

          if (data.success && data.answer) {
            clearInterval(pollInterval);
            console.log('✅ Answer received from receiver!');

            let parsedAnswer;
            try {
              parsedAnswer = JSON.parse(data.answer);
              console.log('Answer type:', parsedAnswer.type);
              console.log('Answer has SDP:', !!parsedAnswer.sdp);
            } catch (e) {
              console.error('Failed to parse answer:', e);
              setIsWaitingForPeer(false);
              setConnectionStatus("연결 실패: 잘못된 응답 형식");
              return;
            }

            console.log('Applying answer to peer connection...');
            peer.connectToPeer(data.answer);

            // Set a timeout for connection
            const connectionTimeout = setTimeout(() => {
              if (!peer.isConnected()) {
                console.error('⏱️ Connection timeout after receiving answer');
                setIsWaitingForPeer(false);
                setConnectionStatus("연결 시간 초과 - 네트워크를 확인해주세요");
              }
            }, 10000);

            // Check connection status periodically
            let checkCount = 0;
            const checkInterval = setInterval(() => {
              checkCount++;
              if (peer.isConnected()) {
                console.log('🎉 P2P Connection established successfully!');
                clearInterval(checkInterval);
                clearTimeout(connectionTimeout);
                setPeerConnected(true);
                setIsWaitingForPeer(false);
                setConnectionStatus("수신자와 연결됨 - 파일 전송 준비 완료");
              } else if (checkCount >= 20) {
                clearInterval(checkInterval);
                console.log('⏳ Connection still pending after 10 seconds');
              } else {
                console.log(`⏳ Checking connection... (${checkCount}/20)`);
              }
            }, 500);
          }
        } catch (error) {
          console.error('Error polling for answer:', error);
        }
      }, 1000);

    } catch (error) {
      console.error('❌ Error initializing sharing:', error);
      setIsWaitingForPeer(false);
      setPeerConnected(false);
      
      let errorMessage = "연결 실패";
      if (error instanceof Error) {
        errorMessage = `연결 실패: ${error.message}`;
        console.error('Error details:', error.stack);
      }
      
      setConnectionStatus(errorMessage);
      alert(`연결에 실패했습니다.\n\n${errorMessage}\n\n다시 시도해주세요.`);
    }
  };

  const startFileTransfer = async (files: File[]) => {
    if (!peerConnection || !peerConnection.isConnected()) {
      console.log('Peer not connected yet. Please share the code with receiver first.');
      setConnectionStatus('수신자 연결 대기 중...');
      return;
    }

    // Create transfer entries (append to existing ones for multiple batches)
    const newTransfers = files.map((file, index) => ({
      id: `transfer-${Date.now()}-${index}`,
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      speed: 0,
      status: "pending" as const,
    }));

    setTransfers(prev => [...prev, ...newTransfers]);

    const startIndex = transfers.length;

    // Send files sequentially
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const transferIndex = startIndex + i;

      // Check if connection is still alive
      if (!peerConnection.isConnected()) {
        console.error('Connection lost during transfer');
        setConnectionStatus('연결이 끊어졌습니다');
        setTransfers(prev =>
          prev.map((t, index) =>
            index >= transferIndex ? { ...t, status: "failed" as const } : t
          )
        );
        break;
      }

      setTransfers(prev =>
        prev.map((t, index) =>
          index === transferIndex ? { ...t, status: "transferring" as const } : t
        )
      );

      try {
        // Set progress callback for this specific file
        peerConnection.onProgressCallback((progress) => {
          setTransfers(prev =>
            prev.map((t, index) =>
              index === transferIndex ? { ...t, progress } : t
            )
          );
        });

        await peerConnection.sendFile(file);

        setTransfers(prev =>
          prev.map((t, index) =>
            index === transferIndex ? { ...t, progress: 100, status: "completed" as const } : t
          )
        );
      } catch (error) {
        console.error('Error sending file:', error);
        setTransfers(prev =>
          prev.map((t, index) =>
            index === transferIndex ? { ...t, status: "failed" as const } : t
          )
        );

        // Continue with next file even if one fails
        continue;
      }
    }

    // Don't clear selected files - keep them visible
    // User can manually remove them if needed
  };

  const handleStartSharing = () => {
    if (!isWaitingForPeer && !peerConnected) {
      initializeSharing();
    }
  };

  const shareUrl = shareCode ? getShareUrl(shareCode, networkIP) : "";

  return (
    <main className="min-h-screen p-6 md:p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <Globe className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">툴비공유기</h1>
          <span className="text-sm text-zinc-500">P2P 파일 공유</span>
        </div>

        <div className="flex items-center space-x-4">
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
                  {peerConnection ? '연결 대기 중...' : '초기화 중...'}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {isWaitingForPeer && (
              <div className="text-xs text-zinc-500">
                수신자: {shareUrl}
              </div>
            )}
            {!peerConnected && !isWaitingForPeer && (
              <button
                onClick={() => {
                  console.log('Manual connection triggered');
                  initializeSharing();
                }}
                className="text-sm px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                🚀 연결 시작
              </button>
            )}
            {isWaitingForPeer && (
              <button
                onClick={() => {
                  console.log('Reconnect triggered');
                  initializeSharing();
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
              >
                🔄 재연결
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. File Upload Section */}
        <div className="space-y-6 order-1">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                파일 선택
              </h2>
              {peerConnected ? (
                <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-500">
                  ✅ 수신자 연결됨
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-500">
                  ⏳ 수신자 대기 중
                </span>
              )}
            </div>
            <FileUploader
              onFilesSelected={handleFilesSelected}
              onClearAll={() => setSelectedFiles([])}
              onRemoveFile={(index) => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
              selectedFiles={selectedFiles}
              disabled={false}
            />

            {/* Send Button */}
            {selectedFiles.length > 0 && (
              <div className="mt-4 flex items-center justify-between p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <div>
                  <p className="text-sm text-white">
                    {selectedFiles.length}개 파일 선택됨
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatBytes(selectedFiles.reduce((acc, file) => acc + file.size, 0))}
                  </p>
                  {selectedFiles.length > 1 && (
                    <p className="text-xs text-blue-400 mt-1">
                      💡 ZIP 파일로 압축하여 전송됩니다
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSendFiles}
                  disabled={!peerConnected || isCompressing}
                  className={cn(
                    "px-6 py-2 rounded-xl font-medium transition-all flex items-center space-x-2",
                    peerConnected && !isCompressing
                      ? "bg-blue-500 hover:bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                  )}
                >
                  {isCompressing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>압축 중...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>{peerConnected ? "파일 전송" : "연결 대기 중"}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Transfer List */}
          {transfers.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  전송 목록
                </h2>
                <button
                  onClick={() => setTransfers([])}
                  className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                >
                  모두 삭제
                </button>
              </div>
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

        {/* 2. Share Code & QR Section */}
        <div className="space-y-6 order-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              공유 정보
            </h2>

            {/* QR Code */}
            {shareUrl && (
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-white rounded-xl">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}`}
                    alt="QR Code"
                    className="w-36 h-36"
                  />
                </div>
              </div>
            )}

            {/* Share Code */}
            <div className="mb-4">
              <p className="text-xs text-zinc-500 mb-2">공유 코드</p>
              <div className="flex items-center justify-center space-x-2">
                <div className="px-4 py-2 bg-zinc-800 rounded-xl">
                  <span className="text-xl font-mono font-bold text-white tracking-wider">
                    {shareCode.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Share URL */}
            {shareUrl && (
              <div>
                <p className="text-xs text-zinc-500 mb-2">공유 링크</p>
                <div className="px-3 py-2 bg-zinc-800 rounded-lg overflow-hidden">
                  <p className="text-xs text-white truncate">{shareUrl}</p>
                </div>
              </div>
            )}

            {peerConnected && (
              <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-green-500 font-medium">
                    수신자 연결됨
                  </span>
                </div>
              </div>
            )}

            <div className="mt-4 p-3 rounded-lg bg-zinc-800/50">
              <p className="text-xs text-zinc-500">
                💡 모바일에서 QR코드를 스캔하거나 같은 WiFi에서 링크를 열어주세요
              </p>
            </div>
          </div>
        </div>

        {/* 3. Instructions Section */}
        <div className="space-y-6 order-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              사용 방법
            </h2>
            <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-xs font-bold">
                  1
                </div>
                <div>
                  <p className="text-sm text-white font-medium">공유 코드 생성</p>
                  <p className="text-xs text-zinc-500">상단의 공유 버튼을 눌러 QR코드와 링크 생성</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-xs font-bold">
                  2
                </div>
                <div>
                  <p className="text-sm text-white font-medium">수신자 연결</p>
                  <p className="text-xs text-zinc-500">수신자가 QR코드 스캔 또는 링크로 접속</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-xs font-bold">
                  3
                </div>
                <div>
                  <p className="text-sm text-white font-medium">파일 선택</p>
                  <p className="text-xs text-zinc-500">전송할 파일을 드래그 또는 클릭하여 선택</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-xs font-bold">
                  4
                </div>
                <div>
                  <p className="text-sm text-white font-medium">파일 전송</p>
                  <p className="text-xs text-zinc-500">"파일 전송" 버튼을 클릭하여 전송 시작</p>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Debug Info */}
      <div className="mt-6 p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/50">
        <p className="text-xs text-zinc-600 mb-2">디버그 정보:</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-zinc-500">공유 코드: {shareCode}</p>
            <p className="text-xs text-zinc-500">연결 상태: {peerConnected ? '✅ 연결됨' : '❌ 끊김'}</p>
            <p className="text-xs text-zinc-500">대기 중: {isWaitingForPeer ? '예' : '아니오'}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Peer: {peerConnection ? '있음' : '없음'}</p>
            <p className="text-xs text-zinc-500">네트워크 IP: {networkIP}</p>
            <p className="text-xs text-zinc-500">상태: {connectionStatus || '대기'}</p>
          </div>
        </div>
      </div>

      {/* Network Info */}
      <NetworkInfo />
    </main>
  );
}