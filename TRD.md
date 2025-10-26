# Technical Requirements Document (TRD)
## LocalShare - 기술 구현 명세서

### 1. 시스템 아키텍처

#### 1.1 전체 구조
```
┌─────────────┐     WebRTC/WebSocket    ┌─────────────┐
│   Client A  │ ←──────────────────────→ │   Client B  │
│  (Browser)  │                          │  (Browser)  │
└──────┬──────┘                          └──────┬──────┘
       │                                         │
       │         ┌──────────────┐              │
       └────────→│ Signal Server │←─────────────┘
                 │   (Vercel)    │
                 └──────────────┘
```

#### 1.2 기술 스택
- **Frontend**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **P2P Communication**: WebRTC
- **Signaling**: Socket.io / WebSocket
- **State Management**: Zustand
- **UI Components**: shadcn/ui
- **File Handling**: File API, Streams API
- **Deployment**: Vercel

### 2. 핵심 기술 구현

#### 2.1 WebRTC P2P 연결

##### 2.1.1 시그널링 서버
```typescript
// Vercel Edge Function으로 구현
interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

// 연결 플로우:
// 1. 피어 A가 offer 생성
// 2. 시그널 서버를 통해 피어 B로 전송
// 3. 피어 B가 answer 생성 및 반환
// 4. ICE candidates 교환
// 5. P2P 연결 확립
```

##### 2.1.2 STUN/TURN 서버
```javascript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // TURN 서버는 필요시 추가 (Twilio/Xirsys)
];
```

#### 2.2 파일 전송 메커니즘

##### 2.2.1 대용량 파일 처리
```typescript
interface FileChunk {
  id: string;
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  data: ArrayBuffer;
  checksum: string;
}

// 청크 크기: 64KB (조정 가능)
const CHUNK_SIZE = 64 * 1024;

// 파일 분할 및 전송
async function sendFile(file: File, dataChannel: RTCDataChannel) {
  const chunks = await splitFileIntoChunks(file);
  for (const chunk of chunks) {
    await sendChunk(dataChannel, chunk);
  }
}
```

##### 2.2.2 전송 프로토콜
```typescript
interface TransferProtocol {
  // 메타데이터 전송
  sendMetadata(file: FileMetadata): Promise<void>;

  // 청크 전송 with 재시도 로직
  sendChunk(chunk: FileChunk): Promise<void>;

  // 무결성 검증
  verifyTransfer(checksum: string): Promise<boolean>;
}
```

#### 2.3 보안 구현

##### 2.3.1 암호화
- WebRTC 내장 DTLS-SRTP 암호화 사용
- 선택적 추가 암호화 레이어 (Web Crypto API)

##### 2.3.2 인증
```typescript
// 공유 코드 생성 (6자리)
function generateShareCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 연결 인증
interface AuthenticationFlow {
  shareCode: string;
  expiresAt: Date;
  maxConnections: number;
}
```

### 3. 프로젝트 구조

```
localshare/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── api/
│   │   └── signal/
│   │       └── route.ts      # WebSocket 시그널링
│   └── components/
│       ├── FileUploader.tsx
│       ├── PeerList.tsx
│       ├── TransferProgress.tsx
│       └── QRShare.tsx
├── lib/
│   ├── webrtc/
│   │   ├── connection.ts     # P2P 연결 관리
│   │   ├── signaling.ts      # 시그널링 로직
│   │   └── transfer.ts       # 파일 전송 로직
│   ├── utils/
│   │   ├── file.ts           # 파일 처리 유틸
│   │   └── crypto.ts         # 암호화 유틸
│   └── store/
│       └── transfer.ts       # 전송 상태 관리
├── public/
├── styles/
│   └── globals.css
├── package.json
├── next.config.js
└── vercel.json
```

### 4. API 설계

