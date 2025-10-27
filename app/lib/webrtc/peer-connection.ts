import SimplePeer from 'simple-peer';

export interface FileChunk {
  id: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunkIndex: number;
  totalChunks: number;
  data: ArrayBuffer;
}

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
}

const CHUNK_SIZE = 32 * 1024; // 32KB chunks - optimized for speed while avoiding overflow

export class PeerConnection {
  private peer: SimplePeer.Instance | null = null;
  private isInitiator: boolean;
  private onFileReceived?: (file: File) => void;
  private onProgress?: (progress: number) => void;
  private onConnected?: () => void;
  private receivedChunks: Map<string, ArrayBuffer[]> = new Map();
  private fileMetadata: Map<string, FileMetadata> = new Map();
  private connected: boolean = false;

  constructor(isInitiator: boolean) {
    this.isInitiator = isInitiator;
  }

  async initialize(signalData?: any): Promise<string | void> {
    return new Promise((resolve, reject) => {
      this.peer = new SimplePeer({
        initiator: this.isInitiator,
        trickle: false,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // 무료 TURN 서버 추가 (OpenRelay)
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject',
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject',
            },
            {
              urls: 'turn:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelayproject',
              credential: 'openrelayproject',
            },
          ],
          iceTransportPolicy: 'all',
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require',
        },
      });

      this.peer.on('signal', (data) => {
        console.log('Signal generated:', data.type);
        resolve(JSON.stringify(data));
      });

      this.peer.on('connect', () => {
        console.log('✅ P2P connection established!');
        console.log('Data channel open and ready');
        this.connected = true;
        if (this.onConnected) {
          this.onConnected();
        }
      });

      // Add more detailed connection state monitoring
      (this.peer as any)._pc?.addEventListener('iceconnectionstatechange', () => {
        const state = (this.peer as any)._pc?.iceConnectionState;
        console.log(`🔌 ICE Connection State: ${state}`);
        if (state === 'disconnected' || state === 'failed') {
          console.warn('⚠️ ICE connection issue detected');
          this.connected = false;
        } else if (state === 'connected' || state === 'completed') {
          console.log('✅ ICE connection successful');
          // Sometimes 'connect' event doesn't fire, so we set connected here too
          if (!this.connected) {
            console.log('🔧 Setting connected via ICE state (connect event may not have fired)');
            this.connected = true;
            if (this.onConnected) {
              this.onConnected();
            }
          }
        }
      });

      this.peer.on('data', (data: Uint8Array) => {
        console.log('Data received:', data.length, 'bytes');
        this.handleReceivedData(data);
      });

      this.peer.on('error', (err) => {
        console.error('❌ P2P error:', err);
        // Don't disconnect on minor errors
        if (err.message && err.message.includes('Ice connection failed')) {
          console.log('ICE connection issue, but data channel may still work');
        } else if (err.message && err.message.includes('User-Initiated Abort')) {
          console.log('Connection closed by user (normal)');
          this.connected = false;
        } else if (this.connected) {
          console.log('Error occurred but connection is still active');
        } else {
          this.connected = false;
          reject(err);
        }
      });

      // Keep connection alive with periodic pings
      const keepAliveInterval = setInterval(() => {
        if (this.peer && this.peer.connected) {
          try {
            this.peer.send(JSON.stringify({ type: 'ping' }));
          } catch (e) {
            console.log('Keep-alive ping failed:', e);
          }
        } else {
          clearInterval(keepAliveInterval);
        }
      }, 10000); // Ping every 10 seconds

      this.peer.on('close', () => {
        console.log('⚠️ P2P connection closed');
        this.connected = false;
        clearInterval(keepAliveInterval);
      });

