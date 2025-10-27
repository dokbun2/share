"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, CheckCircle, AlertCircle, Loader2, Wifi } from "lucide-react";
import { PeerConnection } from "@/app/lib/webrtc/peer-connection";
import { formatBytes } from "@/app/lib/utils/format";

export default function ShareReceivePage() {
  const params = useParams();
  const code = params.code as string;

  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'waiting' | 'receiving' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [receivedFiles, setReceivedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>("");
  const [peerConnection, setPeerConnection] = useState<PeerConnection | null>(null);

  // Don't auto-connect on mount - wait for user to click button
  // Manual connection only

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (peerConnection) {
        peerConnection.disconnect();
      }
    };
  }, [peerConnection]);

  const initializeReceiver = async () => {
    try {
      console.log('=== initializeReceiver called ===');
      console.log('🔵 Code:', code);
      console.log('Current status:', status);
      console.log('peerConnection:', peerConnection);

      // If already connected, don't reinitialize
      if (peerConnection && peerConnection.isConnected()) {
        console.log('✅ Already connected, skipping initialization');
        return;
      }

      // Clean up old connection if exists
      if (peerConnection) {
        console.log('🧹 Cleaning up old peer connection...');
        peerConnection.disconnect();
        setPeerConnection(null);
        // Wait a bit for cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setStatus('connecting');
      setError('');

      // Check if room exists
      console.log('=== Checking if room exists ===');
      console.log('Room code:', code);
      const checkResponse = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-room', code }),
      });

      const checkData = await checkResponse.json();
      console.log('Room check response:', JSON.stringify(checkData, null, 2));

      if (!checkData.exists) {
        console.error('❌ Room not found');
        console.error('Code used:', code);
        console.error('Make sure sender created the room with this exact code');
        setError('송신자가 아직 연결을 시작하지 않았습니다. 송신자가 먼저 "연결 시작" 버튼을 눌러주세요.');
        setStatus('error');
        return;
      }

      console.log('✅ Room found! Proceeding to join...');

      // Join room
      console.log('Joining room...');
      const joinResponse = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join-room', code }),
      });

      const joinData = await joinResponse.json();
      console.log('Join room response:', joinData);

      if (!joinData.success) {
        throw new Error('Failed to join room');
      }

      // Initialize peer connection as answerer
      console.log('Creating peer connection as answerer...');
      const peer = new PeerConnection(false);
      setPeerConnection(peer);

      // Set up connection callback
      peer.onConnectedCallback(() => {
        console.log('✅ Receiver: P2P connection established!');
        setStatus('connected');
        // Status will be updated to 'waiting' once files are being transferred
      });

      peer.onProgressCallback((progress) => {
        setProgress(progress);
        if (progress > 0 && progress < 100) {
          setStatus('receiving');
        }
      });

      peer.onFileReceivedCallback((file) => {
        setReceivedFiles(prev => [...prev, file]);
        // Keep status as waiting for more files
        setStatus('waiting');
        setProgress(0); // Reset progress for next file

        // Auto-download the file
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Show that file was received but stay ready for more
        console.log(`✅ File received and downloaded: ${file.name}`);

        // Brief visual feedback then back to waiting
        setTimeout(() => {
          if (peer?.isConnected()) {
            setStatus('waiting');
          }
        }, 1000);
      });

      // Wait for offer if not available yet
      let offer = joinData.offer;
      if (!offer) {
        setStatus('waiting');
        console.log('No offer yet, polling...');

        let pollCount = 0;
        const maxPolls = 30; // 30 seconds

        // Poll for offer
        const pollInterval = setInterval(async () => {
          pollCount++;
          console.log(`Polling for offer... (${pollCount}/${maxPolls})`);

          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            console.error('Polling timeout');
            setError('연결 시간이 초과되었습니다.');
            setStatus('error');
            return;
          }

          try {
            const pollResponse = await fetch('/api/signal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'check-room', code }),
            });

            const pollData = await pollResponse.json();
            console.log('Poll response:', pollData);

            if (pollData.hasOffer) {
              clearInterval(pollInterval);
              console.log('Offer found! Fetching full room data...');

              const offerResponse = await fetch(`/api/signal?code=${code}`);
              const offerData = await offerResponse.json();
              console.log('Room data:', offerData);

              if (offerData.room?.offer) {
                offer = offerData.room.offer;
                connectToPeer(peer, offer);
              } else {
                console.error('Offer not found in room data');
                setError('Offer를 가져올 수 없습니다.');
                setStatus('error');
              }
            }
          } catch (error) {
            console.error('Polling error:', error);
          }
        }, 1000);
      } else {
        console.log('Offer available immediately, connecting...');
        connectToPeer(peer, offer);
      }
    } catch (error) {
      console.error('❌ Error initializing receiver:', error);

      let errorMessage = '연결 중 오류가 발생했습니다.';
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error('Error details:', error.stack);
      }

      setError(errorMessage);
      setStatus('error');
    }
  };

  const connectToPeer = async (peer: PeerConnection, offer: string) => {
    try {
      console.log('📨 Received offer, generating answer...');
      console.log('Offer:', offer.substring(0, 50) + '...');

      // Generate answer
      const answer = await peer.initialize(JSON.parse(offer));
      console.log('✅ Answer generated:', answer?.substring(0, 50) + '...');

      // Send answer to signaling server
      console.log('Sending answer to signaling server...');
      const response = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-answer',
          code,
          data: answer
        }),
      });

      const responseData = await response.json();
      console.log('Send answer response:', responseData);

      if (responseData.success) {
        console.log('✅ Answer sent successfully, waiting for connection...');
        // Give it a moment for the connection to establish
        setTimeout(() => {
          if (peer.isConnected()) {
            console.log('🎉 Connection confirmed!');
            setStatus('connected');
            setTimeout(() => setStatus('waiting'), 1000);
          } else {
            console.log('⏳ Still waiting for connection...');
            setStatus('waiting');
          }
        }, 1000);
      } else {
        throw new Error('Failed to send answer');
      }
      // Connection event will be handled by the callback
    } catch (error) {
      console.error('❌ Error connecting to peer:', error);
      setError('P2P 연결에 실패했습니다.');
      setStatus('error');
    }
  };

  return (
    <main className="min-h-screen p-6 md:p-8 flex items-center justify-center">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">파일 수신</h1>
          <p className="text-zinc-500">공유 코드: {code.toUpperCase()}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
          {status === 'idle' && (
            <div className="text-center">
              <Wifi className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
              <p className="text-white font-medium mb-4">연결 준비</p>
              <p className="text-sm text-zinc-500 mb-6">
                송신자가 "연결 시작" 버튼을 누른 후<br/>
                아래 버튼을 눌러 연결하세요
              </p>
              <button
                onClick={() => initializeReceiver()}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                🔗 연결하기
              </button>
            </div>
          )}

          {status === 'connecting' && (
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
              <p className="text-white font-medium">연결 확인 중...</p>
              <p className="text-sm text-zinc-500 mt-2">공유 코드를 확인하고 있습니다</p>
            </div>
          )}

          {status === 'connected' && (
            <div className="text-center">
              <div className="relative mx-auto w-16 h-16 mb-4">
                <Wifi className="w-16 h-16 text-blue-500" />
                <CheckCircle className="w-6 h-6 text-green-500 absolute -bottom-1 -right-1" />
              </div>
              <p className="text-white font-medium">P2P 연결 성공!</p>
              <p className="text-sm text-zinc-500 mt-2">파일 전송 준비가 완료되었습니다</p>
            </div>
          )}

          {status === 'waiting' && (
            <div className="text-center">
              <div className="relative mx-auto w-16 h-16 mb-4">
                <Wifi className="w-16 h-16 text-green-500" />
                <div className="absolute inset-0 w-16 h-16 rounded-full bg-green-500/20 animate-ping" />
              </div>
              <p className="text-white font-medium">파일 전송 대기 중...</p>
              <p className="text-sm text-zinc-500 mt-2">송신자가 파일을 선택하면 자동으로 다운로드됩니다</p>

              {!peerConnection?.isConnected() && (
                <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-xs text-yellow-500 mb-2">⚠️ P2P 연결이 완료되지 않았습니다</p>
                  <button
                    onClick={() => {
                      console.log('Manual reconnect from waiting state');
                      setStatus('idle');
                      setError('');
                      if (peerConnection) {
                        peerConnection.disconnect();
                        setPeerConnection(null);
                      }
                    }}
                    className="text-xs px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white font-medium transition-colors"
                  >
                    🔄 다시 연결하기
                  </button>
                </div>
              )}
            </div>
          )}

          {status === 'receiving' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center mb-4">
                <Download className="w-12 h-12 text-blue-500 animate-bounce" />
              </div>
              <p className="text-white font-medium text-center">파일 수신 중...</p>

              <div className="relative">
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="absolute right-0 -bottom-5 text-xs text-zinc-500">
                  {progress.toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          {receivedFiles.length > 0 && (status === 'connected' || status === 'waiting') && (
            <div className="space-y-4">
              <div className="text-center">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="text-white font-medium">파일 수신 완료</p>
                <p className="text-sm text-zinc-500 mt-1">
                  {receivedFiles.length}개 파일 다운로드됨
                </p>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto">
                {receivedFiles.map((file, index) => (
                  <div key={index} className="flex items-center space-x-2 p-2 rounded-lg bg-zinc-800/50">
                    <Download className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span className="text-xs text-zinc-400 truncate flex-1">{file.name}</span>
                    <span className="text-xs text-zinc-500">({formatBytes(file.size)})</span>
                  </div>
                ))}
              </div>

              <div className="text-center pt-2 border-t border-zinc-800">
                <div className="flex items-center justify-center space-x-2">
                  <Wifi className="w-4 h-4 text-blue-500 animate-pulse" />
                  <p className="text-xs text-zinc-500">
                    연결 유지 중 - 추가 파일 대기
                  </p>
                </div>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-white font-medium mb-2">연결 실패</p>
              <p className="text-sm text-zinc-500 mb-4">{error}</p>
              <button
                onClick={() => {
                  setStatus('idle');
                  setError('');
                }}
                className="px-6 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                💡 팁: 송신자와 같은 WiFi 네트워크에 연결되어 있어야 합니다
              </p>
              {status !== 'connecting' && status !== 'idle' && (
                <button
                  onClick={() => {
                    console.log('Manual reconnect triggered');
                    setStatus('idle');
                    setError('');
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                >
                  🔄 초기화
                </button>
              )}
            </div>
          </div>

          {/* Debug info */}
          <div className="p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/50">
            <p className="text-xs text-zinc-600 mb-1">디버그 정보:</p>
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">상태: {status}</p>
              <p className="text-xs text-zinc-500">연결: {peerConnection ? (peerConnection.isConnected() ? '✅ 연결됨' : '❌ 끊김') : '⚪ 없음'}</p>
              <p className="text-xs text-zinc-500">코드: {code}</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
