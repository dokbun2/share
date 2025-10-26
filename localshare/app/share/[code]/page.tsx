"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, CheckCircle, AlertCircle, Loader2, Wifi } from "lucide-react";
import { PeerConnection } from "@/app/lib/webrtc/peer-connection";
import { formatBytes } from "@/app/lib/utils/format";

export default function ShareReceivePage() {
  const params = useParams();
  const code = params.code as string;

  const [status, setStatus] = useState<'connecting' | 'waiting' | 'receiving' | 'completed' | 'error'>('connecting');
  const [progress, setProgress] = useState(0);
  const [receivedFiles, setReceivedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>("");
  const [peerConnection, setPeerConnection] = useState<PeerConnection | null>(null);

  useEffect(() => {
    if (code) {
      initializeReceiver();
    }

    return () => {
      peerConnection?.disconnect();
    };
  }, [code]);

  const initializeReceiver = async () => {
    try {
      // Check if room exists
      const checkResponse = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-room', code }),
      });

      const checkData = await checkResponse.json();

      if (!checkData.exists) {
        setError('공유 코드를 찾을 수 없습니다. 코드를 확인해주세요.');
        setStatus('error');
        return;
      }

      // Join room
      const joinResponse = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join-room', code }),
      });

      const joinData = await joinResponse.json();

      if (!joinData.success) {
        throw new Error('Failed to join room');
      }

      // Initialize peer connection as answerer
      const peer = new PeerConnection(false);
      setPeerConnection(peer);

      peer.onProgressCallback((progress) => {
        setProgress(progress);
        if (progress > 0 && progress < 100) {
          setStatus('receiving');
        }
      });

      peer.onFileReceivedCallback((file) => {
        setReceivedFiles(prev => [...prev, file]);
        setStatus('completed');

        // Auto-download the file
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });

      // Wait for offer if not available yet
      let offer = joinData.offer;
      if (!offer) {
        setStatus('waiting');

        // Poll for offer
        const pollInterval = setInterval(async () => {
          const pollResponse = await fetch('/api/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'check-room', code }),
          });

          const pollData = await pollResponse.json();

          if (pollData.hasOffer) {
            clearInterval(pollInterval);

            const offerResponse = await fetch(`/api/signal?code=${code}&type=status`);
            const offerData = await offerResponse.json();

            if (offerData.room?.offer) {
              offer = offerData.room.offer;
              connectToPeer(peer, offer);
            }
          }
        }, 1000);

        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(pollInterval);
          if (status === 'waiting') {
            setError('연결 시간이 초과되었습니다.');
            setStatus('error');
          }
        }, 30000);
      } else {
        connectToPeer(peer, offer);
      }
    } catch (error) {
      console.error('Error initializing receiver:', error);
      setError('연결 중 오류가 발생했습니다.');
      setStatus('error');
    }
  };

  const connectToPeer = async (peer: PeerConnection, offer: string) => {
    try {
      // Generate answer
      const answer = await peer.initialize(JSON.parse(offer));

      // Send answer to signaling server
      await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-answer',
          code,
          data: answer
        }),
      });

      setStatus('waiting');
    } catch (error) {
      console.error('Error connecting to peer:', error);
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
          {status === 'connecting' && (
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
              <p className="text-white font-medium">연결 확인 중...</p>
              <p className="text-sm text-zinc-500 mt-2">공유 코드를 확인하고 있습니다</p>
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

          {status === 'completed' && (
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-white font-medium mb-4">파일 수신 완료!</p>

              <div className="space-y-2">
                {receivedFiles.map((file, index) => (
                  <div key={index} className="p-3 rounded-lg bg-zinc-800 text-left">
                    <p className="text-sm font-medium text-white truncate">{file.name}</p>
                    <p className="text-xs text-zinc-500">{formatBytes(file.size)}</p>
                  </div>
                ))}
              </div>

              <p className="text-sm text-zinc-500 mt-4">
                파일이 자동으로 다운로드되었습니다
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-white font-medium mb-2">연결 실패</p>
              <p className="text-sm text-zinc-500">{error}</p>
            </div>
          )}
        </div>

        <div className="mt-6 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
          <p className="text-xs text-zinc-500 text-center">
            💡 팁: 송신자와 같은 WiFi 네트워크에 연결되어 있어야 합니다
          </p>
        </div>
      </div>
    </main>
  );
}