export async function getLocalNetworkIP(): Promise<string> {
  try {
    // WebRTC를 이용해 로컬 IP 자동 감지
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.createDataChannel('');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return new Promise((resolve) => {
      const ipRegex = /([0-9]{1,3}\.){3}[0-9]{1,3}/;
      let resolved = false;

      pc.onicecandidate = (event) => {
        if (!resolved && event.candidate && event.candidate.candidate) {
          const matches = event.candidate.candidate.match(ipRegex);
          if (matches) {
            const ip = matches[0];
            // 로컬 IP 주소 패턴 확인 (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
            if (ip.startsWith('192.168.') ||
                ip.startsWith('10.') ||
                (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31)) {
              resolved = true;
              pc.close();
              resolve(ip);
            }
          }
        }
      };

      // 타임아웃 설정 (2초)
      setTimeout(() => {
        if (!resolved) {
          pc.close();
          // fallback: window.location.hostname 사용
          resolve(window.location.hostname);
        }
      }, 2000);
    });
  } catch (error) {
    console.error('Error getting local IP:', error);
    return window.location.hostname;
  }
}

export function getShareUrl(code: string, networkIP?: string): string {
  if (typeof window !== 'undefined') {
    const port = window.location.port || '3000';

    // 이미 네트워크 IP로 접속한 경우 그대로 사용
    if (!window.location.hostname.includes('localhost') &&
        !window.location.hostname.includes('127.0.0.1')) {
      return `${window.location.protocol}//${window.location.host}/share/${code}`;
    }

    // localhost인 경우 네트워크 IP 사용
    const ip = networkIP || window.location.hostname;
    return `http://${ip}:${port}/share/${code}`;
  }
  return '';
}