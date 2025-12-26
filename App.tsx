
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Folder, ImageItem, NoteItem } from './types';
import { GoogleGenAI } from "@google/genai";
import { 
  FolderIcon, 
  PlusIcon, 
  TrashIcon, 
  ArrowLeftIcon, 
  XIcon, 
  SearchIcon, 
  TagIcon, 
  FilterIcon, 
  StickyNoteIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  SparklesIcon, 
  Loader2Icon, 
  PencilIcon
} from 'lucide-react';

const DB_NAME = 'JellyGalleryDB';
const STORE_NAME = 'folders';
const DB_VERSION = 1;

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveFoldersToDB = async (folders: Folder[]) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put(folders, 'all_folders');
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

const getFoldersFromDB = async (): Promise<Folder[]> => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.get('all_folders');
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

const translations = {
  zh: {
    title: "果冻画册",
    searchPlaceholder: "搜名字、标签...",
    folderSearchPlaceholder: "在此搜索...",
    newFolder: "新建文件夹",
    editFolder: "编辑文件夹",
    create: "创建",
    cancel: "取消",
    all: "全部显示",
    tags: "标签",
    notes: "便签",
    images: "个果冻",
    empty: "空空如也...",
    confirmDelete: "确定要删掉这个盒子吗？",
    save: "保存",
    editImage: "编辑图片",
    filter: "筛选",
    tagLibrary: "我的标签库",
    readingMode: "阅览模式",
    exitReading: "退出",
    addTag: "加标签...",
    add: "添加",
    aiSummary: "AI 总结",
    summarizing: "思考中...",
    summaryTitle: "AI 简报",
    saveAnnotation: "保存",
    loading: "载入中...",
    newNote: "新建便签",
    editNote: "编辑便签",
    saveNote: "保存便签",
    networkError: "网络连接似乎有问题哦！",
    delete: "删除"
  },
  en: {
    title: "Jelly Gallery",
    searchPlaceholder: "Search names, tags...",
    folderSearchPlaceholder: "Search...",
    newFolder: "New Folder",
    editFolder: "Edit Folder",
    create: "Create",
    cancel: "Cancel",
    all: "All",
    tags: "TAGS",
    notes: "NOTES",
    images: "items",
    empty: "It's empty here...",
    confirmDelete: "Delete this folder?",
    save: "Save",
    editImage: "Edit Image",
    filter: "Filter",
    tagLibrary: "Tag Library",
    readingMode: "Reading Mode",
    exitReading: "Exit",
    addTag: "Add tag...",
    add: "Add",
    aiSummary: "AI Summary",
    summarizing: "Thinking...",
    summaryTitle: "AI Brief",
    saveAnnotation: "Save",
    loading: "Loading...",
    newNote: "New Note",
    editNote: "Edit Note",
    saveNote: "Save Note",
    networkError: "Network issue detected!",
    delete: "Delete"
  }
};

const DEFAULT_BASE_SCALE = 0.8;

