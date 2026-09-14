export type ProductStatus = 'pending' | 'published' | 'discarded';

export type VideoStatus = 'none' | 'searched' | 'downloaded' | 'failed';

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
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ScanLogEvent {
  type: 'info' | 'success' | 'warn' | 'error' | 'step';
  message: string;
  timestamp: string;
  data?: any;
}
