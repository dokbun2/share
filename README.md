# LocalShare - P2P 파일 공유 시스템

동일한 WiFi 네트워크에서 브라우저를 통해 파일을 직접 전송하는 P2P 파일 공유 애플리케이션입니다.

## 🚀 주요 기능

- **P2P 직접 전송**: WebRTC를 활용한 브라우저 간 직접 파일 전송
- **대용량 파일 지원**: 최대 10GB 파일 전송 가능
- **실시간 진행률**: 전송 속도 및 남은 시간 표시
- **QR 코드 공유**: 간편한 연결을 위한 QR 코드 생성
- **애플 스타일 UI**: 미니멀한 다크 테마 디자인

## 🛠 기술 스택

- **Frontend**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS, shadcn/ui
- **Icons**: Lucide React
- **P2P**: WebRTC, Simple Peer
- **Deployment**: Vercel

## 📦 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 서버 실행
npm start
```

## 🌐 배포

Vercel을 통해 자동 배포됩니다:

```bash
vercel
```

## 📱 사용 방법

1. 같은 WiFi 네트워크에 연결된 디바이스에서 웹사이트 접속
2. 파일을 드래그 앤 드롭 또는 클릭하여 선택
3. 연결할 디바이스 선택
4. 전송 시작

## 🔒 보안

- WebRTC의 DTLS-SRTP 암호화 사용
- 로컬 네트워크에서만 작동
- 서버에 파일 저장 없음

## 📄 라이선스

ISC License