const App: React.FC = () => {
  const [lang, setLang] = useState<'zh' | 'en'>(() => (localStorage.getItem('vault_lang') as 'zh' | 'en') || 'zh');
  const t = translations[lang];

  const [folders, setFolders] = useState<Folder[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [folderSearchQuery, setFolderSearchQuery] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [isLogoBouncing, setIsLogoBouncing] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [readingIndex, setReadingIndex] = useState(0);
  const [zoomScale, setZoomScale] = useState(DEFAULT_BASE_SCALE);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  
  // Interaction State
  const pointersRef = useRef<Map<number, { x: number, y: number }>>(new Map());
  const lastDistRef = useRef<number>(0);
  const initialScaleRef = useRef<number>(DEFAULT_BASE_SCALE);
  const dragStartPosRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const initialPanRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

  const gridLongPressTimer = useRef<number | null>(null);
  const folderLongPressTimer = useRef<number | null>(null);

  const [isAnnotating, setIsAnnotating] = useState(false);
  const [strokeColor, setStrokeColor] = useState('#e91e63');
  const [history, setHistory] = useState<string[]>([]);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const annotationColors = ['#e91e63', '#9c27b0', '#2196f3', '#4caf50', '#ffeb3b'];

  const [editingImage, setEditingImage] = useState<{folderId: string, image: ImageItem} | null>(null);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editNote, setEditNote] = useState('');
  const [newTagInput, setNewTagInput] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getFoldersFromDB().then((data) => {
      setFolders(data);
      setIsInitializing(false);
    });
  }, []);

  useEffect(() => {
    if (!isInitializing) saveFoldersToDB(folders);
  }, [folders, isInitializing]);

  const activeFolder = folders.find(f => f.id === activeFolderId);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    folders.forEach(f => f.images.forEach(img => img.tags?.forEach(t => tags.add(t))));
    return Array.from(tags).sort();
  }, [folders]);

  const filteredFolders = useMemo(() => {
    return folders.filter(folder => {
      const query = searchQuery.toLowerCase();
      const folderMatches = folder.name.toLowerCase().includes(query);
      const imageMatches = folder.images.some(img => 
        img.name.toLowerCase().includes(query) || 
        img.note.toLowerCase().includes(query) || 
        img.tags.some(tag => tag.toLowerCase().includes(query))
      );
      const tagMatches = !selectedTagFilter || folder.images.some(img => img.tags.includes(selectedTagFilter));
      return (folderMatches || imageMatches) && tagMatches;
    });
  }, [folders, searchQuery, selectedTagFilter]);

  const filteredItems = useMemo(() => {
    if (!activeFolder) return [];
    const query = folderSearchQuery.toLowerCase();
    const images = activeFolder.images.filter(img => 
      !query || 
      img.tags.some(tag => tag.toLowerCase().includes(query)) ||
      img.name.toLowerCase().includes(query)
    ).map(img => ({ ...img, itemType: 'image' as const }));
    const notes = (activeFolder.notes || []).filter(note => 
      !query || note.content.toLowerCase().includes(query)
    ).map(note => ({ ...note, itemType: 'note' as const }));
    return [...images, ...notes].sort((a, b) => b.timestamp - a.timestamp);
  }, [activeFolder, folderSearchQuery]);

  const currentReadingItem = useMemo(() => filteredItems[readingIndex], [filteredItems, readingIndex]);

  const createFolder = () => {
    if (!newFolderName.trim()) return;
    const newFolder: Folder = { id: Date.now().toString(), name: newFolderName, images: [], notes: [], createdAt: Date.now() };
    setFolders([...folders, newFolder]);
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleFolderPointerDown = (folder: Folder) => {
    folderLongPressTimer.current = window.setTimeout(() => {
      setEditingFolder({ ...folder });
      folderLongPressTimer.current = null;
    }, 600);
  };

  const handleFolderPointerUp = (folder: Folder) => {
    if (folderLongPressTimer.current) {
      clearTimeout(folderLongPressTimer.current);
      folderLongPressTimer.current = null;
      setActiveFolderId(folder.id);
    }
  };

  const handleGridPointerDown = (item: any) => {
    gridLongPressTimer.current = window.setTimeout(() => {
      if (item.itemType === 'image') {
        setEditingImage({ folderId: activeFolderId!, image: item });
        setEditTags(item.tags);
        setEditNote(item.note);
      } else {
        setEditingNote(item);
        setIsNoteModalOpen(true);
      }
      gridLongPressTimer.current = null;
    }, 600);
  };

  const handleGridPointerUp = (item: any) => {
    if (gridLongPressTimer.current) {
      clearTimeout(gridLongPressTimer.current);
      gridLongPressTimer.current = null;
      const idx = filteredItems.findIndex(i => i.id === item.id);
      setReadingIndex(idx);
      setIsReadingMode(true);
      setZoomScale(DEFAULT_BASE_SCALE);
      setPanOffset({ x: 0, y: 0 });
      setIsAnnotating(false);
    }
  };

  // --- Reading Mode Smooth Interaction Logic ---
  const handleReadingPointerDown = (e: React.PointerEvent) => {
    if (isAnnotating) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      dragStartPosRef.current = { x: e.clientX, y: e.clientY };
      initialPanRef.current = { ...panOffset };
    } else if (pointersRef.current.size === 2) {
      const p = Array.from(pointersRef.current.values());
      lastDistRef.current = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      initialScaleRef.current = zoomScale;
    }
  };

  const handleReadingPointerMove = (e: React.PointerEvent) => {
    if (isAnnotating) return;
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      setPanOffset({ x: initialPanRef.current.x + dx, y: initialPanRef.current.y + dy });
    } else if (pointersRef.current.size === 2) {
      const p = Array.from(pointersRef.current.values());
      const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const ratio = dist / lastDistRef.current;
      setZoomScale(Math.min(Math.max(initialScaleRef.current * ratio, 0.2), 10));
    }
  };

  const handleReadingPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) lastDistRef.current = 0;
    if (pointersRef.current.size === 1) {
      const remainingPointer = Array.from(pointersRef.current.values())[0];
      dragStartPosRef.current = { x: remainingPointer.x, y: remainingPointer.y };
      initialPanRef.current = { ...panOffset };
    }
  };

  const nextReading = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isAnnotating) return;
    setReadingIndex(prev => (prev + 1) % filteredItems.length);
    setZoomScale(DEFAULT_BASE_SCALE);
    setPanOffset({ x: 0, y: 0 });
  };

  const prevReading = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isAnnotating) return;
    setReadingIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
    setZoomScale(DEFAULT_BASE_SCALE);
    setPanOffset({ x: 0, y: 0 });
  };

  const startAnnotating = () => {
    if (currentReadingItem.itemType !== 'image') return;
    setIsAnnotating(true);
    setHistory([]);
    setZoomScale(1.0);
    setPanOffset({ x: 0, y: 0 });
    setTimeout(() => {
      const canvas = annotationCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        setHistory([canvas.toDataURL()]);
      };
      img.src = (currentReadingItem as ImageItem).data;
    }, 100);
  };

  const handleDrawStart = (e: React.PointerEvent) => {
    if (!isAnnotating) return;
    isDrawingRef.current = true;
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = strokeColor; ctx.lineWidth = Math.max(canvas.width, canvas.height) / 100;
  };

  const handleDrawing = (e: React.PointerEvent) => {
    if (!isDrawingRef.current || !isAnnotating) return;
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    ctx.lineTo(x, y); ctx.stroke();
  };

  const handleDrawEnd = () => {
    if (isDrawingRef.current && isAnnotating) {
      const canvas = annotationCanvasRef.current;
      if (canvas) setHistory(prev => [...prev, canvas.toDataURL()]);
    }
    isDrawingRef.current = false;
  };

  const saveAnnotation = () => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const newData = canvas.toDataURL('image/png');
    setFolders(prev => prev.map(f => f.id === activeFolderId ? { ...f, images: f.images.map(img => img.id === currentReadingItem.id ? { ...img, data: newData } : img) } : f));
    setIsAnnotating(false);
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeFolderId) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const newImg: ImageItem = { id: Math.random().toString(36).substr(2, 9), name: file.name, data: reader.result as string, tags: [], note: '', timestamp: Date.now() };
      setEditingImage({ folderId: activeFolderId, image: newImg });
      setEditTags([]); setEditNote('');
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const saveImageChanges = () => {
    if (!editingImage) return;
    const { folderId, image } = editingImage;
    const updatedImage = { ...image, tags: editTags, note: editNote };
    setFolders(prev => prev.map(f => {
      if (f.id === folderId) {
        const imageExists = f.images.find(i => i.id === image.id);
        const newImages = imageExists ? f.images.map(i => i.id === image.id ? updatedImage : i) : [...f.images, updatedImage];
        return { ...f, images: newImages };
      }
      return f;
    }));
    setEditingImage(null);
  };

  const addNewTag = () => {
    if (!newTagInput.trim()) return;
    const tag = newTagInput.trim().toLowerCase();
    if (!editTags.includes(tag)) setEditTags([...editTags, tag]);
    setNewTagInput('');
  };

  const deleteItem = (fid: string, id: string, type: 'image' | 'note', e: React.MouseEvent) => {
    e.stopPropagation();
    setFolders(prev => prev.map(f => f.id === fid ? (type === 'image' ? { ...f, images: f.images.filter(img => img.id !== id) } : { ...f, notes: (f.notes || []).filter(n => n.id !== id) }) : f));
    setEditingImage(null); setEditingNote(null); setIsNoteModalOpen(false);
  };

  const saveFolderRename = () => {
    if (!editingFolder?.name.trim()) return;
    setFolders(prev => prev.map(f => f.id === editingFolder.id ? editingFolder : f));
    setEditingFolder(null);
  };

  const deleteFolder = (id: string) => {
    if (confirm(t.confirmDelete)) {
      setFolders(folders.filter(f => f.id !== id));
      setActiveFolderId(null);
      setEditingFolder(null);
    }
  };

  const saveNote = () => {
    if (!editingNote || !activeFolderId) return;
    setFolders(prev => prev.map(f => f.id === activeFolderId ? { ...f, notes: (f.notes || []).some(n => n.id === editingNote.id) ? f.notes?.map(n => n.id === editingNote.id ? editingNote : n) : [...(f.notes || []), { ...editingNote, timestamp: Date.now() }] } : f));
    setEditingNote(null); setIsNoteModalOpen(false);
  };

  const handleAiSummarize = async () => {
    if (!activeFolder) return;
    setIsSummarizing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Folder: "${activeFolder.name}". Images: ${activeFolder.images.length}. Notes: ${activeFolder.notes?.length || 0}. Briefly summarize contents humorously (under 50 chars). No * symbols.`;
      const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
      setSummaryText((response.text || "Summary failed").replaceAll('*', ''));
    } catch { setSummaryText(t.networkError); } finally { setIsSummarizing(false); }
  };

  const folderColors = ['#fff9c4', '#e1f5fe', '#fce4ec', '#f1f8e9', '#f3e5f5'];

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f7f9ff]">
        <Loader2Icon className="animate-spin text-[#2196f3]" size={40} />
        <p className="mt-4 font-black text-[#1a1a1a] text-xs">{t.loading}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col w-full max-w-screen-md mx-auto bg-[#f7f9ff] overflow-hidden text-[#1a1a1a] relative">
      <header className="px-5 py-4 bg-[#fff0f6] sticky top-0 z-20 shadow-sm transition-all duration-300">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {activeFolderId ? (
              <button onClick={() => { setActiveFolderId(null); setFolderSearchQuery(''); }} className="jelly-button p-2 bg-white flex-shrink-0">
                <ArrowLeftIcon size={20} />
              </button>
            ) : (
              <div className={`bg-[#ffeb3b] p-2 jelly-button cursor-pointer flex-shrink-0 ${isLogoBouncing ? 'animate-jelly' : ''}`} onClick={() => setIsLogoBouncing(true)} onAnimationEnd={() => setIsLogoBouncing(false)}>
                <TagIcon className="text-[#e91e63]" size={24} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl tracking-tight">
                {activeFolderId ? <span className="font-black truncate block">{activeFolder?.name}</span> : <div className="flex font-black italic whitespace-nowrap">{'果冻画册'.split('').map((char, i) => <span key={i} style={{ color: ['#e91e63', '#9c27b0', '#2196f3', '#4caf50'][i % 4] }}>{char}</span>)}</div>}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {activeFolderId && (
              <>
                <button onClick={handleAiSummarize} disabled={isSummarizing} className="jelly-button p-2.5 bg-white">{isSummarizing ? <Loader2Icon size={20} className="animate-spin text-[#9c27b0]" /> : <SparklesIcon size={20} className="text-[#9c27b0]" />}</button>
                <button onClick={() => { setEditingNote({ id: Math.random().toString(36).substr(2, 9), content: '', timestamp: Date.now() }); setIsNoteModalOpen(true); }} className="jelly-button p-2.5 bg-[#eef2ff] text-[#1a1a1a]"><StickyNoteIcon size={20} strokeWidth={3} /></button>
              </>
            )}
            {!activeFolderId && <button onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')} className="jelly-button bg-white px-2 py-1.5 text-[10px] font-bold">{lang === 'zh' ? 'EN' : '中'}</button>}
            <button onClick={() => activeFolderId ? fileInputRef.current?.click() : setIsCreatingFolder(true)} className="jelly-button p-2.5 bg-[#4caf50] text-white"><PlusIcon size={20} strokeWidth={3} /></button>
          </div>
          <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImagePick} />
        </div>
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1a1a1a]" size={16} />
          <input type="text" placeholder={activeFolderId ? t.folderSearchPlaceholder : t.searchPlaceholder} value={activeFolderId ? folderSearchQuery : searchQuery} onChange={(e) => activeFolderId ? setFolderSearchQuery(e.target.value) : setSearchQuery(e.target.value)} className="w-full bg-white rounded-xl py-2.5 pl-9 pr-3 text-xs font-bold outline-none shadow-sm" />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-6 space-y-5 pb-20 no-scrollbar">
        {!activeFolderId ? (
          <div className="grid grid-cols-2 gap-4">
            {filteredFolders.map((folder, idx) => (
              <div key={folder.id} onPointerDown={() => handleFolderPointerDown(folder)} onPointerUp={() => handleFolderPointerUp(folder)} className="jelly-card p-3 flex flex-col items-center justify-center bg-white aspect-square cursor-pointer">
                <div className="w-10 h-10 q-folder-blob flex items-center justify-center mb-1.5 border border-black/5 shadow-inner" style={{ backgroundColor: folderColors[idx % folderColors.length] }}><FolderIcon size={18} className="text-[#1a1a1a]/30" /></div>
                <div className="font-black text-center truncate w-full px-1 text-xs">{folder.name}</div>
                <div className="text-[8px] font-bold text-slate-400">{(folder.images.length || 0) + (folder.notes?.length || 0)} {t.images}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filteredItems.map((item: any) => (
              <div key={item.id} onPointerDown={() => handleGridPointerDown(item)} onPointerUp={() => handleGridPointerUp(item)} className="jelly-card aspect-square overflow-hidden relative p-1 bg-white cursor-pointer">
                {item.itemType === 'image' ? (
                  <>
                    <img src={item.data} className="w-full h-full object-cover rounded-[1.5rem]" />
                    {item.tags.length > 0 && <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[7px] px-1 rounded font-black">#{item.tags[0]}</div>}
                  </>
                ) : (
                  <div className="w-full h-full bg-[#fdfcf0] p-2 rounded-[1.5rem] flex flex-col justify-between border border-dashed border-black/5">
                    <StickyNoteIcon size={14} className="text-black/20" />
                    <p className="text-[8px] font-bold leading-tight line-clamp-3 text-slate-500">{item.content}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Reading Mode Overlay */}
      {isReadingMode && activeFolder && currentReadingItem && (
        <div className="fixed inset-0 reading-bg z-[100] flex flex-col items-center justify-center p-0 select-none touch-none" 
          onPointerDown={handleReadingPointerDown} 
          onPointerMove={handleReadingPointerMove} 
          onPointerUp={handleReadingPointerUp}
          onPointerCancel={handleReadingPointerUp}
        >
          {/* Header UI */}
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-[110]">
            <div className="glass-panel px-3 py-1 rounded-full"><span className="text-white font-black text-xs">{readingIndex + 1} / {filteredItems.length}</span></div>
            <div className="flex gap-2">
               {!isAnnotating && currentReadingItem.itemType === 'image' && <button onClick={startAnnotating} className="jelly-button p-2 bg-[#ffeb3b]"><PencilIcon size={16} /></button>}
               <button onClick={() => { setIsReadingMode(false); setIsAnnotating(false); }} className="jelly-button px-4 py-2 bg-white text-black font-black text-xs">{t.exitReading}</button>
            </div>
          </div>
          
          <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
            {/* Enhanced Nav Buttons for Mobile Visibility */}
            {!isAnnotating && (
              <>
                <button onClick={prevReading} className="absolute left-4 top-1/2 -translate-y-1/2 z-[115] bg-white/20 backdrop-blur-lg p-5 rounded-full text-white shadow-xl active:scale-90 transition-transform"><ChevronLeftIcon size={40} strokeWidth={3}/></button>
                <button onClick={nextReading} className="absolute right-4 top-1/2 -translate-y-1/2 z-[115] bg-white/20 backdrop-blur-lg p-5 rounded-full text-white shadow-xl active:scale-90 transition-transform"><ChevronRightIcon size={40} strokeWidth={3}/></button>
              </>
            )}

            {isAnnotating ? (
              <div className="relative flex flex-col items-center justify-center w-full h-full p-2">
                <canvas ref={annotationCanvasRef} onPointerDown={handleDrawStart} onPointerMove={handleDrawing} onPointerUp={handleDrawEnd} className="max-w-[95vw] max-h-[75vh] shadow-2xl bg-black/10 rounded-lg touch-none" />
                <div className="absolute bottom-8 flex flex-col items-center gap-3">
                  <div className="flex gap-2 glass-panel p-2 rounded-full">{annotationColors.map(c => <button key={c} onClick={() => setStrokeColor(c)} className={`w-8 h-8 rounded-full border-2 ${strokeColor === c ? 'scale-125 border-white' : 'border-transparent'}`} style={{ backgroundColor: c }} />)}</div>
                  <div className="flex gap-3">
                    <button onClick={() => setIsAnnotating(false)} className="jelly-button px-6 py-3 bg-[#ff5252] text-white font-black">{t.cancel}</button>
                    <button onClick={saveAnnotation} className="jelly-button px-6 py-3 bg-[#4caf50] text-white font-black">{t.saveAnnotation}</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="transition-transform duration-75 ease-out will-change-transform" style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})` }}>
                {currentReadingItem.itemType === 'image' ? (
                  <img src={(currentReadingItem as ImageItem).data} className="max-w-[95vw] max-h-[85vh] object-contain rounded-lg shadow-2xl" />
                ) : (
                  <div className="max-w-[80vw] w-full jelly-card bg-[#fdfcf0] p-10 max-h-[70vh] overflow-y-auto no-scrollbar"><div className="text-lg font-bold text-slate-800 leading-relaxed whitespace-pre-wrap">{currentReadingItem.content}</div></div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals with Animation */}
      {editingFolder && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/40 overlay-fade">
          <div className="jelly-card bg-white w-full max-w-[280px] p-6 jelly-pop">
            <h3 className="text-lg font-black mb-4">{t.editFolder}</h3>
            <input autoFocus value={editingFolder.name} onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })} className="w-full bg-[#f0f4ff] rounded-xl p-3 font-black outline-none text-xs border border-black/5 mb-5" />
            <div className="flex gap-3">
              <button onClick={() => deleteFolder(editingFolder.id)} className="jelly-button p-3 bg-[#ff5252] text-white"><TrashIcon size={18}/></button>
              <button onClick={saveFolderRename} className="jelly-button flex-1 py-3 bg-[#2196f3] text-white font-black text-xs">{t.save}</button>
            </div>
          </div>
        </div>
      )}

      {isNoteModalOpen && editingNote && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/60 overlay-fade">
          <div className="jelly-card bg-[#fdfcf0] w-full max-w-xs p-6 jelly-pop">
            <h3 className="text-lg font-black mb-3">{t.editNote}</h3>
            <textarea autoFocus value={editingNote.content} onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })} className="w-full bg-white rounded-xl p-3 min-h-[200px] font-bold outline-none text-xs border border-black/5" />
            <div className="flex gap-3 mt-4">
              <button onClick={(e) => deleteItem(activeFolderId!, editingNote.id, 'note', e)} className="jelly-button flex-1 py-3 bg-[#ff5252] text-white font-black">{t.delete}</button>
              <button onClick={saveNote} className="jelly-button flex-[2] py-3 bg-[#4caf50] text-white font-black">{t.saveNote}</button>
            </div>
          </div>
        </div>
      )}

      {editingImage && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 overlay-fade">
          <div className="jelly-card bg-white w-full max-w-xs p-6 jelly-pop">
            <img src={editingImage.image.data} className="w-full h-40 object-cover rounded-xl mb-4" />
            <div className="flex flex-wrap gap-1.5 mb-2">{editTags.map(tag => <span key={tag} className="bg-[#fce4ec] text-[#e91e63] px-2 py-0.5 rounded-full text-[9px] font-black flex items-center gap-1">#{tag}<XIcon size={10} onClick={() => setEditTags(prev => prev.filter(t => t !== tag))}/></span>)}</div>
            <div className="flex gap-2 mb-4"><input value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNewTag()} placeholder={t.addTag} className="flex-1 bg-[#fffde7] rounded-lg px-3 py-2 text-xs font-bold outline-none" /><button onClick={addNewTag} className="jelly-button px-3 py-1 bg-[#ffeb3b] text-black font-black text-xs">{t.add}</button></div>
            <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="..." className="w-full bg-[#fff8e1] rounded-xl p-3 text-xs font-bold min-h-[80px] outline-none mb-4" />
            <div className="flex gap-3">
              <button onClick={(e) => deleteItem(editingImage.folderId, editingImage.image.id, 'image', e)} className="jelly-button p-3 bg-[#ff5252] text-white"><TrashIcon size={18}/></button>
              <button onClick={saveImageChanges} className="jelly-button flex-1 py-3 bg-[#2196f3] text-white font-black">{t.save}</button>
            </div>
          </div>
        </div>
      )}

      {summaryText && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-6 bg-black/50 overlay-fade">
          <div className="jelly-card bg-white w-full max-w-xs p-6 jelly-pop text-center">
            <h3 className="text-lg font-black mb-4 flex justify-center items-center gap-2 text-[#9c27b0]"><SparklesIcon /> {t.summaryTitle}</h3>
            <p className="bg-[#f3e5f5] p-5 rounded-xl font-bold text-sm leading-relaxed mb-6">{summaryText}</p>
            <button onClick={() => setSummaryText(null)} className="jelly-button w-full py-4 bg-[#9c27b0] text-white font-black">{t.cancel}</button>
          </div>
        </div>
      )}

      {isCreatingFolder && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/40 overlay-fade">
          <div className="jelly-card bg-white w-full max-w-[260px] p-6 jelly-pop">
            <h3 className="text-lg font-black mb-4">{t.newFolder}</h3>
            <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="w-full bg-[#f0f4ff] rounded-xl p-3 mb-5 font-black outline-none text-xs border border-black/5" onKeyDown={(e) => e.key === 'Enter' && createFolder()} />
            <div className="flex gap-3"><button onClick={() => setIsCreatingFolder(false)} className="jelly-button flex-1 py-3 bg-slate-100 font-black text-xs">{t.cancel}</button><button onClick={createFolder} className="jelly-button flex-1 py-3 bg-[#2196f3] text-white font-black text-xs">{t.create}</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
