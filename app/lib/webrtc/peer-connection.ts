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

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

export class PeerConnection {
  private peer: SimplePeer.Instance | null = null;
  private isInitiator: boolean;
  private onFileReceived?: (file: File) => void;
  private onProgress?: (progress: number) => void;
  private receivedChunks: Map<string, ArrayBuffer[]> = new Map();
  private fileMetadata: Map<string, FileMetadata> = new Map();

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
          ],
        },
      });

      this.peer.on('signal', (data) => {
        resolve(JSON.stringify(data));
      });

      this.peer.on('connect', () => {
        console.log('P2P connection established!');
      });

      this.peer.on('data', (data: Uint8Array) => {
        this.handleReceivedData(data);
      });

      this.peer.on('error', (err) => {
        console.error('P2P error:', err);
        reject(err);
      });

      if (signalData) {
        this.peer.signal(signalData);
      }
    });
  }

  connectToPeer(signalData: string) {
    if (this.peer) {
      this.peer.signal(JSON.parse(signalData));
    }
  }

  async sendFile(file: File) {
    if (!this.peer || !this.peer.connected) {
      throw new Error('Peer not connected');
    }

    const fileId = Math.random().toString(36).substring(2, 15);
    const chunks = await this.fileToChunks(file, fileId);

    // Send metadata first
    const metadata: FileMetadata = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      totalChunks: chunks.length,
    };

    this.peer.send(JSON.stringify({ type: 'metadata', data: metadata }));

    // Send chunks
    let chunksSent = 0;
    for (const chunk of chunks) {
      await this.sendChunk(chunk);
      chunksSent++;
      if (this.onProgress) {
        this.onProgress((chunksSent / chunks.length) * 100);
      }
    }
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

    this.peer.send(JSON.stringify(chunkData));

    // Add small delay to prevent overwhelming
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  private handleReceivedData(data: Uint8Array) {
    try {
      const message = JSON.parse(new TextDecoder().decode(data));

      if (message.type === 'metadata') {
        this.fileMetadata.set(message.data.id, message.data);
        this.receivedChunks.set(message.data.id, []);
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
      this.peer.destroy();
      this.peer = null;
    }
  }

  isConnected(): boolean {
    return this.peer?.connected || false;
  }
}