#### 4.1 시그널링 API
```typescript
// POST /api/signal/offer
interface OfferRequest {
  from: string;
  to: string;
  offer: RTCSessionDescriptionInit;
}

// POST /api/signal/answer
interface AnswerRequest {
  from: string;
  to: string;
  answer: RTCSessionDescriptionInit;
}

// WebSocket Events
ws.on('peer:join', (peerId: string) => {});
ws.on('peer:leave', (peerId: string) => {});
ws.on('signal:offer', (data: OfferRequest) => {});
ws.on('signal:answer', (data: AnswerRequest) => {});
ws.on('signal:ice', (candidate: RTCIceCandidate) => {});
```

### 5. 데이터 모델

```typescript
interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  checksum: string;
}

interface Transfer {
  id: string;
  files: FileMetadata[];
  peerId: string;
  status: 'pending' | 'connecting' | 'transferring' | 'completed' | 'failed';
  progress: number;
  speed: number; // bytes/sec
  startedAt: Date;
  completedAt?: Date;
}

interface Peer {
  id: string;
  name: string;
  connected: boolean;
  connection?: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
}
```

### 6. 성능 최적화

#### 6.1 스트리밍 처리
- File Streams API 활용
- 메모리 효율적인 청크 처리
- Backpressure 관리

#### 6.2 네트워크 최적화
- Adaptive bitrate 조정
- 병렬 데이터 채널 활용
- 연결 품질 모니터링

### 7. 브라우저 호환성

```javascript
// 기능 감지
const isWebRTCSupported = () => {
  return !!(
    window.RTCPeerConnection &&
    window.RTCDataChannel &&
    window.RTCSessionDescription
  );
};

const isFileAPISupported = () => {
  return !!(
    window.File &&
    window.FileReader &&
    window.FileList &&
    window.Blob
  );
};
```

### 8. 배포 구성

#### 8.1 Vercel 설정
```json
{
  "functions": {
    "app/api/signal/route.ts": {
      "maxDuration": 30
    }
  },
  "rewrites": [
    {
      "source": "/ws",
      "destination": "/api/signal"
    }
  ]
}
```

#### 8.2 환경 변수
```env
# .env.local
NEXT_PUBLIC_APP_URL=https://localshare.vercel.app
NEXT_PUBLIC_WS_URL=wss://localshare.vercel.app/ws
NEXT_PUBLIC_STUN_SERVER=stun:stun.l.google.com:19302
```

### 9. 테스트 전략

#### 9.1 단위 테스트
- 파일 청킹 로직
- 암호화/복호화
- 연결 상태 관리

#### 9.2 통합 테스트
- P2P 연결 설정
- 파일 전송 플로우
- 오류 복구 메커니즘

#### 9.3 E2E 테스트
- 전체 사용자 플로우
- 다양한 파일 크기/타입
- 네트워크 조건 시뮬레이션

### 10. 모니터링 및 로깅

```typescript
interface TransferMetrics {
  transferId: string;
  fileSize: number;
  duration: number;
  averageSpeed: number;
  packetLoss: number;
  errors: Error[];
}

// Vercel Analytics 통합
// 전송 성공률, 평균 속도, 오류 패턴 추적
```

### 11. 제한사항 및 대안

#### 11.1 Vercel 제한사항
- Edge Function 실행 시간: 30초
- WebSocket 지원 제한적
- 대안: Socket.io with polling fallback

#### 11.2 브라우저 제한사항
- 파일 시스템 직접 접근 불가
- 메모리 제한 (대용량 파일)
- 대안: Service Worker + IndexedDB 활용

### 12. 개발 일정

| 단계 | 작업 내용 | 예상 기간 |
|------|----------|-----------|
| 1 | 프로젝트 초기 설정 | 1일 |
| 2 | WebRTC 연결 구현 | 3일 |
| 3 | 파일 전송 로직 | 3일 |
| 4 | UI/UX 구현 | 2일 |
| 5 | 시그널링 서버 | 2일 |
| 6 | 테스트 및 디버깅 | 2일 |
| 7 | Vercel 배포 | 1일 |
| **총계** | | **14일** |