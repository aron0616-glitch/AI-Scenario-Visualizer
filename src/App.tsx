/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { 
  Plus, 
  Send, 
  User, 
  Image as ImageIcon, 
  Loader2, 
  ChevronRight, 
  ArrowLeft, 
  Sparkles, 
  Edit3, 
  Download,
  RefreshCcw,
  CheckCircle2,
  AlertCircle,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import JSZip from 'jszip';

// --- Global Types ---
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

// --- Types ---

interface Character {
  id: string;
  name: string;
  description: string;
  profileImageUrl?: string;
}

interface ScriptLine {
  id: string;
  text: string;
  sceneDescription: string;
  imageUrl?: string;
  isGenerating?: boolean;
}

interface VisualContext {
  visualStyle: string;
  environment: string;
  nationality: string;
}

type AppState = 'KEY_SELECTION' | 'INPUT' | 'ANALYZING' | 'CHARACTERS' | 'SCENES';

// --- Components ---

const LoadingOverlay = ({ message }: { message: string }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white p-6 text-center">
    <Loader2 className="w-12 h-12 animate-spin mb-4 text-emerald-400" />
    <p className="text-xl font-medium tracking-tight">{message}</p>
    <p className="text-sm opacity-60 mt-2">This may take a moment for 4K generation...</p>
  </div>
);

export default function App() {
  const [appState, setAppState] = useState<AppState>('KEY_SELECTION');
  const [script, setScript] = useState('');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scriptLines, setScriptLines] = useState<ScriptLine[]>([]);
  const [visualContext, setVisualContext] = useState<VisualContext>({ visualStyle: '', environment: '', nationality: '한국' });
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [editingImage, setEditingImage] = useState<{ type: 'character' | 'scene', id: string, url: string } | null>(null);
  const [editPrompt, setEditPrompt] = useState('');

  // Check for API Key on mount
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
        setHasKey(true);
        setAppState('INPUT');
      }
    };
    checkKey();
  }, []);

  const handleOpenKeySelector = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasKey(true);
      setAppState('INPUT');
    }
  };

  const getAI = () => {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  };

  const analyzeScript = async () => {
    if (!script.trim()) return;
    
    setLoadingMessage('대본을 분석하고 캐릭터를 추출하는 중입니다...');
    setAppState('ANALYZING');

    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `다음 시나리오 대본을 분석해주세요.
        1. 주요 등장인물을 추출하고 각 인물에 대해 상세한 외모 묘사(나이, 머리 색상 및 스타일, 눈 색상, 특징적인 얼굴 특징, 전형적인 의상 스타일)를 제공하여 모든 이미지에서 시각적 일관성을 유지할 수 있도록 하세요. 묘사는 한국어로 제공하세요. 등장인물은 ${visualContext.nationality}인의 특징과 스타일을 가져야 합니다.
        2. 시나리오 전체의 "visualStyle"(예: 영화 같은, 느와르, 밝고 화사한, 사실적인)과 "environment" 컨텍스트(예: 현대 서울, 19세기 런던, 미래 우주 정거장)를 정의하세요. 한국어로 제공하세요. 환경은 가능한 경우 ${visualContext.nationality} 설정을 반영해야 합니다.
        3. 대본을 주요 시각적 장면/라인으로 나누세요. 각 라인에 대해 이미지 생성기용 프롬프트인 "sceneDescription"을 제공하세요. 한국어로 제공하세요.
        
        대본:
        ${script}
        
        결과는 반드시 순수 JSON 형식으로만 반환하세요.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              visualStyle: { type: Type.STRING },
              environment: { type: Type.STRING },
              characters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING }
                  },
                  required: ["name", "description"]
                }
              },
              lines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    sceneDescription: { type: Type.STRING }
                  },
                  required: ["text", "sceneDescription"]
                }
              }
            },
            required: ["visualStyle", "environment", "characters", "lines"]
          }
        }
      });

      if (!response.text) {
        throw new Error("AI 응답이 비어있습니다.");
      }

      // Clean JSON string in case of markdown blocks
      const cleanJson = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanJson);
      
      const newChars = (data.characters || []).map((c: any, i: number) => ({ ...c, id: `char-${i}` }));
      const newLines = (data.lines || []).map((l: any, i: number) => ({ ...l, id: `line-${i}` }));
      
      if (newChars.length === 0) {
        throw new Error("캐릭터를 추출하지 못했습니다. 대본을 확인해주세요.");
      }

      const newContext = { 
        visualStyle: data.visualStyle || 'Cinematic', 
        environment: data.environment || 'Realistic',
        nationality: visualContext.nationality 
      };

      setVisualContext(newContext);
      setCharacters(newChars);
      setScriptLines(newLines);
      setAppState('CHARACTERS');

      // Automatically start generating character profiles
      newChars.forEach((char: any) => {
        generateCharacterProfile(char.id, newChars, newContext);
      });
    } catch (error: any) {
      console.error("Analysis error:", error);
      alert(`대본 분석 중 오류가 발생했습니다: ${error.message || "알 수 없는 오류"}`);
      setAppState('INPUT');
    } finally {
      setLoadingMessage(null);
    }
  };

  const generateCharacterProfile = async (charId: string, currentChars?: Character[], context?: VisualContext) => {
    const charList = currentChars || characters;
    const activeContext = context || visualContext;
    const char = charList.find(c => c.id === charId);
    if (!char) return;

    // Only show global loading if manually triggered (no currentChars passed)
    const isManual = !currentChars;
    if (isManual) setLoadingMessage(`Generating 4K profile for ${char.name}...`);
    
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: `A highly detailed 4K realistic portrait profile of a character named ${char.name}. 
            Nationality/Ethnicity: STRICTLY ${activeContext.nationality}. 
            Description: ${char.description}. 
            Style: ${activeContext.visualStyle}. 
            Environment: ${activeContext.environment}. 
            Single unified portrait shot, NO split screens, NO multiple panels, NO collage. 
            Cinematic lighting, 9:16 aspect ratio, professional photography, consistent character features, ultra-realistic.` }]
        },
        config: {
          imageConfig: {
            aspectRatio: "9:16",
            imageSize: "4K"
          }
        }
      });

      let imageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageUrl) {
        setCharacters(prev => prev.map(c => c.id === charId ? { ...c, profileImageUrl: imageUrl } : c));
      }
    } catch (error) {
      console.error("Image generation error:", error);
      if (isManual) alert("Failed to generate image. If this is a billing error, please re-select your API key.");
    } finally {
      if (isManual) setLoadingMessage(null);
    }
  };

  const generateSceneImage = async (lineId: string, currentLines?: ScriptLine[], currentChars?: Character[], context?: VisualContext) => {
    const linesList = currentLines || scriptLines;
    const charsList = currentChars || characters;
    const activeContext = context || visualContext;
    const line = linesList.find(l => l.id === lineId);
    if (!line) return;

    setScriptLines(prev => prev.map(l => l.id === lineId ? { ...l, isGenerating: true } : l));
    
    try {
      const ai = getAI();
      // Include character descriptions for consistency
      const charContext = charsList.map(c => `${c.name} (Nationality: ${activeContext.nationality}): ${c.description}`).join('. ');
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: `A highly detailed 4K realistic cinematic scene. 
            Scene Action: ${line.sceneDescription}. 
            Character Appearance Context (STRICT CONSISTENCY REQUIRED): ${charContext}. 
            Global Nationality/Ethnicity: ${activeContext.nationality}.
            Global Visual Style: ${activeContext.visualStyle}. 
            Environment Setting: ${activeContext.environment}. 
            Single unified cinematic shot, NO split screens, NO multiple panels, NO collage, NO 3-way split. 
            9:16 aspect ratio, cinematic lighting, ultra-realistic, 8k resolution style, consistent character faces, hair, and clothing.` }]
        },
        config: {
          imageConfig: {
            aspectRatio: "9:16",
            imageSize: "4K"
          }
        }
      });

      let imageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageUrl) {
        setScriptLines(prev => prev.map(l => l.id === lineId ? { ...l, imageUrl, isGenerating: false } : l));
      }
    } catch (error: any) {
      console.error("Scene generation error:", error);
      if (error.message?.includes("Requested entity was not found")) {
        setHasKey(false);
        setAppState('KEY_SELECTION');
      }
      setScriptLines(prev => prev.map(l => l.id === lineId ? { ...l, isGenerating: false } : l));
    }
  };

  const handleEditImage = async () => {
    if (!editingImage || !editPrompt) return;

    setLoadingMessage("Applying edits to image...");
    try {
      const ai = getAI();
      const base64Data = editingImage.url.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: 'image/png' } },
            { text: `Modify this image based on the following request: ${editPrompt}. Maintain the 4K realistic style and 9:16 aspect ratio.` }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: "9:16",
            imageSize: "4K"
          }
        }
      });

      let imageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageUrl) {
        if (editingImage.type === 'character') {
          setCharacters(prev => prev.map(c => c.id === editingImage.id ? { ...c, profileImageUrl: imageUrl } : c));
        } else {
          setScriptLines(prev => prev.map(l => l.id === editingImage.id ? { ...l, imageUrl } : l));
        }
        setEditingImage(null);
        setEditPrompt('');
      }
    } catch (error) {
      console.error("Edit error:", error);
      alert("Failed to edit image.");
    } finally {
      setLoadingMessage(null);
    }
  };

  const generateAllProfiles = async () => {
    setLoadingMessage("모든 캐릭터 프로필을 새로운 국적 설정으로 재생성 중...");
    try {
      for (const char of characters) {
        await generateCharacterProfile(char.id);
      }
    } catch (error) {
      console.error("Batch generation error:", error);
    } finally {
      setLoadingMessage(null);
    }
  };

  const downloadAllScenes = async () => {
    const generatedScenes = scriptLines.filter(l => l.imageUrl);
    if (generatedScenes.length === 0) {
      alert("다운로드할 수 있는 생성된 장면이 없습니다.");
      return;
    }

    setLoadingMessage("모든 장면을 압축하는 중...");
    try {
      const zip = new JSZip();
      const folder = zip.folder("scenes");
      
      generatedScenes.forEach((line, index) => {
        if (line.imageUrl) {
          const base64Data = line.imageUrl.split(',')[1];
          folder?.file(`scene-${index + 1}.png`, base64Data, { base64: true });
        }
      });

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = "all-scenes.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Zip error:", error);
      alert("압축 중 오류가 발생했습니다.");
    } finally {
      setLoadingMessage(null);
    }
  };

  // --- Renderers ---

  if (appState === 'KEY_SELECTION') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-[#141414] border border-white/10 rounded-3xl p-8 text-center shadow-2xl"
        >
          <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Key className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-4">API Key Required</h1>
          <p className="text-gray-400 mb-8 leading-relaxed">
            To generate high-quality 4K images, you need to select a paid Gemini API key. 
            Please ensure your project has billing enabled.
          </p>
          <button
            onClick={handleOpenKeySelector}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 group"
          >
            Select API Key
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <p className="mt-6 text-xs text-gray-500">
            Visit <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline hover:text-emerald-400">billing documentation</a> for more info.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      {loadingMessage && <LoadingOverlay message={loadingMessage} />}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/80 backdrop-blur-xl border-bottom border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-none">Scenario Visualizer</h1>
            <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">4K Cinema Engine</span>
          </div>
        </div>
        
        {appState !== 'INPUT' && (
          <button 
            onClick={() => setAppState('INPUT')}
            className="text-xs flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            New Project
          </button>
        )}
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {appState === 'INPUT' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-4xl font-bold tracking-tighter mb-4">Bring your script to life.</h2>
                <p className="text-gray-400 text-lg mb-6">Paste your full scenario script below. We'll analyze characters and generate 4K realistic visuals for every line.</p>
                
                <div className="bg-[#141414] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">인물 및 배경 국적 선택</span>
                  <div className="flex flex-wrap gap-2">
                    {['한국', '일본', '중국', '러시아', '미국'].map((nat) => (
                      <button
                        key={nat}
                        onClick={() => setVisualContext(prev => ({ ...prev, nationality: nat }))}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${visualContext.nationality === nat ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                      >
                        {nat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="relative group">
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Enter your script here... e.g.
INTERIOR. COFFEE SHOP - DAY
John sits alone, staring at a cold cup of coffee.
Sarah enters, her eyes red from crying."
                  className="w-full h-[400px] bg-[#141414] border border-white/10 rounded-3xl p-8 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all resize-none placeholder:text-gray-600"
                />
                <button
                  onClick={analyzeScript}
                  disabled={!script.trim()}
                  className="absolute bottom-6 right-6 bg-white text-black px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
                >
                  Analyze Script
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {appState === 'CHARACTERS' && (
            <motion.div
              key="characters"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-12"
            >
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">1단계: 캐릭터 프로필 설정</h2>
                  <p className="text-gray-400">장면 생성 전, 인물들의 일관된 얼굴을 먼저 확정합니다.</p>
                  <div className="mt-4 flex flex-wrap gap-4">
                    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold block">국적 선택</span>
                      <div className="flex gap-2 mt-1">
                        {['한국', '일본', '중국', '러시아', '미국'].map((nat) => (
                          <button
                            key={nat}
                            onClick={() => setVisualContext(prev => ({ ...prev, nationality: nat }))}
                            className={`text-xs px-2 py-1 rounded-md transition-all ${visualContext.nationality === nat ? 'bg-emerald-500 text-black font-bold' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                          >
                            {nat}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={generateAllProfiles}
                        className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-500/20 transition-all flex items-center gap-2"
                      >
                        <RefreshCcw className="w-3 h-3" />
                        모든 프로필 재생성
                      </button>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold block">전체 스타일</span>
                      <input 
                        value={visualContext.visualStyle}
                        onChange={(e) => setVisualContext(prev => ({ ...prev, visualStyle: e.target.value }))}
                        className="bg-transparent text-sm text-emerald-400 focus:outline-none w-full"
                      />
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold block">배경 환경</span>
                      <input 
                        value={visualContext.environment}
                        onChange={(e) => setVisualContext(prev => ({ ...prev, environment: e.target.value }))}
                        className="bg-transparent text-sm text-emerald-400 focus:outline-none w-full"
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setAppState('SCENES');
                    // Automatically start generating all scene images
                    scriptLines.forEach(line => {
                      if (!line.imageUrl) {
                        generateSceneImage(line.id);
                      }
                    });
                  }}
                  className="bg-emerald-500 text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-400 transition-all"
                >
                  장면 생성으로 이동
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {characters.map((char) => (
                  <div key={char.id} className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden group">
                    <div className="aspect-[9/16] bg-black relative flex items-center justify-center overflow-hidden">
                      {char.profileImageUrl ? (
                        <>
                          <img src={char.profileImageUrl} alt={char.name} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                            <button 
                              onClick={() => setEditingImage({ type: 'character', id: char.id, url: char.profileImageUrl! })}
                              className="w-full bg-white/10 backdrop-blur-md border border-white/20 text-white py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-white/20 transition-all"
                            >
                              <Edit3 className="w-4 h-4" />
                              프로필 수정
                            </button>
                            <a 
                              href={char.profileImageUrl} 
                              download={`${char.name}-profile.png`}
                              className="w-full bg-white/10 backdrop-blur-md border border-white/20 text-white py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-white/20 transition-all"
                            >
                              <Download className="w-4 h-4" />
                              프로필 다운로드
                            </a>
                          </div>
                        </>
                      ) : (
                        <button 
                          onClick={() => generateCharacterProfile(char.id)}
                          className="flex flex-col items-center gap-4 text-gray-500 hover:text-emerald-400 transition-colors"
                        >
                          <div className="w-16 h-16 rounded-full border-2 border-dashed border-current flex items-center justify-center">
                            <Plus className="w-8 h-8" />
                          </div>
                          <span className="text-sm font-medium">4K 프로필 생성</span>
                        </button>
                      )}
                    </div>
                    <div className="p-6 space-y-4">
                      <h3 className="text-xl font-bold">{char.name}</h3>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">캐릭터 묘사 (프롬프트)</label>
                        <textarea 
                          value={char.description}
                          onChange={(e) => setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, description: e.target.value } : c))}
                          className="w-full bg-black/20 border border-white/5 rounded-xl p-3 text-sm text-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 resize-none h-24"
                        />
                      </div>
                      {char.profileImageUrl && (
                        <button 
                          onClick={() => generateCharacterProfile(char.id)}
                          className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-emerald-400 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/10 transition-all"
                        >
                          <RefreshCcw className="w-3 h-3" />
                          다시 생성하기
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {appState === 'SCENES' && (
            <motion.div
              key="scenes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-12"
            >
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">2단계: 장면 생성</h2>
                  <p className="text-gray-400">대본의 각 문장을 4K 실사 이미지로 시각화합니다.</p>
                </div>
                <button
                  onClick={downloadAllScenes}
                  className="bg-white/10 border border-white/20 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-white/20 transition-all"
                >
                  <Download className="w-5 h-5" />
                  전체 장면 다운로드 (.zip)
                </button>
              </div>

              <div className="space-y-8">
                {scriptLines.map((line, index) => (
                  <div key={line.id} className="bg-[#141414] border border-white/10 rounded-[40px] p-8 flex flex-col lg:flex-row gap-12 items-start">
                    <div className="flex-1 space-y-6">
                      <div className="flex items-center gap-4">
                        <span className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/20">
                          {index + 1}
                        </span>
                        <h3 className="text-2xl font-bold tracking-tight text-gray-200">장면 {index + 1}</h3>
                      </div>
                      
                      <div className="bg-black/40 rounded-2xl p-6 border border-white/5">
                        <p className="text-xl italic text-gray-300 leading-relaxed">"{line.text}"</p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">AI 비주얼 프롬프트 (수정 가능)</label>
                        <textarea 
                          value={line.sceneDescription}
                          onChange={(e) => setScriptLines(prev => prev.map(l => l.id === line.id ? { ...l, sceneDescription: e.target.value } : l))}
                          className="w-full bg-black/20 border border-white/5 rounded-xl p-4 text-sm text-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 resize-none h-32"
                        />
                      </div>

                      <div className="flex gap-3">
                        {!line.imageUrl && !line.isGenerating && (
                          <button
                            onClick={() => generateSceneImage(line.id)}
                            className="bg-white text-black px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-400 transition-all shadow-lg"
                          >
                            <ImageIcon className="w-5 h-5" />
                            4K 장면 생성
                          </button>
                        )}
                        {line.imageUrl && !line.isGenerating && (
                          <button
                            onClick={() => generateSceneImage(line.id)}
                            className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-6 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-500/20 transition-all"
                          >
                            <RefreshCcw className="w-5 h-5" />
                            다시 생성
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="w-full lg:w-[400px] aspect-[9/16] bg-black rounded-3xl overflow-hidden relative group border border-white/5 shadow-2xl">
                      {line.isGenerating ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
                          <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
                          <span className="text-sm font-medium animate-pulse">Rendering 4K Cinema...</span>
                        </div>
                      ) : line.imageUrl ? (
                        <>
                          <img src={line.imageUrl} alt={`Scene ${index + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all p-8 flex flex-col justify-end gap-4">
                            <button 
                              onClick={() => setEditingImage({ type: 'scene', id: line.id, url: line.imageUrl! })}
                              className="w-full bg-white text-black py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-400 transition-all"
                            >
                              <Edit3 className="w-5 h-5" />
                              장면 수정
                            </button>
                            <a 
                              href={line.imageUrl} 
                              download={`scene-${index+1}.png`}
                              className="w-full bg-white/10 backdrop-blur-md border border-white/20 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-all"
                            >
                              <Download className="w-5 h-5" />
                              4K 다운로드
                            </a>
                          </div>
                        </>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-gray-700">
                          <ImageIcon className="w-16 h-16 opacity-20" />
                          <span className="text-xs uppercase tracking-widest font-bold opacity-40">생성 대기 중</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <div className="max-w-5xl w-full flex flex-col lg:flex-row gap-12 items-center">
              <div className="w-full lg:w-[400px] aspect-[9/16] bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                <img src={editingImage.url} alt="To edit" className="w-full h-full object-cover" />
              </div>
              
              <div className="flex-1 space-y-8">
                <div>
                  <h2 className="text-4xl font-bold tracking-tighter mb-4">Modify Visual</h2>
                  <p className="text-gray-400 text-lg">Describe the changes you want to make. The AI will re-render the image while maintaining consistency.</p>
                </div>

                <textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder="e.g. Change the lighting to sunset, make the character look more surprised, or add a rainy window in the background..."
                  className="w-full h-40 bg-[#141414] border border-white/10 rounded-3xl p-6 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all resize-none"
                />

                <div className="flex gap-4">
                  <button
                    onClick={handleEditImage}
                    disabled={!editPrompt.trim()}
                    className="flex-1 bg-emerald-500 text-black py-5 rounded-2xl font-bold text-lg hover:bg-emerald-400 transition-all disabled:opacity-50"
                  >
                    Apply Changes
                  </button>
                  <button
                    onClick={() => { setEditingImage(null); setEditPrompt(''); }}
                    className="px-10 bg-white/5 border border-white/10 text-white py-5 rounded-2xl font-bold text-lg hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Status */}
      <footer className="fixed bottom-6 left-6 right-6 pointer-events-none flex justify-between items-end z-30">
        <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${hasKey ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
            {hasKey ? 'Engine Ready' : 'API Key Required'}
          </span>
        </div>
        
        <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600">
          Scenario Visualizer v1.0 • 4K Realistic Output
        </div>
      </footer>
    </div>
  );
}
