
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
  LanguagesIcon, 
  SaveIcon, 
  FilterIcon, 
  StickyNoteIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  Edit3Icon, 
  ZoomInIcon, 
  ZoomOutIcon, 
  MoveIcon, 
  SparklesIcon, 
  Loader2Icon, 
  PencilIcon, 
  CheckIcon,
  Undo2Icon,
  Redo2Icon
} from 'lucide-react';

// IndexedDB Utility for Large Data Persistence
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
    searchPlaceholder: "搜名字、标签或便签...",
    folderSearchPlaceholder: "在此文件夹内搜索标签...",
    newFolder: "新建文件夹",
    create: "创建",
    cancel: "取消",
    all: "全部显示",
    tags: "标签",
    notes: "便签",
    images: "张照片",
    empty: "空空如也...",
    confirmDelete: "确定要删掉这个果冻盒吗？",
    save: "保存",
    editImage: "编辑图片详情",
    filter: "筛选",
    tagLibrary: "我的标签库",
    readingMode: "阅览模式",
    exitReading: "退出",
    normalMode: "普通模式",
    addTag: "添加标签...",
    add: "添加",
    aiSummary: "AI 总结",
    summarizing: "正在思考...",
    summaryTitle: "文件夹 AI 简报",
    holdToDrag: "长按图片以开启拖拽",
    annotate: "批注",
    saveAnnotation: "保存批注",
    clear: "清除",
    loading: "载入中...",
    newNote: "新建便签",
    editNote: "编辑便签",
    saveNote: "保存便签",
    networkError: "网络连接似乎有问题，请检查网络后再试哦！📡",
    editHint: "长按可进行编辑",
    delete: "删除",
    undo: "撤回",
    redo: "重做"
  },
  en: {
    title: "Jelly Gallery",
    searchPlaceholder: "Search names, tags, notes...",
    folderSearchPlaceholder: "Search tags in this folder...",
    newFolder: "New Folder",
    create: "Create",
    cancel: "Cancel",
    all: "Show All",
    tags: "TAGS",
    notes: "NOTES",
    images: "images",
    empty: "It's empty here...",
    confirmDelete: "Delete this folder and all contents?",
    save: "Save",
    editImage: "Edit Image Details",
    filter: "Filter",
    tagLibrary: "Tag Library",
    readingMode: "Reading Mode",
    exitReading: "Exit",
    normalMode: "Normal Mode",
    addTag: "Add tag...",
    add: "Add",
    aiSummary: "AI Summary",
    summarizing: "Thinking...",
    summaryTitle: "Folder AI Brief",
    holdToDrag: "Hold to enable dragging",
    annotate: "Annotate",
    saveAnnotation: "Save",
    clear: "Clear",
    loading: "Loading...",
    newNote: "New Note",
    editNote: "Edit Note",
    saveNote: "Save Note",
    networkError: "Network issue detected, please check your connection! 📡",
    editHint: "Long press to edit",
    delete: "Delete",
    undo: "Undo",
    redo: "Redo"
  }
};

const DEFAULT_BASE_SCALE = 1.4; // 140% as the new 100%

