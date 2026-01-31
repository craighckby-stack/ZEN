import React, { useState, useEffect, useReducer, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, writeBatch, query, onSnapshot, 
  serverTimestamp, limit, doc
} from 'firebase/firestore';
import { 
  getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';

/**
 * --- Sovereign v86.15 Resilient Routing ---
 * Fix: Explicit handling for AI 404 errors by falling back to 1.5 Flash.
 * Fix: Improved input field contrast and focus states.
 * Logic: Context-Aware Persona Routing with High-Contrast UI.
 */

const CORE_CONFIG = {
  MAX_FILE_SIZE: 500000, 
  CYCLE_INTERVAL: 40000, 
  MAX_RETRIES: 5,        
  MODELS: [
    { id: 'gemini-2.5-flash-preview-09-2025', label: 'Flash 2.5 (Preview)', tier: 1 },
    { id: 'gemini-1.5-flash', label: 'Flash 1.5 (Stable)', tier: 2 },
    { id: 'gemini-1.5-pro', label: 'Pro 1.5 (High Power)', tier: 3 }
  ],
  PIPELINES: {
    CODE: [
      { id: 'refactor', label: 'Refactor', icon: '🛠️', text: 'Act as a Principal Engineer. Refactor for performance/readability.' },
      { id: 'security', label: 'Security', icon: '🛡️', text: 'Act as a Security Auditor. Fix vulnerabilities.' },
      { id: 'docs', label: 'Docs', icon: '📝', text: 'Act as a Technical Writer. Add JSDoc/Docstrings.' }
    ],
    CONFIG: [
      { id: 'validate', label: 'Lint', icon: '⚙️', text: 'Act as a DevOps Engineer. Validate syntax and sort keys.' }
    ],
    MARKDOWN: [
      { id: 'grammar', label: 'Clarity', icon: '✍️', text: 'Act as an Editor. Improve prose and formatting.' }
    ]
  },
  EXT_MAP: {
    code: /\.(js|jsx|ts|tsx|py|html|css|scss|sql|sh|java|go|rs|rb|php|cpp|c|h)$/i,
    config: /\.(json|yaml|yml|toml|ini)$/i,
    docs: /\.(md|txt|rst|adoc)$/i
  },
  SKIP_PATTERNS: [/node_modules\//, /\.min\./, /-lock\./, /dist\//, /build\//, /\.git\//],
  APP_ID: typeof __app_id !== 'undefined' ? __app_id : 'emg-v86-sovereign'
};

const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const initialState = {
  isLive: false,
  isAcknowledged: false,
  isIndexed: false,
  status: 'IDLE',
  activePath: 'Ready for Uplink',
  pipelineStep: '',
  selectedModel: localStorage.getItem('emg_active_model_v86') || CORE_CONFIG.MODELS[0].id,
  targetRepo: localStorage.getItem('emg_repo_v86') || '',
  logs: [],
  insights: [],
  metrics: { mutations: 0, steps: 0, errors: 0, progress: 0 }
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_VAL': 
      if (['selectedModel', 'targetRepo'].includes(action.key)) {
        localStorage.setItem(`emg_${action.key}_v86`, action.value.toString());
      }
      return { ...state, [action.key]: action.value };
    case 'ACKNOWLEDGE': return { ...state, isAcknowledged: true };
    case 'TOGGLE': return { ...state, isLive: !state.isLive, status: !state.isLive ? 'INITIALIZING' : 'IDLE' };
    case 'LOG': return { ...state, logs: [{ ...action.payload, id: Math.random() }, ...state.logs].slice(0, 50) };
    case 'SET_STATUS': return { ...state, status: action.value, activePath: action.path || state.activePath, pipelineStep: action.step || '' };
    case 'UPDATE_METRICS': 
      return { ...state, metrics: {
        mutations: state.metrics.mutations + (action.m || 0),
        steps: state.metrics.steps + (action.stepIncr || 0),
        errors: state.metrics.errors + (action.e || 0),
        progress: action.total ? Math.round((action.cursor / action.total) * 100) : state.metrics.progress
      }};
    case 'SET_INSIGHTS': return { ...state, insights: action.payload };
    default: return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [user, setUser] = useState(null);
  const ghTokenRef = useRef('');
  const geminiKeyRef = useRef('');
  const isBusy = useRef(false);
  const queueRef = useRef(JSON.parse(localStorage.getItem('emg_queue_v86')) || []);
  const indexRef = useRef(parseInt(localStorage.getItem('emg_cursor_v86'), 10) || 0);

  const pushLog = useCallback((msg, type = 'info') => {
    dispatch({ type: 'LOG', payload: { msg, type, timestamp: new Date().toLocaleTimeString([], { hour12: false }) } });
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token).catch(() => signInAnonymously(auth));
      } else { await signInAnonymously(auth); }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', CORE_CONFIG.APP_ID, 'users', user.uid, 'insights'), limit(15));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      dispatch({ type: 'SET_INSIGHTS', payload: data });
    });
  }, [user]);

  const geminiFetch = async (prompt, systemPrompt, modelId, apiKey, retryCount = 0) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { responseMimeType: "text/plain", temperature: 0.1 }
    };

    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      
      if (res.status === 404) {
        // RESILIENT ROUTING: Handle 404 by switching to stable model
        if (modelId !== 'gemini-1.5-flash') {
          pushLog(`Model ${modelId} unavailable. Falling back to Flash 1.5.`, "error");
          dispatch({ type: 'SET_VAL', key: 'selectedModel', value: 'gemini-1.5-flash' });
          throw new Error("RETRY_STABLE");
        }
      }

      if (res.ok) return await res.json();
      
      if (retryCount < CORE_CONFIG.MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, retryCount);
        await new Promise(r => setTimeout(r, delay));
        return geminiFetch(prompt, systemPrompt, modelId, apiKey, retryCount + 1);
      }
      throw new Error(`AI ${res.status}`);
    } catch (e) {
      if (e.message === "RETRY_STABLE") {
          return geminiFetch(prompt, systemPrompt, 'gemini-1.5-flash', apiKey, 0);
      }
      if (retryCount < CORE_CONFIG.MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
        return geminiFetch(prompt, systemPrompt, modelId, apiKey, retryCount + 1);
      }
      throw e;
    }
  };

  const runPipeline = async (path, repo, headers, geminiKey, modelId) => {
    try {
      const encodedPath = path.split('/').map(s => encodeURIComponent(s)).join('/');
      const fRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}`, { headers });
      if (!fRes.ok) throw new Error(`GitHub Access Error: ${fRes.status}`);
      const fData = await fRes.json();
      let currentContent = decodeURIComponent(escape(atob(fData.content)));
      const sha = fData.sha;

      let activePipeline = CORE_CONFIG.PIPELINES.CODE;
      if (path.match(CORE_CONFIG.EXT_MAP.config)) activePipeline = CORE_CONFIG.PIPELINES.CONFIG;
      if (path.match(CORE_CONFIG.EXT_MAP.docs)) activePipeline = CORE_CONFIG.PIPELINES.MARKDOWN;

      let successSteps = 0;

      for (const step of activePipeline) {
        dispatch({ type: 'SET_STATUS', value: 'OPTIMIZING', path, step: step.label });
        const systemPrompt = `${step.text}\nOutput ONLY the updated file content. NO markdown formatting blocks. NO preamble. NO chatter.`;
        const prompt = `Target File Path: ${path}\n\nExisting Content:\n${currentContent}`;

        const aiData = await geminiFetch(prompt, systemPrompt, modelId, geminiKey);
        let opt = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        // Clean markdown backticks if AI ignores system prompt
        if (opt) opt = opt.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();

        if (opt && opt !== currentContent && opt.length > 5) {
          currentContent = opt;
          successSteps++;
          dispatch({ type: 'UPDATE_METRICS', stepIncr: 1 });
        }
      }

      if (successSteps > 0) {
        const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ message: `[Sovereign v86.15] Automatic Optimization: ${path}`, content: btoa(unescape(encodeURIComponent(currentContent))), sha })
        });
        return putRes.ok ? 'MUTATED' : `GH_PUT_${putRes.status}`;
      }
      return 'SKIPPED';
    } catch (e) { return { status: 'ERROR', message: e.message }; }
  };

  const runCycle = useCallback(async () => {
    if (!state.isLive || isBusy.current || !user || !state.isIndexed) return;
    isBusy.current = true;
    const target = queueRef.current[indexRef.current];

    if (!target) {
      pushLog("Full Vault Sync Complete", "success");
      dispatch({ type: 'SET_VAL', key: 'isLive', value: false });
      isBusy.current = false;
      return;
    }

    try {
      const repo = state.targetRepo.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
      const headers = { 'Authorization': `token ${ghTokenRef.current}`, 'Accept': 'application/vnd.github.v3+json' };
      const result = await runPipeline(target, repo, headers, geminiKeyRef.current, state.selectedModel);

      if (result === 'MUTATED') {
        const batch = writeBatch(db);
        batch.set(doc(collection(db, 'artifacts', CORE_CONFIG.APP_ID, 'users', user.uid, 'insights')), { filePath: target, timestamp: serverTimestamp() });
        await batch.commit();
        pushLog(`Successfully Optimized: ${target.split('/').pop()}`, "success");
        dispatch({ type: 'UPDATE_METRICS', m: 1 });
      } else if (result.status === 'ERROR') {
        pushLog(`Failed: ${target.split('/').pop()} - ${result.message}`, "error");
        dispatch({ type: 'UPDATE_METRICS', e: 1 });
      }

      indexRef.current += 1;
      localStorage.setItem('emg_cursor_v86', indexRef.current.toString());
      dispatch({ type: 'UPDATE_METRICS', cursor: indexRef.current, total: queueRef.current.length });
    } finally {
      isBusy.current = false;
      dispatch({ type: 'SET_STATUS', value: 'IDLE' });
    }
  }, [state.isLive, state.targetRepo, state.selectedModel, state.isIndexed, user, pushLog]);

  useEffect(() => {
    if (!state.isLive) return;
    const t = setInterval(runCycle, CORE_CONFIG.CYCLE_INTERVAL);
    runCycle();
    return () => clearInterval(t);
  }, [state.isLive, runCycle]);

  const startIndexing = async () => {
    try {
      dispatch({ type: 'SET_STATUS', value: 'INDEXING' });
      const repo = state.targetRepo.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
      const headers = { 'Authorization': `token ${ghTokenRef.current}`, 'Accept': 'application/vnd.github.v3+json' };
      const r = await fetch(`https://api.github.com/repos/${repo}`, { headers });
      const rData = await r.json();
      const t = await fetch(`https://api.github.com/repos/${repo}/git/trees/${rData.default_branch}?recursive=1`, { headers });
      const tData = await t.json();
      
      const files = (tData?.tree || [])
        .filter(f => 
          f.type === 'blob' && 
          f.size < CORE_CONFIG.MAX_FILE_SIZE && 
          (f.path.match(CORE_CONFIG.EXT_MAP.code) || f.path.match(CORE_CONFIG.EXT_MAP.config) || f.path.match(CORE_CONFIG.EXT_MAP.docs)) &&
          !CORE_CONFIG.SKIP_PATTERNS.some(p => p.test(f.path))
        )
        .map(f => f.path);

      queueRef.current = files;
      localStorage.setItem('emg_queue_v86', JSON.stringify(files));
      indexRef.current = 0;
      dispatch({ type: 'SET_VAL', key: 'isIndexed', value: true });
      pushLog(`Indexing Success: ${files.length} artifacts filtered`, "success");
    } catch (e) { pushLog(`GitHub Index Error: ${e.message}`, "error"); }
    finally { dispatch({ type: 'SET_STATUS', value: 'IDLE' }); }
  };

  if (!state.isAcknowledged) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-8 text-white font-mono">
        <div className="max-w-md w-full p-12 rounded-[2.5rem] bg-zinc-900 border border-emerald-500/20 text-center shadow-2xl">
          <div className="text-5xl mb-6 animate-pulse">📡</div>
          <h1 className="text-3xl font-black uppercase tracking-tighter mb-2 text-white">Sovereign <span className="text-emerald-500">v86.15</span></h1>
          <p className="text-[10px] text-emerald-500/60 uppercase tracking-[0.5em] mb-12 font-bold italic">Resilient Routing Protocol</p>
          <button onClick={() => dispatch({ type: 'ACKNOWLEDGE' })} className="w-full py-5 bg-emerald-600 rounded-xl font-black uppercase text-[11px] tracking-widest hover:bg-emerald-500 transition-all text-white shadow-lg shadow-emerald-500/20 active:scale-95">Establish Link</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020202] text-zinc-300 p-4 md:p-8 font-mono selection:bg-emerald-500/40">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <header className="p-8 rounded-[2.5rem] bg-zinc-900 border border-white/10 flex flex-col lg:flex-row items-center justify-between gap-8 shadow-xl">
          <div className="flex items-center gap-6">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl border-2 transition-all duration-700 ${state.isLive ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
              {state.isLive ? '🔥' : '🧊'}
            </div>
            <div>
              <h1 className="text-xl font-black text-white uppercase tracking-tighter italic">Sovereign <span className="text-emerald-500">v15</span></h1>
              <div className="flex items-center gap-3 mt-1">
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${state.isLive ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{state.status}</span>
                <span className="text-[10px] text-zinc-100 uppercase tracking-widest font-black truncate max-w-[250px]">{state.activePath}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button 
              onClick={() => state.isLive ? dispatch({ type: 'TOGGLE' }) : (state.isIndexed ? dispatch({ type: 'TOGGLE' }) : startIndexing())}
              className={`px-12 py-5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${state.isLive ? 'bg-red-600 text-white shadow-lg shadow-red-500/20' : state.isIndexed ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30' : 'bg-white text-black hover:bg-zinc-200'}`}
            >
              {state.isLive ? 'Emergency Stop' : state.isIndexed ? 'Execute Sync' : 'Initialize Index'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <div className="p-8 bg-zinc-900 border border-white/10 rounded-[2.5rem] space-y-6 shadow-md">
              {[
                { id: 'targetRepo', label: 'Vault Identifier (user/repo)', ph: 'e.g. facebook/react' },
                { id: 'token', label: 'GitHub Access Key', ph: 'ghp_...' },
                { id: 'apiKey', label: 'AI Interface Key', ph: 'AIza...' }
              ].map((f) => (
                <div key={f.id} className="space-y-2">
                  <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest ml-1">{f.label}</label>
                  <input 
                    type={f.id === 'targetRepo' ? 'text' : 'password'} 
                    value={f.id === 'targetRepo' ? state.targetRepo : undefined} 
                    onChange={e => f.id === 'targetRepo' ? dispatch({ type: 'SET_VAL', key: 'targetRepo', value: e.target.value }) : (f.id === 'token' ? ghTokenRef.current = e.target.value : geminiKeyRef.current = e.target.value)} 
                    className="w-full bg-black border-2 border-white/10 rounded-xl p-5 text-[14px] outline-none text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all placeholder:text-zinc-800" 
                    placeholder={f.ph}
                  />
                </div>
              ))}
            </div>

            <div className="p-8 bg-zinc-900 border border-white/10 rounded-[2.5rem] space-y-4 shadow-md">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mb-4">Inference Engine</h2>
                {CORE_CONFIG.MODELS.map(m => (
                    <div key={m.id} onClick={() => dispatch({ type: 'SET_VAL', key: 'selectedModel', value: m.id })} className={`p-4 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-all ${state.selectedModel === m.id ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-black border-white/5 text-zinc-600'}`}>
                        <span className="text-[11px] font-black uppercase tracking-tighter">{m.label}</span>
                        <div className={`w-2.5 h-2.5 rounded-full ${state.selectedModel === m.id ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,1)]' : 'bg-zinc-800'}`} />
                    </div>
                ))}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Mutations', val: state.metrics.mutations, color: 'text-emerald-500' },
                    { label: 'Artifacts', val: queueRef.current.length, color: 'text-zinc-500' },
                    { label: 'Coverage', val: `${state.metrics.progress}%`, color: 'text-white' },
                    { label: 'Faults', val: state.metrics.errors, color: 'text-red-600' }
                ].map((s, i) => (
                    <div key={i} className="p-6 bg-zinc-900 border border-white/10 rounded-3xl text-center">
                        <div className={`text-2xl font-black mb-1 ${s.color}`}>{s.val}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{s.label}</div>
                    </div>
                ))}
            </div>

            <div className="h-[480px] bg-black border-2 border-white/5 rounded-[2.5rem] p-10 flex flex-col shadow-inner relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
              <div className="flex justify-between items-center mb-8">
                <span className="text-[11px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full bg-emerald-500 ${state.isLive ? 'animate-ping' : ''}`}></span>
                    Telemetry Stream
                </span>
                <span className="text-[10px] text-zinc-700 font-bold uppercase tracking-widest">Build_v86.15</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 text-[12px] scrollbar-hide pr-2 font-mono">
                {state.logs.map(l => (
                  <div key={l.id} className="flex gap-6 py-2 border-b border-white/5 items-start">
                    <span className="text-zinc-600 font-bold tabular-nums shrink-0">{l.timestamp}</span>
                    <span className={`font-medium ${l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-emerald-300' : 'text-zinc-200'}`}>{l.msg}</span>
                  </div>
                ))}
                {state.logs.length === 0 && <div className="text-zinc-800 italic mt-8 text-center uppercase tracking-[0.4em] text-[11px]">System Idle - Awaiting Command</div>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {state.insights.map(i => (
                <div key={i.id} className="p-6 bg-zinc-900 border border-white/10 rounded-2xl flex flex-col justify-between h-40 hover:border-emerald-500 transition-colors cursor-default group">
                  <div className="min-w-0">
                    <div className="text-[12px] font-black text-white truncate uppercase mb-1 group-hover:text-emerald-400 transition-colors">{i.filePath?.split('/').pop()}</div>
                    <div className="text-[9px] text-zinc-500 truncate font-mono uppercase tracking-tighter">{i.filePath}</div>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-white/5">
                    <span className="text-[9px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md uppercase tracking-widest">Optimized</span>
                    <span className="text-[10px] text-zinc-400 font-black">{i.timestamp?.seconds ? new Date(i.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'}) : '...'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        input:focus { box-shadow: 0 0 20px rgba(16, 185, 129, 0.05); }
      `}</style>
    </div>
  );
                    }
