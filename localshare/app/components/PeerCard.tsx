"use client";

import { Monitor, Smartphone, Tablet, Wifi, WifiOff, CheckCircle2 } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";

interface PeerCardProps {
  id: string;
  name: string;
  deviceType?: "desktop" | "mobile" | "tablet";
  connected: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

export default function PeerCard({
  name,
  deviceType = "desktop",
  connected,
  selected,
  onSelect,
}: PeerCardProps) {
  const getDeviceIcon = () => {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="w-5 h-5" />;
      case "tablet":
        return <Tablet className="w-5 h-5" />;
      default:
        return <Monitor className="w-5 h-5" />;
    }
  };

  return (
    <button
      onClick={onSelect}
      disabled={!connected}
      className={cn(
        "relative p-4 rounded-2xl transition-all duration-300 border-2",
        connected
          ? "hover:scale-105 cursor-pointer"
          : "opacity-50 cursor-not-allowed",
        selected
          ? "border-white bg-white/10 shadow-lg shadow-white/10"
          : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/80"
      )}
    >
      {selected && (
        <div className="absolute -top-2 -right-2">
          <div className="rounded-full bg-green-500 p-1">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
        </div>
      )}

      <div className="flex flex-col items-center space-y-3">
        <div className={cn(
          "p-4 rounded-full",
          selected ? "bg-white/20" : "bg-zinc-800"
        )}>
          <div className={cn(
            "text-zinc-400",
            selected && "text-white"
          )}>
            {getDeviceIcon()}
          </div>
        </div>

        <div className="text-center">
          <h3 className="font-medium text-white text-sm">{name}</h3>
          <div className="flex items-center justify-center space-x-1 mt-1">
            {connected ? (
              <>
                <div className="relative">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
                </div>
                <span className="text-xs text-green-500">연결됨</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-zinc-500" />
                <span className="text-xs text-zinc-500">연결 끊김</span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}