const App: React.FC = () => {
  const [lang, setLang] = useState<'zh' | 'en'>(() => {
    return (localStorage.getItem('vault_lang') as 'zh' | 'en') || 'zh';
  });
  const t = translations[lang];

  const [folders, setFolders] = useState<Folder[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [folderSearchQuery, setFolderSearchQuery] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [isLogoBouncing, setIsLogoBouncing] = useState(false);

  // Note States
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);

  // AI Summary States
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Reading Mode States
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [readingIndex, setReadingIndex] = useState(0);
  const [zoomScale, setZoomScale] = useState(DEFAULT_BASE_SCALE);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isDragReady, setIsDragReady] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const pointerStartPos = useRef({ x: 0, y: 0 });
  const longPressTimer = useRef<number | null>(null);
  const gridLongPressTimer = useRef<number | null>(null);

  // Annotation States
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [strokeColor, setStrokeColor] = useState('#e91e63');
  const [history, setHistory] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const annotationColors = ['#e91e63', '#9c27b0', '#2196f3', '#4caf50', '#ffeb3b'];

  const [editingImage, setEditingImage] = useState<{folderId: string, image: ImageItem} | null>(null);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editNote, setEditNote] = useState('');
  const [newTagInput, setNewTagInput] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial Load from IndexedDB
  useEffect(() => {
    getFoldersFromDB().then((data) => {
      setFolders(data);
      setIsInitializing(false);
    });
  }, []);

  // Sync to IndexedDB on change
  useEffect(() => {
    if (!isInitializing) {
      saveFoldersToDB(folders);
    }
  }, [folders, isInitializing]);

  useEffect(() => {
    localStorage.setItem('vault_lang', lang);
  }, [lang]);

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

  const currentReadingItem = useMemo(() => {
    return filteredItems[readingIndex];
  }, [filteredItems, readingIndex]);

  const createFolder = () => {
    if (!newFolderName.trim()) return;
    const newFolder: Folder = {
      id: Date.now().toString(),
      name: newFolderName,
      images: [],
      notes: [],
      createdAt: Date.now(),
    };
    setFolders([...folders, newFolder]);
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !activeFolderId) return;
    const file = files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const newImage: ImageItem = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        data: reader.result as string,
        tags: [],
        note: '',
        timestamp: Date.now(),
      };
      setEditingImage({ folderId: activeFolderId, image: newImage });
      setEditTags([]);
      setEditNote('');
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
        const newImages = imageExists 
          ? f.images.map(i => i.id === image.id ? updatedImage : i)
          : [...f.images, updatedImage];
        return { ...f, images: newImages };
      }
      return f;
    }));
    setEditingImage(null);
  };

  const openNewNote = () => {
    setEditingNote({
      id: Math.random().toString(36).substr(2, 9),
      content: '',
      timestamp: Date.now(),
    });
    setIsNoteModalOpen(true);
  };

  const saveNote = () => {
    if (!editingNote || !activeFolderId) return;
    
    setFolders(prev => prev.map(f => {
      if (f.id === activeFolderId) {
        const existingNotes = f.notes || [];
        const isExisting = existingNotes.some(n => n.id === editingNote.id);
        const newNotes = isExisting
          ? existingNotes.map(n => n.id === editingNote.id ? editingNote : n)
          : [...existingNotes, { ...editingNote, timestamp: Date.now() }];
        return { ...f, notes: newNotes };
      }
      return f;
    }));
    setEditingNote(null);
    setIsNoteModalOpen(false);
  };

  const deleteFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t.confirmDelete)) {
      setFolders(folders.filter(f => f.id !== id));
      if (activeFolderId === id) setActiveFolderId(null);
    }
  };

  const deleteItem = (folderId: string, itemId: string, type: 'image' | 'note', e: React.MouseEvent) => {
    e.stopPropagation();
    setFolders(prev => prev.map(f => {
      if (f.id === folderId) {
        if (type === 'image') {
          return { ...f, images: f.images.filter(img => img.id !== itemId) };
        } else {
          return { ...f, notes: (f.notes || []).filter(note => note.id !== itemId) };
        }
      }
      return f;
    }));
    if (editingImage?.image.id === itemId) setEditingImage(null);
    if (editingNote?.id === itemId) {
      setEditingNote(null);
      setIsNoteModalOpen(false);
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

  const handleWheel = (e: React.WheelEvent) => {
    if (isReadingMode) {
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoomScale(prev => Math.min(Math.max(prev + delta, 0.4), 14));
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (isReadingMode && !isAnnotating) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointerStartPos.current = { x: e.clientX, y: e.clientY };
      longPressTimer.current = window.setTimeout(() => {
        setIsDragReady(true);
        setIsDragging(true);
        setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }, 500);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (isReadingMode && !isAnnotating) {
      if (longPressTimer.current && !isDragReady) {
        const dx = e.clientX - pointerStartPos.current.x;
        const dy = e.clientY - pointerStartPos.current.y;
        if (Math.sqrt(dx*dx + dy*dy) > 10) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }
      if (isDragging && isDragReady) {
        setPanOffset({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        });
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isDragging) {
      setIsDragging(false);
      setIsDragReady(false);
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const resetReading = () => {
    if (isAnnotating) return;
    setZoomScale(DEFAULT_BASE_SCALE);
    setPanOffset({ x: 0, y: 0 });
  };

  const startAnnotating = () => {
    if (currentReadingItem.itemType !== 'image') return;
    setIsAnnotating(true);
    setHistory([]);
    setRedoStack([]);
    setZoomScale(DEFAULT_BASE_SCALE);
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

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(canvas.width, canvas.height) / 100;
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

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleDrawEnd = () => {
    if (isDrawingRef.current && isAnnotating) {
      const canvas = annotationCanvasRef.current;
      if (canvas) {
        const currentData = canvas.toDataURL();
        setHistory(prev => [...prev, currentData]);
        setRedoStack([]); 
      }
    }
    isDrawingRef.current = false;
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const current = history[history.length - 1];
    const prev = history[history.length - 2];
    
    setRedoStack(prevRedo => [current, ...prevRedo]);
    setHistory(prevHistory => prevHistory.slice(0, -1));

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = prev;
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const next = redoStack[0];
    setHistory(prev => [...prev, next]);
    setRedoStack(prev => prev.slice(1));

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = next;
  };

  const saveAnnotation = () => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const newData = canvas.toDataURL('image/png');

    setFolders(prev => prev.map(f => {
      if (f.id === activeFolderId) {
        return {
          ...f,
          images: f.images.map(img => 
            img.id === currentReadingItem.id ? { ...img, data: newData } : img
          )
        };
      }
      return f;
    }));
    
    setIsAnnotating(false);
    setHistory([]);
    setRedoStack([]);
  };

  const handleAiSummarize = async () => {
    if (!activeFolder || (activeFolder.images.length === 0 && (!activeFolder.notes || activeFolder.notes.length === 0))) return;
    setIsSummarizing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `你是一个专业的相册分析助手。请总结这个名为 "${activeFolder.name}" 的文件夹里的内容。
      文件夹包含 ${activeFolder.images.length} 张图片和 ${activeFolder.notes?.length || 0} 条便签。
      图片标签和备注如下：
      ${activeFolder.images.map(img => `- 图片标签: ${img.tags.join(', ')}, 备注: ${img.note}`).join('\n')}
      便签内容如下：
      ${(activeFolder.notes || []).map(note => `- 便签: ${note.content}`).join('\n')}
      
      请提供一个简短幽默的总结，总字数严禁超过300字。
      注意：请勿使用 "*" 符号进行任何加粗或列表标记，直接输出纯文本。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      const cleanText = (response.text || "总结失败，请重试。").replaceAll('*', '');
      setSummaryText(cleanText);
    } catch (error) {
      console.error(error);
      setSummaryText(t.networkError);
    } finally {
      setIsSummarizing(false);
    }
  };

  const ColorfulTitle = () => {
    const colors = ['#e91e63', '#9c27b0', '#2196f3', '#4caf50', '#ff9800'];
    const title = lang === 'zh' ? '果冻画册' : 'Jelly Gallery';
    return (
      <div className="flex font-black italic whitespace-nowrap">
        {title.split('').map((char, i) => (
          <span key={i} style={{ color: colors[i % colors.length] }}>{char}</span>
        ))}
      </div>
    );
  };

  const folderColors = [
    '#fff9c4', // Yellow
    '#e1f5fe', // Blue
    '#fce4ec', // Pink
    '#f1f8e9', // Green
    '#f3e5f5'  // Purple
  ];

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f7f9ff]">
        <Loader2Icon className="animate-spin text-[#2196f3]" size={48} />
        <p className="mt-4 font-black text-[#1a1a1a]">{t.loading}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-[#f7f9ff] overflow-hidden text-[#1a1a1a] relative">
      <header className="p-6 bg-[#fff0f6] sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {activeFolderId ? (
              <button onClick={() => { setActiveFolderId(null); setFolderSearchQuery(''); setIsReadingMode(false); }} className="jelly-button p-2 bg-white flex-shrink-0">
                <ArrowLeftIcon size={24} />
              </button>
            ) : (
              <div 
                className={`bg-[#ffeb3b] p-2 jelly-button cursor-pointer flex-shrink-0 ${isLogoBouncing ? 'animate-jelly' : ''}`}
                onMouseEnter={() => setIsLogoBouncing(true)}
                onAnimationEnd={() => setIsLogoBouncing(false)}
                onClick={() => setIsLogoBouncing(true)}
              >
                <TagIcon className="text-[#e91e63]" size={28} />
              </div>
            )}
            <div className="min-w-0 overflow-visible">
              <h1 className="text-2xl tracking-tight">
                {activeFolderId ? (
                  <span className="font-black truncate block">{activeFolder?.name}</span>
                ) : (
                  <ColorfulTitle />
                )}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {activeFolderId && (
              <>
                <button 
                  onClick={handleAiSummarize}
                  disabled={isSummarizing}
                  className={`jelly-button p-3 bg-white ${isSummarizing ? 'opacity-50' : ''}`}
                  title={t.aiSummary}
                >
                  {isSummarizing ? <Loader2Icon size={24} className="animate-spin text-[#9c27b0]" /> : <SparklesIcon size={24} className="text-[#9c27b0]" />}
                </button>
                <button 
                  onClick={openNewNote}
                  className="jelly-button p-3 bg-[#eef2ff] text-[#1a1a1a]"
                  title={t.newNote}
                >
                  <StickyNoteIcon size={24} strokeWidth={3} />
                </button>
              </>
            )}
            {!activeFolderId && (
              <button 
                onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
                className="jelly-button flex items-center gap-1 bg-white px-3 py-1.5 text-xs font-bold mr-1"
              >
                <LanguagesIcon size={14} />
                {lang === 'zh' ? 'EN' : '中'}
              </button>
            )}
            <button 
              onClick={() => {
                if (activeFolderId) {
                  fileInputRef.current?.click();
                } else {
                  setIsCreatingFolder(true);
                }
              }}
              className="jelly-button p-3 bg-[#4caf50] text-white"
            >
              <PlusIcon size={24} strokeWidth={3} />
            </button>
          </div>
          <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImagePick} />
        </div>

        {!activeFolderId ? (
          <div className="flex gap-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1a1a1a]" size={20} />
              <input 
                type="text"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white rounded-2xl py-3 pl-12 pr-4 text-sm font-bold outline-none shadow-sm"
              />
            </div>
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`jelly-button p-3 ${isFilterOpen || selectedTagFilter ? 'bg-[#2196f3] text-white' : 'bg-white text-[#1a1a1a]'}`}
            >
              <FilterIcon size={20} strokeWidth={3} />
            </button>
          </div>
        ) : (
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1a1a1a]" size={20} />
            <input 
              type="text"
              placeholder={t.folderSearchPlaceholder}
              value={folderSearchQuery}
              onChange={(e) => setFolderSearchQuery(e.target.value)}
              className="w-full bg-white rounded-2xl py-3 pl-12 pr-4 text-sm font-bold outline-none shadow-sm"
            />
            <div className="mt-2 text-[10px] text-slate-400 font-bold px-2">{t.editHint}</div>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-6 pb-20 z-10 no-scrollbar">
        {!activeFolderId ? (
          <div className="grid grid-cols-2 gap-5">
            {filteredFolders.length === 0 ? (
              <div className="col-span-2 text-center py-20">
                <div className="bg-white inline-block p-6 jelly-card mb-4">
                  <FolderIcon size={64} className="text-[#ff9800] opacity-50" />
                </div>
                <p className="font-black text-xl text-[#1a1a1a]">{t.empty}</p>
              </div>
            ) : (
              filteredFolders.map((folder, idx) => (
                <div 
                  key={folder.id}
                  onClick={() => setActiveFolderId(folder.id)}
                  className="jelly-card p-4 relative group cursor-pointer flex flex-col items-center justify-center bg-white"
                >
                  <div 
                    className="w-12 h-12 q-folder-blob flex items-center justify-center mb-2 border border-black/5 shadow-inner"
                    style={{ backgroundColor: folderColors[idx % folderColors.length] }}
                  >
                    <FolderIcon size={22} className="text-[#1a1a1a]/30" strokeWidth={1.5} />
                  </div>
                  <div className="font-black text-center truncate w-full px-1 text-sm">{folder.name}</div>
                  <div className="text-[9px] font-bold text-slate-400/80">{(folder.images.length || 0) + (folder.notes?.length || 0)} 件果冻</div>
                  <button 
                    onClick={(e) => deleteFolder(folder.id, e)}
                    className="absolute -top-1.5 -right-1.5 jelly-button p-1 bg-[#ff5252] text-white"
                  >
                    <TrashIcon size={12} strokeWidth={3} />
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filteredItems.length === 0 ? (
              <div className="col-span-3 text-center py-10">
                <p className="font-black text-slate-400">{t.empty}</p>
              </div>
            ) : (
              filteredItems.map((item: any) => (
                <div 
                  key={item.id} 
                  onPointerDown={() => handleGridPointerDown(item)}
                  onPointerUp={() => handleGridPointerUp(item)}
                  onPointerLeave={() => { if(gridLongPressTimer.current) { clearTimeout(gridLongPressTimer.current); gridLongPressTimer.current = null; } }}
                  className="jelly-card aspect-square overflow-hidden relative p-1.5 bg-white cursor-pointer transition-all touch-none"
                >
                  {item.itemType === 'image' ? (
                    <>
                      <img src={item.data} alt={item.name} className="w-full h-full object-cover rounded-[1.25rem]" />
                      {item.tags.length > 0 && (
                        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-wrap gap-0.5 overflow-hidden">
                          {item.tags.slice(0, 1).map((tag: string) => (
                            <span key={tag} className="bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded-md font-black whitespace-nowrap">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full bg-[#fdfcf0] p-3 rounded-[1.25rem] flex flex-col justify-between border-2 border-dashed border-black/10">
                      <StickyNoteIcon size={18} className="text-black/30" />
                      <p className="text-[9px] font-bold leading-tight line-clamp-3 overflow-hidden text-ellipsis text-slate-600">{item.content}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Note Edit Modal */}
      {isNoteModalOpen && editingNote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[120] flex items-center justify-center p-6">
          <div className="jelly-card bg-[#fdfcf0] w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2 text-slate-700">
                <StickyNoteIcon size={24} strokeWidth={3} />
                <h3 className="text-xl font-black">{t.editNote}</h3>
              </div>
              <button onClick={() => setIsNoteModalOpen(false)} className="jelly-button p-2 bg-white">
                <XIcon size={20} strokeWidth={3} />
              </button>
            </div>
            <textarea
              autoFocus
              value={editingNote.content}
              onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
              className="w-full bg-white rounded-2xl p-4 min-h-[200px] font-bold outline-none resize-none shadow-sm"
              placeholder="..."
            />
            <div className="flex gap-4 mt-6">
              <button 
                onClick={(e) => deleteItem(activeFolderId!, editingNote.id, 'note', e)} 
                className="jelly-button flex-1 py-4 bg-[#ff5252] text-white font-black text-lg"
              >
                <TrashIcon size={20} className="inline mr-2" strokeWidth={3}/> {t.delete}
              </button>
              <button 
                onClick={saveNote} 
                className="jelly-button flex-[2] py-4 bg-[#4caf50] text-white font-black text-lg"
              >
                <CheckIcon size={20} className="inline mr-2" strokeWidth={3}/> {t.saveNote}
              </button>
            </div>
          </div>
        </div>
      )}

      {isReadingMode && activeFolder && currentReadingItem && (
        <div 
          className="fixed inset-0 reading-bg z-[100] flex flex-col items-center justify-center p-0 overflow-hidden select-none touch-none"
          onWheel={handleWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-[110] pointer-events-none">
            <div className="glass-panel px-3 py-1.5 rounded-full border border-white/20 pointer-events-auto">
              <span className="text-white font-black text-xs tracking-widest">
                {readingIndex + 1} <span className="text-white/40 font-normal">/</span> {filteredItems.length}
              </span>
            </div>
            
            <div className="flex gap-2 pointer-events-auto">
               {!isAnnotating && currentReadingItem.itemType === 'image' && (
                 <button 
                  onClick={startAnnotating}
                  className="jelly-button p-2 bg-[#ffeb3b] text-[#1a1a1a]"
                >
                  <PencilIcon size={18} strokeWidth={3} />
                </button>
               )}
               <button 
                onClick={(e) => { e.stopPropagation(); setIsReadingMode(false); setIsAnnotating(false); }}
                className="jelly-button px-4 py-2 bg-white text-black font-black flex items-center gap-2"
              >
                <XIcon size={16} strokeWidth={3} />
                <span className="text-[10px] uppercase tracking-wider">{t.exitReading}</span>
              </button>
            </div>
          </div>

          {!isAnnotating && (
            <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none z-[110]">
              <button 
                onClick={prevReading}
                className="pointer-events-auto jelly-button p-2.5 bg-white/10 text-white backdrop-blur-2xl border border-white/20 hover:bg-white/20 transition-all active:scale-90"
              >
                <ChevronLeftIcon size={24} strokeWidth={3} />
              </button>
              <button 
                onClick={nextReading}
                className="pointer-events-auto jelly-button p-2.5 bg-white/10 text-white backdrop-blur-2xl border border-white/20 hover:bg-white/20 transition-all active:scale-90"
              >
                <ChevronRightIcon size={24} strokeWidth={3} />
              </button>
            </div>
          )}

          {/* Zoom controls relocated to TOP, normalized so 1.4x is shown as 100% */}
          <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-4 glass-panel px-5 py-2.5 rounded-[1.75rem] border border-white/20 shadow-2xl z-[110]">
            <button 
              onClick={(e) => {e.stopPropagation(); setZoomScale(prev => Math.max(prev - 0.2, 0.4))}} 
              className="text-white p-1.5 hover:bg-white/10 rounded-full transition-colors pointer-events-auto"
            >
              <ZoomOutIcon size={20} />
            </button>
            <div className="flex flex-col items-center min-w-[50px]">
              <span className="text-white text-base font-black tracking-tighter">
                {Math.round((zoomScale / DEFAULT_BASE_SCALE) * 100)}%
              </span>
              <div className="w-12 h-0.5 bg-white/20 rounded-full mt-0.5 overflow-hidden">
                <div 
                  className="h-full bg-[#2196f3] transition-all" 
                  style={{ width: `${Math.min(((zoomScale / DEFAULT_BASE_SCALE) / 4) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
            <button 
              onClick={(e) => {e.stopPropagation(); setZoomScale(prev => Math.min(prev + 0.2, 14))}} 
              className="text-white p-1.5 hover:bg-white/10 rounded-full transition-colors pointer-events-auto"
            >
              <ZoomInIcon size={20} />
            </button>
          </div>

          <div 
            className={`w-full h-full flex items-center justify-center relative overflow-hidden transition-all duration-300 ${isDragReady ? 'cursor-grabbing' : isAnnotating ? 'cursor-crosshair' : 'cursor-grab'}`}
          >
            {isAnnotating ? (
              <div className="relative flex items-center justify-center w-full h-full p-4 overflow-hidden">
                <div 
                  className="transition-transform duration-150 ease-out"
                  style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})` }}
                >
                  <canvas
                    ref={annotationCanvasRef}
                    onPointerDown={handleDrawStart}
                    onPointerMove={handleDrawing}
                    onPointerUp={handleDrawEnd}
                    onPointerLeave={handleDrawEnd}
                    className="max-w-[95vw] max-h-[85vh] shadow-[0_0_60px_rgba(0,0,0,0.8)] bg-black/20 touch-none rounded-lg border-2 border-white/20"
                  />
                </div>
                
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-[120]">
                  <div className="flex gap-4 glass-panel p-2 rounded-2xl border border-white/30 shadow-2xl">
                    <button 
                      onClick={handleUndo}
                      disabled={history.length <= 1}
                      className={`p-3 rounded-xl transition-all ${history.length <= 1 ? 'opacity-30' : 'bg-white/20 text-white hover:bg-white/30'}`}
                      title={t.undo}
                    >
                      <Undo2Icon size={20} strokeWidth={3} />
                    </button>
                    <button 
                      onClick={handleRedo}
                      disabled={redoStack.length === 0}
                      className={`p-3 rounded-xl transition-all ${redoStack.length === 0 ? 'opacity-30' : 'bg-white/20 text-white hover:bg-white/30'}`}
                      title={t.redo}
                    >
                      <Redo2Icon size={20} strokeWidth={3} />
                    </button>
                  </div>

                  <div className="flex gap-2 glass-panel p-2 rounded-full border border-white/30 shadow-xl">
                    {annotationColors.map(color => (
                      <button
                        key={color}
                        onClick={() => setStrokeColor(color)}
                        className={`w-8 h-8 rounded-full border-2 transition-transform ${strokeColor === color ? 'scale-125 border-white shadow-lg' : 'border-black/20 shadow-inner'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-4">
                     <button 
                      onClick={() => { setIsAnnotating(false); setHistory([]); setRedoStack([]); }}
                      className="jelly-button px-6 py-2.5 bg-[#ff5252] text-white font-black text-sm flex items-center gap-2"
                    >
                      <XIcon size={16} strokeWidth={3}/> {t.cancel}
                    </button>
                    <button 
                      onClick={saveAnnotation}
                      className="jelly-button px-6 py-2.5 bg-[#4caf50] text-white font-black text-sm flex items-center gap-2"
                    >
                      <CheckIcon size={16} strokeWidth={3}/> {t.saveAnnotation}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                className={`transition-transform duration-150 ease-out flex items-center justify-center ${isDragReady ? 'scale-[1.02] drop-shadow-[0_0_20px_rgba(33,150,243,0.5)]' : ''}`}
                style={{ 
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`
                }}
              >
                {currentReadingItem.itemType === 'image' ? (
                  <img 
                    src={(currentReadingItem as ImageItem).data} 
                    alt="reading"
                    className={`max-w-[98vw] max-h-[88vh] object-contain rounded-lg shadow-[0_0_60px_rgba(0,0,0,0.8)] transition-all ${isDragReady ? 'ring-4 ring-[#2196f3]' : ''}`}
                    onDoubleClick={resetReading}
                  />
                ) : (
                  <div className="max-w-[85vw] max-h-[75vh] w-full jelly-card bg-[#fdfcf0] p-10 overflow-y-auto no-scrollbar">
                    <StickyNoteIcon className="mb-6 text-black/10" size={40} strokeWidth={3} />
                    <div className="text-xl font-bold text-slate-800 leading-relaxed whitespace-pre-wrap select-text">
                        {currentReadingItem.content}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {!isDragReady && !isAnnotating && (
              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none bg-black/30 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
                <span className="text-white text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5">
                   <MoveIcon size={12} /> {t.holdToDrag}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {summaryText && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setSummaryText(null)}></div>
          <div className="jelly-card bg-white w-full max-w-sm p-8 z-10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-6 text-[#9c27b0]">
              <SparklesIcon size={28} strokeWidth={3} />
              <h3 className="text-2xl font-black">{t.summaryTitle}</h3>
            </div>
            <div className="bg-[#f3e5f5] p-5 rounded-2xl mb-8 shadow-inner overflow-y-auto max-h-[40vh] no-scrollbar text-sm">
              <p className="font-bold leading-relaxed whitespace-pre-wrap">{summaryText}</p>
            </div>
            <button onClick={() => setSummaryText(null)} className="jelly-button w-full py-4 bg-[#9c27b0] text-white font-black text-lg">
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {!activeFolderId && isFilterOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end p-6 animate-in fade-in duration-300">
           <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-md" 
            onClick={() => setIsFilterOpen(false)}
          ></div>
          <div className="jelly-card p-8 bg-white flex flex-col max-h-[75%] w-full z-10 animate-in slide-in-from-bottom-full duration-500 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3 text-[#2196f3]">
                <TagIcon size={24} strokeWidth={3} />
                <span className="font-black uppercase tracking-[0.2em] text-lg">{t.tagLibrary}</span>
              </div>
              <button onClick={() => setIsFilterOpen(false)} className="jelly-button p-2 bg-[#f0f4ff]">
                <XIcon size={20} strokeWidth={4} />
              </button>
            </div>
            <div className="overflow-y-auto no-scrollbar flex-1">
              <div className="flex flex-wrap gap-3 pb-8">
                <button 
                  onClick={() => {setSelectedTagFilter(null); setIsFilterOpen(false);}}
                  className={`px-6 py-3 rounded-full text-base font-black transition-all ${!selectedTagFilter ? 'bg-[#2196f3] text-white' : 'bg-white text-[#1a1a1a] shadow-sm'}`}
                >
                  {t.all}
                </button>
                {allTags.map(tag => (
                  <button 
                    key={tag}
                    onClick={() => { setSelectedTagFilter(tag); setIsFilterOpen(false); }}
                    className={`px-6 py-3 rounded-full text-base font-black transition-all truncate max-w-full ${selectedTagFilter === tag ? 'bg-[#2196f3] text-white' : 'bg-[#fffde7] text-[#1a1a1a] shadow-sm active:scale-95'}`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {editingImage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-6">
          <div className="jelly-card bg-white w-full max-w-sm overflow-y-auto max-h-[90vh] p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black">{t.editImage}</h3>
              <button onClick={() => setEditingImage(null)} className="jelly-button p-2 bg-white">
                <XIcon size={20} strokeWidth={3} />
              </button>
            </div>
            <img src={editingImage.image.data} className="w-full h-48 object-cover rounded-2xl mb-6 shadow-md" />
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3 text-[#e91e63] font-black">
                  <TagIcon size={20} />
                  <span>{t.tags}</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {editTags.map(tag => (
                    <span key={tag} className="bg-[#fce4ec] text-[#e91e63] px-3 py-1 rounded-full text-xs font-black flex items-center gap-2">
                      #{tag}
                      <button onClick={() => setEditTags(prev => prev.filter(t => t !== tag))}><XIcon size={12} strokeWidth={4}/></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTagInput.trim()) {
                        if (!editTags.includes(newTagInput.trim().toLowerCase())) {
                          setEditTags([...editTags, newTagInput.trim().toLowerCase()]);
                        }
                        setNewTagInput('');
                      }
                    }}
                    placeholder={t.addTag} 
                    className="flex-1 bg-[#fffde7] rounded-xl px-4 py-2 text-sm font-bold outline-none shadow-inner"
                  />
                  <button 
                    onClick={() => {
                      if (newTagInput.trim() && !editTags.includes(newTagInput.trim().toLowerCase())) {
                        setEditTags([...editTags, newTagInput.trim().toLowerCase()]);
                        setNewTagInput('');
                      }
                    }} 
                    className="jelly-button px-4 bg-[#ffeb3b] font-black text-xs"
                  >
                    {t.add}
                  </button>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2 text-[#ff9800] font-black">
                  <StickyNoteIcon size={20} />
                  <span>{t.notes}</span>
                </div>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="..."
                  className="w-full bg-[#fff8e1] rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-[#ffc107] outline-none min-h-[80px] resize-none shadow-inner"
                />
              </div>
              <div className="flex gap-4 pt-2">
                <button onClick={(e) => deleteItem(editingImage.folderId, editingImage.image.id, 'image', e)} className="jelly-button flex-1 py-3 bg-[#ff5252] text-white font-black">
                  <TrashIcon size={18} className="inline mr-2" />
                </button>
                <button onClick={saveImageChanges} className="jelly-button flex-[2] py-3 bg-[#2196f3] text-white font-black">
                  <SaveIcon size={18} className="inline mr-2" />
                  {t.save}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Sheet */}
      {isCreatingFolder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[120] flex items-center justify-center p-6">
          <div className="jelly-card bg-white w-full max-w-xs p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black mb-6">{t.newFolder}</h3>
            <input 
              autoFocus
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full bg-[#f0f4ff] rounded-2xl p-4 mb-6 font-black outline-none shadow-inner"
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
            />
            <div className="flex gap-4">
              <button onClick={() => setIsCreatingFolder(false)} className="jelly-button flex-1 py-3 bg-[#f5f5f5] font-black">{t.cancel}</button>
              <button onClick={createFolder} className="jelly-button flex-1 py-3 bg-[#2196f3] text-white font-black">{t.create}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
