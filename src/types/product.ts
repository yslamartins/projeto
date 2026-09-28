export type ProductStatus = 'pending' | 'published' | 'discarded';

export type VideoStatus = 'none' | 'searched' | 'downloaded' | 'failed';

export type WhatsAppStatus = 'none' | 'sent' | 'failed';

export interface Product {
  id: string;
  title: string;
  price: string;
  salesCount: number;
  imageUrl: string;
  productUrl: string;
  searchTerm: string;
  status: ProductStatus;
  tikTokUrl: string | null;
  videoUrl: string | null;
  videoPath: string | null;
  videoStatus: VideoStatus;
  whatsappStatus: WhatsAppStatus;
  sentAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ScanLogEvent {
  type: 'info' | 'success' | 'warn' | 'error' | 'step';
  message: string;
  timestamp: string;
  data?: any;
}

export type QueueKind = 'download' | 'send';

export type QueueStatus = 'idle' | 'running' | 'cancelling';

export interface QueueState {
  kind: QueueKind | null;
  status: QueueStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentProductId: string | null;
}
