/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  BrainCircuit, 
  FileText, 
  LayoutGrid, 
  Image as ImageIcon, 
  Mic2, 
  Film, 
  PlayCircle,
  ArrowRight,
  ChevronRight,
  ArrowLeft,
  Send,
  History,
  Settings,
  User as UserIcon
} from 'lucide-react';

const workflowSteps = [
  {
    id: 1,
    title: "User Input",
    description: "User enters a topic or prompt through the web interface. Simply describe what you want to see, and DocuGen takes care of the rest.",
    icon: <Sparkles className="w-6 h-6" />,
    gradient: "from-blue-500 to-cyan-400"
  },
  {
    id: 2,
    title: "Topic Understanding",
    description: "Use Natural Language Processing (NLP) to analyze the user prompt and extract key ideas, themes, and historical context.",
    icon: <BrainCircuit className="w-6 h-6" />,
    gradient: "from-cyan-400 to-teal-400"
  },
  {
    id: 3,
    title: "Content Generation",
    description: "Generate a documentary-style script including a compelling introduction, detailed main points, and a thought-provoking conclusion.",
    icon: <FileText className="w-6 h-6" />,
    gradient: "from-teal-400 to-emerald-400"
  },
  {
    id: 4,
    title: "Scene Segmentation",
    description: "Divide the generated script into multiple scenes suitable for a short documentary, ensuring a logical narrative flow.",
    icon: <LayoutGrid className="w-6 h-6" />,
    gradient: "from-emerald-400 to-yellow-400"
  },
  {
    id: 5,
    title: "Visual Content Selection",
    description: "Automatically select or generate relevant images, video clips, or animations for each scene using advanced generative models.",
    icon: <ImageIcon className="w-6 h-6" />,
    gradient: "from-yellow-400 to-orange-500"
  },
  {
    id: 6,
    title: "Voice-over Generation",
    description: "Convert the generated script into natural, emotive narration using high-fidelity Text-to-Speech (TTS) technology.",
    icon: <Mic2 className="w-6 h-6" />,
    gradient: "from-orange-500 to-red-500"
  },
  {
    id: 7,
    title: "Video Composition",
    description: "Combine visuals, narration, background music, and smooth transitions to create a professional-grade video.",
    icon: <Film className="w-6 h-6" />,
    gradient: "from-red-500 to-purple-600"
  },
  {
    id: 8,
    title: "Final Video Output",
    description: "Generate a complete 1–3 minute micro-documentary video that users can preview, download, or share instantly.",
    icon: <PlayCircle className="w-6 h-6" />,
    gradient: "from-purple-600 to-indigo-600"
  }
];

import { GoogleGenAI } from "@google/genai";
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  onAuthStateChanged, 
  Timestamp,
  handleFirestoreError,
  OperationType
} from './firebase';
import type { User } from './firebase';

import AuthView from './components/AuthView';

// Initialize GoogleGenAI with API key validation
const getAIClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please set your Gemini API key in the .env.local file. ' +
      'Get your key from: https://ai.google.dev/auth'
    );
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

let ai: GoogleGenAI | null = null;
try {
  ai = getAIClient();
} catch (error) {
  console.error('Failed to initialize AI client:', error);
}

interface Scene {
  title: string;
  description: string;
  visualPrompt: string;
}

