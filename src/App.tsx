/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, 
  Sparkles, 
  Image as ImageIcon, 
  Download, 
  RefreshCcw, 
  ChevronRight, 
  Info,
  Loader2,
  Camera,
  Layers,
  Palette,
  X
} from "lucide-react";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface GeneratedMockup {
  id: string;
  prompt: string;
  url?: string;
  status: 'idle' | 'generating_prompt' | 'waiting' | 'generating_image' | 'completed' | 'error';
  error?: string;
  waitTimer?: number;
}

const STYLES = [
  { id: 'minimalist', name: 'Studio Tối giản', icon: Camera },
  { id: 'lifestyle', name: 'Ngoài trời / Tự nhiên', icon: ImageIcon },
  { id: 'cinematic', name: 'Điện ảnh / Mood', icon: Sparkles },
  { id: 'abstract', name: 'Trừu tượng / Sáng tạo', icon: Palette },
];

export default function App() {
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('minimalist');
  const [mockups, setMockups] = useState<GeneratedMockup[]>([]);
  const [isOverallLoading, setIsOverallLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageMimeType, setSelectedImageMimeType] = useState<string | null>(null);
  const [selectedBackImage, setSelectedBackImage] = useState<string | null>(null);
  const [selectedBackImageMimeType, setSelectedBackImageMimeType] = useState<string | null>(null);
  const [selectedRefImage, setSelectedRefImage] = useState<string | null>(null);
  const [selectedRefImageMimeType, setSelectedRefImageMimeType] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back' | 'ref') => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(',')[1];
        if (type === 'back') {
          setSelectedBackImage(base64Data);
          setSelectedBackImageMimeType(file.type);
        } else if (type === 'ref') {
          setSelectedRefImage(base64Data);
          setSelectedRefImageMimeType(file.type);
        } else {
          setSelectedImage(base64Data);
          setSelectedImageMimeType(file.type);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (type: 'front' | 'back' | 'ref') => {
    if (type === 'back') {
      setSelectedBackImage(null);
      setSelectedBackImageMimeType(null);
      if (backFileInputRef.current) backFileInputRef.current.value = '';
    } else if (type === 'ref') {
      setSelectedRefImage(null);
      setSelectedRefImageMimeType(null);
      if (refFileInputRef.current) refFileInputRef.current.value = '';
    } else {
      setSelectedImage(null);
      setSelectedImageMimeType(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const generatePrompts = async (
    name: string, 
    desc: string, 
    style: string, 
    frontImg?: string, 
    frontMime?: string,
    backImg?: string,
    backMime?: string,
    refImg?: string,
    refMime?: string
  ) => {
    const contents: any[] = [];
    
    if (frontImg && frontMime) {
      contents.push({
        inlineData: { data: frontImg, mimeType: frontMime }
      });
    }
    
    if (backImg && backMime) {
      contents.push({
        inlineData: { data: backImg, mimeType: backMime }
      });
    }

    if (refImg && refMime) {
      contents.push({
        inlineData: { data: refImg, mimeType: refMime }
      });
    }

    contents.push({
      text: `Tạo 10 mô tả (prompt) chụp ảnh sản phẩm chuyên nghiệp và đa dạng cho sản phẩm tên là "${name}". 
      ${desc ? `Mô tả chi tiết: ${desc}.` : ''}
      Phong cách: ${style}. 
      ${(frontImg || backImg) ? "Sử dụng ảnh mặt trước/mặt sau đã cung cấp để nhận diện sản phẩm." : ""}
      ${refImg ? "ĐẶC BIỆT: Hãy tham khảo bố cục, ánh sáng và phong cách từ hình ảnh mẫu (reference) được cung cấp." : ""}
      Lưu ý: Trả về mảng JSON các chuỗi (strings) bằng TIẾNG ANH. Mỗi mô tả phải chi tiết về ánh sáng, bối cảnh, góc chụp. Đảm bảo sự đa dạng.`
    });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    try {
      return JSON.parse(response.text || '[]') as string[];
    } catch (e) {
      console.error("Lỗi khi phân tích prompt", e);
      return [];
    }
  };

  const generateSingleImage = async (
    prompt: string, 
    index: number, 
    frontImg?: string, 
    frontMime?: string,
    backImg?: string,
    backMime?: string,
    refImg?: string,
    refMime?: string,
    retries = 5
  ) => {
    try {
      setMockups(prev => prev.map((m, i) => i === index ? { ...m, status: 'generating_image' } : m));
      
      const parts: any[] = [];
      if (frontImg && frontMime) {
        parts.push({ inlineData: { data: frontImg, mimeType: frontMime } });
      }
      if (backImg && backMime) {
        parts.push({ inlineData: { data: backImg, mimeType: backMime } });
      }
      if (refImg && refMime) {
        parts.push({ inlineData: { data: refImg, mimeType: refMime } });
      }
      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: parts },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
          }
        }
      });

      let imageUrl = '';
      const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (part?.inlineData) {
        imageUrl = `data:image/png;base64,${part.inlineData.data}`;
      }

      if (imageUrl) {
        setMockups(prev => prev.map((m, i) => i === index ? { ...m, status: 'completed', url: imageUrl } : m));
      } else {
        throw new Error("Không thể tạo ảnh");
      }
    } catch (err: any) {
      const errStr = (String(err).toLowerCase() + JSON.stringify(err).toLowerCase());
      console.error(`Lỗi tại index ${index}:`, err);
      
      const isQuotaError = 
        errStr.includes('429') || 
        errStr.includes('quota') || 
        errStr.includes('exhausted') ||
        err.status === 429 ||
        err.code === 429 ||
        err.error?.code === 429 ||
        err.status === 'RESOURCE_EXHAUSTED' ||
        err.error?.status === 'RESOURCE_EXHAUSTED';

      if (retries > 0 && isQuotaError) {
        // More aggressive exponential backoff
        const waitSeconds = (6 - retries) * 15; // 15s, 30s, 45s, 60s, 75s
        
        // Start countdown
        for (let s = waitSeconds; s > 0; s--) {
          setMockups(prev => prev.map((m, i) => i === index ? { ...m, status: 'waiting', waitTimer: s } : m));
          await sleep(1000);
        }
        
        setMockups(prev => prev.map((m, i) => i === index ? { ...m, status: 'generating_image', waitTimer: undefined } : m));
        return generateSingleImage(prompt, index, frontImg, frontMime, backImg, backMime, refImg, refMime, retries - 1);
      }

      setMockups(prev => prev.map((m, i) => i === index ? { ...m, status: 'error', error: isQuotaError ? 'Hết hạn mức AI' : 'Lỗi hệ thống', waitTimer: undefined } : m));
    }
  };

  const handleRetryAllFailed = () => {
    mockups.forEach((m, i) => {
      if (m.status === 'error') {
        handleRetrySingle(i);
      }
    });
  };

  const handleGenerate = async () => {
    if (!productName.trim()) return;

    setIsOverallLoading(true);
    const initialSlots: GeneratedMockup[] = Array.from({ length: 10 }).map((_, i) => ({
      id: `mockup-${i}`,
      prompt: '',
      status: 'generating_prompt'
    }));
    setMockups(initialSlots);

    try {
      const prompts = await generatePrompts(
        productName, 
        description, 
        selectedStyle, 
        selectedImage || undefined, 
        selectedImageMimeType || undefined,
        selectedBackImage || undefined,
        selectedBackImageMimeType || undefined,
        selectedRefImage || undefined,
        selectedRefImageMimeType || undefined
      );
      
      const updatedMockups = initialSlots.map((m, i) => ({
        ...m,
        prompt: prompts[i] || `Professional product mockup of ${productName}`,
        status: prompts[i] ? 'waiting' as const : 'error' as const
      }));
      setMockups(updatedMockups);

      // Process strictly sequentially with longer delays to respect free tier quota
      for (let i = 0; i < prompts.length; i++) {
        // If overall loading was cancelled (to be implemented if needed), stop here
        await generateSingleImage(
          prompts[i], 
          i, 
          selectedImage || undefined, 
          selectedImageMimeType || undefined,
          selectedBackImage || undefined,
          selectedBackImageMimeType || undefined,
          selectedRefImage || undefined,
          selectedRefImageMimeType || undefined
        );
        if (i < prompts.length - 1) {
          await sleep(6000); // 6s delay between requests to be extra safe
        }
      }
    } catch (err: any) {
      console.error("Quá trình tạo thất bại", err);
    } finally {
      setIsOverallLoading(false);
    }
  };

  const handleRetrySingle = (index: number) => {
    const mockup = mockups[index];
    if (!mockup || !mockup.prompt) return;
    
    generateSingleImage(
      mockup.prompt, 
      index, 
      selectedImage || undefined, 
      selectedImageMimeType || undefined,
      selectedBackImage || undefined,
      selectedBackImageMimeType || undefined,
      selectedRefImage || undefined,
      selectedRefImageMimeType || undefined
    );
  };

  const downloadImage = (url: string, index: number) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${productName.replace(/\s+/g, '-').toLowerCase()}-mockup-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col font-sans selection:bg-brand-500/30">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={(e) => handleImageUpload(e, 'front')} 
        accept="image/*" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={backFileInputRef} 
        onChange={(e) => handleImageUpload(e, 'back')} 
        accept="image/*" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={refFileInputRef} 
        onChange={(e) => handleImageUpload(e, 'ref')} 
        accept="image/*" 
        className="hidden" 
      />
      {/* Header */}
      <header className="h-16 px-6 flex items-center justify-between glass sticky top-0 z-50 border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center text-white">
            <Layers className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-display font-bold tracking-tight text-white uppercase italic">
            Sơn Nguyễn <span className="text-brand-500 not-italic">v2.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 border border-zinc-800 rounded-lg text-sm font-medium text-zinc-400 hover:bg-zinc-900 transition-colors">
            Hướng dẫn
          </button>
          <button className="px-4 py-2 bg-white text-zinc-950 rounded-lg text-sm font-bold hover:bg-zinc-200 transition-colors">
            Tải về 10 ảnh (.zip)
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-4rem)]">
        {/* Sidebar Controls */}
        <aside className="w-full lg:w-72 border-r border-zinc-800 bg-zinc-950 p-6 overflow-y-auto shrink-0 flex flex-col gap-6">
          <div className="space-y-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Sản phẩm gốc
            </h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 block">Mặt trước</label>
                <div className="group relative">
                  {selectedImage ? (
                    <div className="w-full aspect-video rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
                      <img 
                        src={`data:${selectedImageMimeType};base64,${selectedImage}`} 
                        className="w-full h-full object-contain" 
                        alt="Front product"
                      />
                      <button 
                        onClick={() => removeImage('front')}
                        className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full aspect-video border-2 border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center gap-2 bg-zinc-900/50 hover:bg-zinc-900 hover:border-brand-500/50 transition-all cursor-pointer"
                    >
                      <Plus className="w-5 h-5 text-brand-500" />
                      <span className="text-[10px] font-medium text-zinc-400">Tải lên ảnh mặt trước</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 block">Mặt sau</label>
                <div className="group relative">
                  {selectedBackImage ? (
                    <div className="w-full aspect-video rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
                      <img 
                        src={`data:${selectedBackImageMimeType};base64,${selectedBackImage}`} 
                        className="w-full h-full object-contain" 
                        alt="Back product"
                      />
                      <button 
                        onClick={() => removeImage('back')}
                        className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div 
                      onClick={() => backFileInputRef.current?.click()}
                      className="w-full aspect-video border-2 border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center gap-2 bg-zinc-900/50 hover:bg-zinc-900 hover:border-brand-500/50 transition-all cursor-pointer"
                    >
                      <Plus className="w-5 h-5 text-brand-500" />
                      <span className="text-[10px] font-medium text-zinc-400">Tải lên ảnh mặt sau</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 block">Ảnh mẫu tham khảo</label>
                <div className="group relative">
                  {selectedRefImage ? (
                    <div className="w-full aspect-video rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
                      <img 
                        src={`data:${selectedRefImageMimeType};base64,${selectedRefImage}`} 
                        className="w-full h-full object-contain" 
                        alt="Reference style"
                      />
                      <button 
                        onClick={() => removeImage('ref')}
                        className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div 
                      onClick={() => refFileInputRef.current?.click()}
                      className="w-full aspect-video border-2 border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center gap-2 bg-zinc-900/50 hover:bg-zinc-900 hover:border-brand-500/50 transition-all cursor-pointer"
                    >
                      <Plus className="w-5 h-5 text-brand-500" />
                      <span className="text-[10px] font-medium text-zinc-400">Tải lên ảnh mẫu phong cách</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-2">Tên sản phẩm</label>
                <input 
                  type="text" 
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Ví dụ: Bình nước Arctic"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg focus:ring-1 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-2">Mô tả (Tùy chọn)</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Lớp hoàn thiện mờ, nắp thép, thiết kế tối giản..."
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg focus:ring-1 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm resize-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Bối cảnh (Scene)</h2>
            <div className="grid grid-cols-1 gap-2">
              <select 
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg focus:ring-1 focus:ring-brand-500 outline-none text-sm appearance-none"
              >
                {STYLES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-zinc-900">
            <button 
              onClick={handleGenerate}
              disabled={isOverallLoading || !productName}
              className="w-full bg-brand-500 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-brand-600 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isOverallLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Tạo 10 Ảnh Mẫu Ngay
            </button>
            <div className="mt-4 p-3 bg-brand-500/5 border border-brand-500/10 rounded-lg">
              <p className="text-[10px] text-brand-500 leading-relaxed italic text-center">
                Mẹo: Sử dụng ảnh nền trong suốt để có kết quả tốt nhất.
              </p>
            </div>
          </div>
        </aside>

        {/* Workspace */}
        <section className="flex-1 bg-zinc-950 bg-dots p-6 lg:p-8 overflow-y-auto relative">
          {!mockups.length ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-6">
              <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800 rotate-3">
                <ImageIcon className="w-8 h-8 text-zinc-700" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-display font-bold text-white">Sẵn sàng thiết kế</h2>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  Thiết lập thông tin sản phẩm và phong cách để bắt đầu quá trình tạo mẫu ảnh chuyên nghiệp.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 h-full flex flex-col">
              <div className="flex items-center justify-between pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-green-400 text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-green-400/10 rounded-full border border-green-400/20">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> Sẵn sàng
                  </span>
                  <span className="text-zinc-600 font-bold">•</span>
                  <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">2048 x 2048px</span>
                  <span className="text-zinc-600 font-bold">•</span>
                  <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">PNG (Không nền)</span>
                </div>
                
                {mockups.some(m => m.status === 'error') && (
                  <button 
                    onClick={handleRetryAllFailed}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-all"
                  >
                    <RefreshCcw className="w-3 h-3" /> Thử lại tất cả lỗi
                  </button>
                )}
              </div>

              <motion.div 
                layout
                className="grid grid-cols-4 grid-rows-4 gap-3 flex-1 min-h-0"
              >
                <AnimatePresence mode="popLayout">
                  {mockups.map((mockup, idx) => (
                    <motion.div
                      key={mockup.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      className={`group relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 flex flex-col justify-end p-3 aspect-square ${
                        idx === 0 ? 'bento-item-1' : idx === 1 ? 'bento-item-2' : ''
                      }`}
                    >
                      {mockup.status === 'completed' && mockup.url ? (
                        <>
                          <img 
                            src={mockup.url} 
                            alt={`Mockup ${idx + 1}`} 
                            className="absolute inset-0 w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button 
                              onClick={() => downloadImage(mockup.url!, idx)}
                              className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-zinc-950 hover:scale-110 active:scale-95 transition-transform shadow-xl"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                          {mockup.status === 'error' ? (
                            <div className="flex flex-col items-center gap-3 p-4 text-center">
                              <Info className="w-8 h-8 text-red-500/50" />
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold text-red-500/50 uppercase tracking-wider">{mockup.error}</p>
                                <p className="text-[8px] text-zinc-600 leading-tight">Hạn mức miễn phí có giới hạn. Vui lòng thử lại sau vài giây.</p>
                              </div>
                              <button 
                                onClick={() => handleRetrySingle(idx)}
                                className="mt-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-[9px] font-bold text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5"
                              >
                                <RefreshCcw className="w-3 h-3" /> THỬ LẠI RIÊNG
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-3">
                              {mockup.status === 'waiting' ? (
                                <div className="flex flex-col items-center gap-2">
                                  <RefreshCcw className="w-6 h-6 text-brand-500 animate-spin" />
                                  <span className="text-[14px] font-mono font-bold text-brand-500">{mockup.waitTimer}s</span>
                                </div>
                              ) : (
                                <Loader2 className="w-6 h-6 text-zinc-700 animate-spin" />
                              )}
                              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">
                                {mockup.status === 'generating_prompt' ? 'Đang xử lý' : 
                                 mockup.status === 'waiting' ? 'Vui lòng đợi' : 'Đang tạo ảnh'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="relative z-10">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/50 bg-black/40 backdrop-blur-sm px-2 py-1 rounded-md border border-white/5">
                          Ảnh mẫu #{idx + 1} {idx === 0 ? '- Nổi bật' : idx === 1 ? '- Tiêu điểm' : ''}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>
          )}
        </section>
      </main>

      <footer className="h-10 px-6 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
        <div className="flex gap-6">
          <span>&copy; 2026 Sơn Nguyễn Studio</span>
          <span>Security Verified</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Hệ thống ổn định</span>
          <span className="border-l border-zinc-800 pl-4">V2.0 Premium</span>
        </div>
      </footer>
    </div>
  );
}

// Global process shim
(window as any).process = {
  env: {
    GEMINI_API_KEY: (import.meta as any).env.VITE_GEMINI_API_KEY || ''
  }
};