      if (signalData) {
        this.peer.signal(signalData);
      }
    });
  }

  connectToPeer(signalData: string) {
    if (this.peer) {
      console.log('Connecting with answer signal...');
      this.peer.signal(JSON.parse(signalData));
    }
  }

  isConnected(): boolean {
    return this.connected && this.peer ? this.peer.connected : false;
  }

  onConnectedCallback(callback: () => void) {
    this.onConnected = callback;
  }

  async sendFile(file: File) {
    if (!this.peer || !this.peer.connected) {
      throw new Error('Peer not connected');
    }

    const fileId = Math.random().toString(36).substring(2, 15);
    const chunks = await this.fileToChunks(file, fileId);

    console.log(`Sending file: ${file.name} (${chunks.length} chunks)`);

    // Send metadata first
    const metadata: FileMetadata = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      totalChunks: chunks.length,
    };

    this.peer.send(JSON.stringify({ type: 'metadata', data: metadata }));

    // Wait a bit for metadata to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    // Send chunks with adaptive batching
    let chunksSent = 0;
    const batchSize = 20; // Increased batch size for better speed

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));

      for (const chunk of batch) {
        await this.sendChunk(chunk);
        chunksSent++;
        if (this.onProgress) {
          this.onProgress((chunksSent / chunks.length) * 100);
        }
      }

      // Only pause if buffer is significantly full
      if (i + batchSize < chunks.length) {
        const dataChannel = (this.peer as any)._channel;
        if (dataChannel && dataChannel.bufferedAmount > 8 * 1024 * 1024) { // 8MB threshold
          const waitTime = Math.min(dataChannel.bufferedAmount / 10000, 200);
          console.log(`Buffer high (${(dataChannel.bufferedAmount / 1024 / 1024).toFixed(1)}MB), pausing ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    console.log(`File sent successfully: ${file.name}`);
  }

  private async fileToChunks(file: File, fileId: string): Promise<FileChunk[]> {
    const chunks: FileChunk[] = [];
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const blob = file.slice(start, end);
      const arrayBuffer = await blob.arrayBuffer();

      chunks.push({
        id: `${fileId}-${i}`,
        fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        chunkIndex: i,
        totalChunks,
        data: arrayBuffer,
      });
    }

    return chunks;
  }

  private async sendChunk(chunk: FileChunk) {
    if (!this.peer) return;

    const chunkData = {
      type: 'chunk',
      data: {
        ...chunk,
        data: Array.from(new Uint8Array(chunk.data)),
      },
    };

    const chunkString = JSON.stringify(chunkData);

    // Check if we can send (with retries for buffer full)
    let retries = 0;
    const maxRetries = 50;

    while (retries < maxRetries) {
      try {
        // Check bufferedAmount to avoid overwhelming the channel
        const dataChannel = (this.peer as any)._channel;
        if (dataChannel && dataChannel.bufferedAmount > 16 * 1024 * 1024) { // 16MB threshold
          console.log(`Buffer full (${dataChannel.bufferedAmount} bytes), waiting...`);
          await new Promise(resolve => setTimeout(resolve, 100));
          retries++;
          continue;
        }

        this.peer.send(chunkString);
        break; // Successfully sent
      } catch (error: any) {
        if (error.message && error.message.includes('queue is full')) {
          console.log(`Send queue full, retry ${retries + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, 50 + retries * 10)); // Progressive delay
          retries++;
        } else {
          throw error; // Re-throw if it's not a queue full error
        }
      }
    }

    if (retries >= maxRetries) {
      throw new Error('Failed to send chunk: queue consistently full');
    }

    // Minimal delay for speed - only if buffer is not empty
    const dataChannel = (this.peer as any)._channel;
    if (dataChannel && dataChannel.bufferedAmount > 1024 * 1024) { // 1MB
      await new Promise(resolve => setTimeout(resolve, 10));
    } else if (dataChannel && dataChannel.bufferedAmount > 0) {
      await new Promise(resolve => setTimeout(resolve, 2));
    }
    // No delay if buffer is empty for maximum speed
  }

  private handleReceivedData(data: Uint8Array) {
    try {
      const message = JSON.parse(new TextDecoder().decode(data));

      if (message.type === 'ping') {
        // Respond to keep-alive ping
        if (this.peer && this.peer.connected) {
          this.peer.send(JSON.stringify({ type: 'pong' }));
        }
        return;
      } else if (message.type === 'pong') {
        // Keep-alive response received
        return;
      } else if (message.type === 'metadata') {
        console.log(`Receiving file: ${message.data.name} (${message.data.totalChunks} chunks)`);
        this.fileMetadata.set(message.data.id, message.data);
        this.receivedChunks.set(message.data.id, new Array(message.data.totalChunks));
      } else if (message.type === 'chunk') {
        this.handleReceivedChunk(message.data);
      }
    } catch (error) {
      console.error('Error handling received data:', error);
    }
  }

  private handleReceivedChunk(chunk: any) {
    const fileChunks = this.receivedChunks.get(chunk.fileId);
    const metadata = this.fileMetadata.get(chunk.fileId);

    if (!fileChunks || !metadata) return;

    // Convert array back to ArrayBuffer
    const arrayBuffer = new Uint8Array(chunk.data).buffer;
    fileChunks[chunk.chunkIndex] = arrayBuffer;

    // Check if all chunks received
    const receivedCount = fileChunks.filter(c => c).length;
    if (this.onProgress) {
      this.onProgress((receivedCount / metadata.totalChunks) * 100);
    }

    if (receivedCount === metadata.totalChunks) {
      this.assembleFile(chunk.fileId);
    }
  }

  private assembleFile(fileId: string) {
    const chunks = this.receivedChunks.get(fileId);
    const metadata = this.fileMetadata.get(fileId);

    if (!chunks || !metadata) return;

    // Combine all chunks
    const blob = new Blob(chunks, { type: metadata.type });
    const file = new File([blob], metadata.name, { type: metadata.type });

    if (this.onFileReceived) {
      this.onFileReceived(file);
    }

    // Cleanup
    this.receivedChunks.delete(fileId);
    this.fileMetadata.delete(fileId);
  }

  onFileReceivedCallback(callback: (file: File) => void) {
    this.onFileReceived = callback;
  }

  onProgressCallback(callback: (progress: number) => void) {
    this.onProgress = callback;
  }

  disconnect() {
    if (this.peer) {
      // Clear any intervals
      if ((this.peer as any).connectionCheckInterval) {
        clearInterval((this.peer as any).connectionCheckInterval);
      }
      this.peer.destroy();
      this.peer = null;
      this.connected = false;
    }
  }

  destroy() {
    this.disconnect();
    this.receivedChunks.clear();
    this.fileMetadata.clear();
  }
}