interface DocumentaryData {
  title: string;
  prompt: string;
  script: string;
  scenes: Scene[];
  sceneImages?: string[];
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mb-6">
            <Settings className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-2">Something went wrong</h2>
          <p className="text-zinc-500 mb-8 max-w-md mx-auto">
            The application encountered an unexpected error. Please try refreshing the page.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 rounded-full bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-all"
          >
            Refresh Page
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-8 p-4 bg-zinc-100 rounded-xl text-left text-xs overflow-auto max-w-full">
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [view, setView] = useState<'landing' | 'create' | 'generating' | 'result' | 'history' | 'auth'>('landing');
  const [prompt, setPrompt] = useState('');
  const [generationStep, setGenerationStep] = useState(0);
  const [docData, setDocData] = useState<DocumentaryData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<(DocumentaryData & { id: string, createdAt: any })[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchHistory(currentUser.uid);
      } else {
        setHistory([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchHistory = async (uid: string) => {
    setIsLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'documentaries'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as (DocumentaryData & { id: string, createdAt: any })[];
      setHistory(docs);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const saveDocumentary = async (data: DocumentaryData) => {
    if (!user) return;
    try {
      const newDocRef = doc(collection(db, 'documentaries'));
      const docToSave = {
        ...data,
        userId: user.uid,
        createdAt: Timestamp.now(),
      };
      await setDoc(newDocRef, docToSave);
      fetchHistory(user.uid); // Refresh history
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'documentaries');
    }
  };

  const handleLogin = () => setView('auth');

  const SCENE_DURATION = 15; // seconds per scene

  const handleCreateClick = () => setView('create');
  const handleBackClick = () => {
    setView('landing');
    setPrompt('');
    setGenerationStep(0);
    setDocData(null);
    setIsPlaying(false);
    setCurrentSceneIndex(0);
  };

  const generateImage = async (visualPrompt: string) => {
    try {
      if (!ai) {
        throw new Error(
          'AI service is not configured. Please set your GEMINI_API_KEY in the .env.local file. ' +
          'Get your key from: https://ai.google.dev/auth'
        );
      }
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview', // Reverting to free model to avoid 403 errors
        contents: {
          parts: [{ text: visualPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9"
          }
        }
      });
      
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      return null;
    } catch (error) {
      if (error instanceof Error) {
        console.error("Image generation failed:", error.message);
        if (error.message.includes('429') || error.message.includes('quota')) {
          console.warn("Rate limited - some images may not generate");
        } else if (error.message.includes('403') || error.message.includes('permission')) {
          console.warn("Permission denied - check API key and permissions");
        }
      } else {
        console.error("Image generation failed:", error);
      }
      return null;
    }
  };

  const generateDocumentary = async (userPrompt: string) => {
    try {
      if (!ai) {
        throw new Error(
          'AI service is not configured. Please set your GEMINI_API_KEY in the .env.local file. ' +
          'Get your key from: https://ai.google.dev/auth'
        );
      }
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview", // Using pro for better script
        contents: `Generate a detailed micro-documentary script and scene breakdown for the topic: "${userPrompt}". 
        Return the response in JSON format with the following structure:
        {
          "title": "A compelling title",
          "script": "The full narration script (approx 250 words)",
          "scenes": [
            {
              "title": "Scene title",
              "description": "What happens in this scene",
              "visualPrompt": "A detailed prompt for an image generator to create a cinematic, high-quality visual for this scene. Include style keywords like 'cinematic lighting', 'photorealistic', 'documentary style', '16:9 aspect ratio'."
            }
          ]
        }
        Provide exactly 6 scenes to make it a more substantial documentary.`,
        config: {
          responseMimeType: "application/json"
        }
      });

      const data = JSON.parse(response.text || '{}');
      
      // Validate response structure
      if (!data.title || !data.script || !data.scenes || !Array.isArray(data.scenes)) {
        throw new Error('Invalid response structure from AI model');
      }
      
      return { ...data, prompt: userPrompt } as DocumentaryData;
    } catch (error) {
      if (error instanceof Error) {
        console.error("Generation failed:", error.message);
        if (error.message.includes('API key') || error.message.includes('GEMINI_API_KEY')) {
          throw new Error('API Key Error: GEMINI_API_KEY is not configured');
        } else if (error.message.includes('Invalid response')) {
          console.warn("Using fallback content due to invalid AI response");
        } else if (error.message.includes('429')) {
          throw new Error('Rate limit exceeded. Please try again in a moment.');
        } else if (error.message.includes('403')) {
          throw new Error('Permission denied. Check your API key and billing.');
        }
      } else {
        console.error("Generation failed:", error);
      }
      
      // Use fallback content if generation fails
      console.warn("Using fallback content due to generation error");
      return {
        title: "The Wonders of " + userPrompt,
        prompt: userPrompt,
        script: "In a world where " + userPrompt + " defines our reality, we explore the depths of its impact on humanity and the future of our civilization. From its humble beginnings to its global influence today, we witness the transformation of our society through the lens of innovation and discovery.",
        scenes: Array(6).fill(0).map((_, i) => ({ 
          title: `Scene ${i + 1}`, 
          description: `Exploring the ${i === 0 ? 'origins' : i === 5 ? 'future' : 'impact'} of ${userPrompt}`, 
          visualPrompt: `Cinematic shot of ${userPrompt}` 
        }))
      } as DocumentaryData;
    }
  };

