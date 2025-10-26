"use client";

import { useEffect, useState } from "react";
import { Wifi, Info } from "lucide-react";
import { getLocalNetworkIP } from "@/app/lib/utils/network";

export default function NetworkInfo() {
  const [networkIP, setNetworkIP] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getLocalNetworkIP().then(ip => {
      setNetworkIP(ip);
      setIsLoading(false);
    });
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 shadow-lg">
        <div className="flex items-center space-x-2">
          <Wifi className="w-4 h-4 text-green-500" />
          <div className="text-xs">
            {isLoading ? (
              <span className="text-zinc-500">IP 감지 중...</span>
            ) : (
              <span className="text-zinc-400">
                네트워크 IP: <span className="text-white font-mono">{networkIP}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 정보 툴팁 */}
      <div className="group relative">
        <button className="absolute -top-8 -right-2 p-1 rounded-full bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors">
          <Info className="w-3 h-3 text-zinc-500" />
        </button>
        <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 w-72 p-3 bg-zinc-800 rounded-lg shadow-xl border border-zinc-700">
          <p className="text-xs text-zinc-300 leading-relaxed">
            다른 디바이스에서 접속할 때는 <span className="font-mono text-white">http://{networkIP}:3000</span>을 사용하세요.
            같은 WiFi에 연결되어 있어야 합니다.
          </p>
        </div>
      </div>
    </div>
  );
}