  const handleSend = async () => {
    if (!prompt.trim()) {
      alert("Please enter a topic for your documentary");
      return;
    }
    
    if (prompt.trim().length < 3) {
      alert("Please enter at least 3 characters");
      return;
    }
    
    setView('generating');
    setGenerationStep(1);

    try {
      // Step 1: Topic Understanding
      await new Promise(resolve => setTimeout(resolve, 1500));
      setGenerationStep(2);

      // Step 2 & 3: Content Generation (REAL AI CALL)
      const generatedData = await generateDocumentary(prompt);
      setDocData(generatedData);
      setGenerationStep(3);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 4: Scene Segmentation
      setGenerationStep(4);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 5: Visual Content Selection (REAL IMAGE GENERATION)
      setGenerationStep(5);
      let images: (string | null)[] = [];
      try {
        const imagePromises = generatedData.scenes.map(scene => generateImage(scene.visualPrompt));
        images = await Promise.all(imagePromises);
        
        setDocData(prev => prev ? {
          ...prev,
          sceneImages: images.filter((img): img is string => img !== null)
        } : null);
      } catch (imageError) {
        console.warn("Image generation skipped due to quota limits. Documentary will continue without images.", imageError);
        // Continue without images instead of failing
        setDocData(prev => prev ? {
          ...prev,
          sceneImages: []
        } : null);
      }
      
      // Steps 6-8: Simulated composition steps
      for (let i = 6; i <= 8; i++) {
        setGenerationStep(i);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      setView('result');
      
      // Save to Firebase if user is logged in
      if (user) {
        await saveDocumentary({
          ...generatedData,
          prompt: prompt,
          sceneImages: images.filter((img): img is string => img !== null)
        });
      }
    } catch (err) {
      console.error("Generation error details:", err);
      
      let errorMessage = "Something went wrong during generation. Please try again.";
      
      if (err instanceof Error) {
        if (err.message.includes('API key') || err.message.includes('GEMINI_API_KEY')) {
          errorMessage = "API Key Error: Please configure your GEMINI_API_KEY in .env.local file";
        } else if (err.message.includes('permission') || err.message.includes('403')) {
          errorMessage = "Permission Denied: Check your API key and quota limits";
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
          errorMessage = "Network Error: Check your internet connection";
        } else if (err.message.includes('quota') || err.message.includes('429')) {
          errorMessage = "Rate Limit Exceeded: Please wait a moment and try again";
        } else {
          errorMessage = err.message || errorMessage;
        }
      }
      
      setView('create');
      alert(`Error: ${errorMessage}\n\nPlease check the browser console for detailed error information.`);
    }
  };

  const handleExportScript = () => {
    if (!docData) return;
    const content = `DOCUGEN GENERATED DOCUMENTARY\n\nTITLE: ${docData.title}\n\nNARRATION SCRIPT:\n${docData.script}\n\nSCENE BREAKDOWN:\n${docData.scenes.map((s, i) => `\nSCENE ${i+1}: ${s.title}\nVisual: ${s.description}\nPrompt: ${s.visualPrompt}`).join('\n')}`;
    const element = document.createElement("a");
    const file = new Blob([content], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${docData.title.toLowerCase().replace(/\s+/g, '_')}_script.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: docData?.title || 'My DocuGen Documentary',
        text: `I just generated a documentary about ${prompt} using DocuGen!`,
        url: window.location.href,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Link copied to clipboard!");
    }
  };

  const handleDownload = () => {
    handleExportScript();
    alert("Your Production Package (Script & Scene Breakdown) is downloading. Video rendering is processing in the background.");
  };

  useEffect(() => {
    let interval: any;
    if (isPlaying && docData) {
      interval = setInterval(() => {
        setCurrentSceneIndex((prev) => (prev + 1) % docData.scenes.length);
      }, SCENE_DURATION * 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, docData]);

  const totalSeconds = (docData?.scenes.length || 0) * SCENE_DURATION;
  const displayMinutes = Math.floor(totalSeconds / 60);
  const displaySeconds = totalSeconds % 60;
  const durationLabel = `${displayMinutes}:${displaySeconds.toString().padStart(2, '0')} MIN`;

  const currentStep = workflowSteps[generationStep - 1] || workflowSteps[0];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-emerald-100 overflow-x-hidden">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-100/50 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-green-100/30 blur-[120px]" />
      </div>

      <AnimatePresence mode="wait">
        {view === 'auth' && (
          <AuthView 
            onBack={() => setView('landing')} 
            onSuccess={() => setView('landing')} 
          />
        )}

        {view === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
          >
            {/* Navigation */}
            <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Film className="text-white w-6 h-6" />
                </div>
                <span className="text-xl font-bold tracking-tight text-zinc-900">DocuGen</span>
              </div>
              <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-500">
                <a href="#workflow" className="hover:text-emerald-600 transition-colors">Workflow</a>
                {user ? (
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setView('history')}
                      className="hover:text-emerald-600 transition-colors flex items-center gap-1"
                    >
                      <History className="w-4 h-4" />
                      History
                    </button>
                    <button 
                      onClick={handleCreateClick}
                      className="px-5 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-all font-semibold shadow-md shadow-emerald-600/10"
                    >
                      Get Started
                    </button>
                    <button 
                      onClick={logout}
                      className="px-4 py-2 rounded-full border border-zinc-200 hover:bg-zinc-50 transition-all"
                    >
                      Logout
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleLogin}
                    className="px-5 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-all font-semibold shadow-md shadow-emerald-600/10"
                  >
                    Login / Register
                  </button>
                )}
              </div>
            </nav>

            {/* Hero Section */}
            <header className="relative z-10 pt-20 pb-32 px-6 text-center max-w-4xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <span className="inline-block px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-semibold tracking-widest uppercase text-emerald-600 mb-6">
                  AI-Powered Storytelling
                </span>
                <h1 className="text-6xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-8 bg-clip-text text-transparent bg-gradient-to-b from-zinc-900 to-zinc-600">
                  From Prompt to <br /> Documentary.
                </h1>
                <p className="text-zinc-600 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
                  DocuGen is an end-to-end multi-modal AI platform that automatically generates 
                  micro-documentary videos from a single text prompt.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button 
                    onClick={() => user ? handleCreateClick() : setView('auth')}
                    className="group px-8 py-4 rounded-full bg-emerald-600 text-white font-bold text-lg hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-xl shadow-emerald-600/20"
                  >
                    Create Your First Doc
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button className="px-8 py-4 rounded-full bg-white border border-zinc-200 text-zinc-900 font-bold text-lg hover:bg-zinc-50 transition-all shadow-sm">
                    Watch Examples
                  </button>
                </div>
              </motion.div>
            </header>

            {/* Workflow Section */}
            <section id="workflow" className="relative z-10 py-24 px-6 max-w-7xl mx-auto">
              <div className="mb-20 text-center">
                <h2 className="text-4xl font-bold tracking-tight mb-4 text-zinc-900">The DocuGen Workflow</h2>
                <p className="text-zinc-500 max-w-xl mx-auto">
                  Our sophisticated AI pipeline handles everything from research to final composition.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {workflowSteps.map((step, index) => (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="group relative p-8 rounded-3xl bg-white border border-zinc-200 hover:border-emerald-200 transition-all hover:shadow-xl hover:shadow-emerald-500/5"
                  >
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center mb-6 shadow-lg`}>
                      {step.icon}
                    </div>
                    <div className="absolute top-8 right-8 text-4xl font-black text-zinc-100 group-hover:text-emerald-50 transition-colors pointer-events-none">
                      0{step.id}
                    </div>
                    <h3 className="text-xl font-bold mb-3 text-zinc-900">{step.title}</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">
                      {step.description}
                    </p>
                  </motion.div>
                ))}
              </div>
            </section>

            {/* Feature Highlight */}
            <section className="relative z-10 py-32 px-6 overflow-hidden bg-white">
              <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                >
                  <h2 className="text-5xl font-bold tracking-tight mb-8 leading-tight text-zinc-900">
                    Professional Quality, <br />
                    <span className="text-emerald-600">Zero Editing Required.</span>
                  </h2>
                  <div className="space-y-6">
                    {[
                      "Cinematic scene transitions",
                      "Context-aware visual selection",
                      "Natural human-like narration",
                      "Dynamic background music scoring"
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        </div>
                        <span className="text-zinc-700 font-medium">{item}</span>
                      </div>
                    ))}
                  </div>
                  <button className="mt-12 group flex items-center gap-2 text-emerald-600 font-bold hover:text-emerald-700 transition-colors">
                    Learn more about our engine
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  className="relative aspect-video rounded-3xl overflow-hidden border border-zinc-200 shadow-2xl"
                >
                  <img 
                    src="https://picsum.photos/seed/documentary/1200/800" 
                    alt="AI Generation Preview" 
                    className="w-full h-full object-cover opacity-90"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
                      <PlayCircle className="w-10 h-10 text-white fill-white" />
                    </div>
                  </div>
                  <div className="absolute bottom-8 left-8 right-8">
                    <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                      <motion.div 
                        initial={{ width: 0 }}
                        whileInView={{ width: "65%" }}
                        transition={{ duration: 2, delay: 0.5 }}
                        className="h-full bg-emerald-500" 
                      />
                    </div>
                    <div className="flex justify-between mt-3 text-[10px] font-mono text-white uppercase tracking-widest">
                      <span>Rendering Scene 04: The Industrial Age</span>
                      <span>65% Complete</span>
                    </div>
                  </div>
                </motion.div>
              </div>
            </section>

            {/* Footer */}
            <footer className="relative z-10 border-t border-zinc-100 bg-white pt-20 pb-10 px-6">
              <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-20">
                  <div className="col-span-2">
                    <div className="flex items-center gap-2 mb-6">
                      <Film className="text-emerald-600 w-6 h-6" />
                      <span className="text-xl font-bold tracking-tight text-zinc-900">DocuGen</span>
                    </div>
                    <p className="text-zinc-500 max-w-xs leading-relaxed">
                      The future of automated storytelling. Create impactful documentaries in minutes, not months.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold mb-6 text-zinc-900">Platform</h4>
                    <ul className="space-y-4 text-zinc-500 text-sm">
                      <li><a href="#" className="hover:text-emerald-600 transition-colors">Pricing</a></li>
                      <li><a href="#" className="hover:text-emerald-600 transition-colors">API</a></li>
                      <li><a href="#" className="hover:text-emerald-600 transition-colors">Documentation</a></li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-bold mb-6 text-zinc-900">Company</h4>
                    <ul className="space-y-4 text-zinc-500 text-sm">
                      <li><a href="#" className="hover:text-emerald-600 transition-colors">About</a></li>
                      <li><a href="#" className="hover:text-emerald-600 transition-colors">Blog</a></li>
                      <li><a href="#" className="hover:text-emerald-600 transition-colors">Careers</a></li>
                    </ul>
                  </div>
                </div>
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-10 border-t border-zinc-100 text-zinc-400 text-xs">
                  <p>© 2026 DocuGen AI. All rights reserved.</p>
                  <div className="flex gap-8">
                    <a href="#" className="hover:text-zinc-600">Privacy Policy</a>
                    <a href="#" className="hover:text-zinc-600">Terms of Service</a>
                  </div>
                </div>
              </div>
            </footer>
          </motion.div>
        )}

        {view === 'create' && (
          <motion.div
            key="create"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 min-h-screen flex flex-col"
          >
            {/* Creation Header */}
            <header className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full">
              <div className="flex items-center gap-4">
                <button 
                  onClick={handleBackClick}
                  className="p-2 rounded-full hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-900"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-2">
                  <Film className="text-emerald-600 w-6 h-6" />
                  <span className="text-xl font-bold tracking-tight text-zinc-900">DocuGen</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setView('history')}
                  className="p-2 rounded-full hover:bg-zinc-100 transition-colors text-zinc-400"
                >
                  <History className="w-5 h-5" />
                </button>
                <button className="p-2 rounded-full hover:bg-zinc-100 transition-colors text-zinc-400">
                  <Settings className="w-5 h-5" />
                </button>
                {user && user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || 'User avatar'} 
                    className="w-8 h-8 rounded-full border border-zinc-200"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center border border-zinc-200">
                    <UserIcon className="w-4 h-4 text-zinc-400" />
                  </div>
                )}
              </div>
            </header>

            {/* Creation Main */}
            <main className="flex-1 flex flex-col items-center justify-center px-6 max-w-4xl mx-auto w-full pb-20">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-center mb-12"
              >
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-zinc-900">What's your story?</h2>
                <p className="text-zinc-500 text-lg">Describe the documentary you want to create in a few sentences.</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="w-full relative"
              >
                <div className="relative group">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g., The history of the internet, from ARPANET to the modern web..."
                    className="w-full h-48 bg-white border-2 border-zinc-100 rounded-3xl p-8 text-xl text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-emerald-500/50 transition-all resize-none shadow-xl shadow-zinc-200/50"
                  />
                  <div className="absolute bottom-6 right-6 flex items-center gap-4">
                    <span className="text-xs font-mono text-zinc-300 uppercase tracking-widest">
                      {prompt.length} / 500
                    </span>
                    <button 
                      onClick={handleSend}
                      disabled={!prompt.trim()}
                      className="p-4 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20"
                    >
                      <Send className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                {/* Suggestions */}
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  {[
                    "The rise of sustainable energy",
                    "Life in Ancient Rome",
                    "The evolution of jazz music",
                    "Deep sea exploration"
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setPrompt(suggestion)}
                      className="px-4 py-2 rounded-full bg-white border border-zinc-200 text-sm text-zinc-500 hover:text-emerald-600 hover:border-emerald-200 transition-all shadow-sm"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </motion.div>
            </main>
          </motion.div>
        )}

        {view === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="relative z-10 min-h-screen flex flex-col"
          >
            <header className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setView('landing')}
                  className="p-2 rounded-full hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-900"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-2">
                  <Film className="text-emerald-600 w-6 h-6" />
                  <span className="text-xl font-bold tracking-tight text-zinc-900">My Documentaries</span>
                </div>
              </div>
              <button 
                onClick={handleCreateClick}
                className="px-5 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-all font-semibold shadow-md shadow-emerald-600/10"
              >
                Create New
              </button>
            </header>

            <main className="flex-1 px-8 py-12 max-w-7xl mx-auto w-full">
              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <div className="w-12 h-12 rounded-full border-4 border-zinc-100 border-t-emerald-500 animate-spin mb-4" />
                  <p className="text-zinc-500">Loading your collection...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-zinc-100 shadow-sm">
                  <div className="w-20 h-20 rounded-full bg-zinc-50 flex items-center justify-center mx-auto mb-6">
                    <Film className="w-10 h-10 text-zinc-300" />
                  </div>
                  <h3 className="text-2xl font-bold text-zinc-900 mb-2">No documentaries yet</h3>
                  <p className="text-zinc-500 mb-8">Start your first journey into AI-powered storytelling.</p>
                  <button 
                    onClick={handleCreateClick}
                    className="px-8 py-3 rounded-full bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                  >
                    Create Now
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {history.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group bg-white rounded-3xl border border-zinc-200 overflow-hidden hover:shadow-xl hover:shadow-emerald-500/5 transition-all cursor-pointer"
                      onClick={() => {
                        setDocData(item);
                        setView('result');
                      }}
                    >
                      <div className="aspect-video relative overflow-hidden">
                        <img 
                          src={item.sceneImages?.[0] || `https://picsum.photos/seed/${item.id}/800/450`} 
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <PlayCircle className="w-12 h-12 text-white" />
                        </div>
                      </div>
                      <div className="p-6">
                        <h3 className="text-lg font-bold text-zinc-900 mb-2 line-clamp-1">{item.title}</h3>
                        <p className="text-zinc-500 text-sm line-clamp-2 mb-4">{item.prompt}</p>
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                          <span>{item.scenes.length} Scenes</span>
                          <span>{item.createdAt?.toDate().toLocaleDateString()}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </main>
          </motion.div>
        )}

        {view === 'generating' && (
          <motion.div
            key="generating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6"
          >
            <div className="max-w-2xl w-full text-center">
              <div className="mb-12 relative inline-block">
                <div className="w-32 h-32 rounded-full border-4 border-zinc-100 border-t-emerald-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${currentStep.gradient} flex items-center justify-center animate-pulse shadow-lg`}>
                    {React.cloneElement(currentStep.icon as React.ReactElement<any>, { className: "w-8 h-8 text-white" })}
                  </div>
                </div>
              </div>
              
              <motion.div
                key={generationStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <h2 className="text-3xl font-bold tracking-tight text-zinc-900">
                  {currentStep.title}
                </h2>
                <p className="text-zinc-500 text-lg max-w-md mx-auto">
                  {currentStep.description}
                </p>
              </motion.div>

              <div className="mt-16 w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-emerald-500"
                  initial={{ width: "0%" }}
                  animate={{ width: `${(generationStep / 8) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <div className="mt-4 flex justify-between text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                <span>Step {generationStep} of 8</span>
                <span>{Math.round((generationStep / 8) * 100)}% Complete</span>
              </div>
            </div>
          </motion.div>
        )}

        {view === 'result' && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 min-h-screen flex flex-col"
          >
            <header className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full">
              <div className="flex items-center gap-4">
                <button 
                  onClick={handleBackClick}
                  className="p-2 rounded-full hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-900"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-2">
                  <Film className="text-emerald-600 w-6 h-6" />
                  <span className="text-xl font-bold tracking-tight text-zinc-900">DocuGen</span>
                </div>
              </div>
              <button 
                onClick={handleBackClick}
                className="px-5 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-all font-semibold shadow-md shadow-emerald-600/10"
              >
                Create New
              </button>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center px-6 max-w-5xl mx-auto w-full pb-20">
              <div className="w-full aspect-video rounded-3xl overflow-hidden border border-zinc-200 shadow-2xl relative group mb-12 bg-zinc-100">
                <img 
                  src={docData?.sceneImages?.[0] || `https://picsum.photos/seed/${prompt.length}/1920/1080`} 
                  alt="Generated Documentary" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div 
                    onClick={() => setIsPlaying(true)}
                    className="w-20 h-20 rounded-full bg-white text-emerald-600 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform shadow-xl"
                  >
                    <PlayCircle className="w-10 h-10 fill-current" />
                  </div>
                </div>
                <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between">
                  <div>
                    <h3 className="text-2xl font-bold mb-2 text-white drop-shadow-lg">{docData?.title || prompt}</h3>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 rounded bg-black/30 backdrop-blur-md text-[10px] font-bold uppercase tracking-widest text-white">4K Ultra HD</span>
                      <span className="px-2 py-1 rounded bg-black/30 backdrop-blur-md text-[10px] font-bold uppercase tracking-widest text-white">{durationLabel}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                <button 
                  onClick={handleDownload}
                  className="p-6 rounded-2xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 flex flex-col items-center gap-3"
                >
                  <PlayCircle className="w-8 h-8" />
                  Download Video
                </button>
                <button 
                  onClick={handleShare}
                  className="p-6 rounded-2xl bg-white border border-zinc-200 text-zinc-900 font-bold hover:bg-zinc-50 transition-all flex flex-col items-center gap-3 shadow-sm"
                >
                  <Send className="w-8 h-8 text-emerald-600" />
                  Share Documentary
                </button>
                <button 
                  onClick={handleExportScript}
                  className="p-6 rounded-2xl bg-white border border-zinc-200 text-zinc-900 font-bold hover:bg-zinc-50 transition-all flex flex-col items-center gap-3 shadow-sm"
                >
                  <FileText className="w-8 h-8 text-emerald-600" />
                  Export Script
                </button>
              </div>

              {/* Script Preview */}
              <div className="mt-12 w-full p-8 rounded-3xl bg-white border border-zinc-100 shadow-sm">
                <h4 className="text-lg font-bold mb-4 flex items-center gap-2 text-zinc-900">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  Generated Script Preview
                </h4>
                <p className="text-zinc-500 leading-relaxed italic">
                  "{docData?.script || 'Your script is being finalized...'}"
                </p>
              </div>
            </main>

            {/* Video Player Modal */}
            <AnimatePresence>
              {isPlaying && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] bg-black flex flex-col"
                >
                  <div className="flex items-center justify-between p-8">
                    <div className="flex flex-col">
                      <h3 className="text-xl font-bold">{docData?.title}</h3>
                      <span className="text-xs text-zinc-500 uppercase tracking-widest">Scene {currentSceneIndex + 1} of {docData?.scenes.length}</span>
                    </div>
                    <button 
                      onClick={() => {
                        setIsPlaying(false);
                        setCurrentSceneIndex(0);
                      }}
                      className="p-3 rounded-full bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
                    >
                      <ArrowLeft className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="w-full max-w-5xl aspect-video bg-zinc-900 rounded-3xl overflow-hidden relative border border-zinc-800 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={currentSceneIndex}
                          initial={{ opacity: 0, scale: 1.1 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 1 }}
                          className="absolute inset-0"
                        >
                          <img 
                            src={docData?.sceneImages?.[currentSceneIndex] || `https://picsum.photos/seed/${prompt.length + currentSceneIndex}/1920/1080`} 
                            alt="Scene" 
                            className="w-full h-full object-cover opacity-80"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
                            <motion.div
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.5 }}
                              className="max-w-3xl"
                            >
                              <h4 className="text-emerald-400 text-sm font-bold uppercase tracking-[0.3em] mb-4">
                                {docData?.scenes[currentSceneIndex].title}
                              </h4>
                              <p className="text-3xl md:text-4xl font-serif italic leading-relaxed text-white drop-shadow-2xl">
                                {docData?.scenes[currentSceneIndex].description}
                              </p>
                            </motion.div>
                          </div>
                        </motion.div>
                      </AnimatePresence>

                      {/* Progress Bar for current scene */}
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
                        <motion.div 
                          key={currentSceneIndex}
                          initial={{ width: 0 }}
                          animate={{ width: "100%" }}
                          transition={{ duration: SCENE_DURATION, ease: "linear" }}
                          className="h-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)]"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Scene Navigation Dots */}
                  <div className="pb-12 flex justify-center gap-3">
                    {docData?.scenes.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentSceneIndex(i)}
                        className={`w-2 h-2 rounded-full transition-all ${i === currentSceneIndex ? 'w-8 bg-indigo-500' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
