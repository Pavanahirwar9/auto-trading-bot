import { useEffect, useMemo, useState } from 'react';
import { Brain, Play, Square, Sparkles, TrendingUp, Target, ShieldAlert } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ComposedChart, Area, Line } from 'recharts';
import {
  analyzeAiStrategy,
  getAiTradeSessions,
  startAiTradeSession,
  stopAiTradeSession,
} from '../api/aiStrategy.js';

const BACKEND_ORIGIN =
  (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace('/api', '');

const ACTIVE_SESSION_KEY = 'aiStrategy.activeSessionId';

type NextDayPrediction = {
  stopLoss: number;
  entry: number;
  target: number;
  rationale?: string;
};

type AnalysisPayload = {
  nextDayPrediction?: NextDayPrediction;
  source?: string;
};

type StrategyPayload = {
  rules?: {
    entry?: { whenPriceAtOrBelow?: number };
    stopLoss?: number;
    takeProfit?: number;
  };
  [key: string]: unknown;
};

type AnalysisResult = {
  analysis?: AnalysisPayload;
  strategy?: StrategyPayload;
};

type TradeLogEntry = {
  type: string;
  timestamp: string;
  [key: string]: unknown;
};

type SessionPayload = {
  id: string;
  status: string;
  symbol?: string;
  quantity?: number;
  lastPrice?: number | null;
  tradeLog?: TradeLogEntry[];
  [key: string]: unknown;
};

type EventItem = {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

type ChartPoint = {
  name: string;
  price: number;
  color: string;
};

const COMMON_SYMBOLS = [
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
  'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'LT.NS', 'HINDUNILVR.NS',
  'TATAMOTORS.NS', 'WIPRO.NS', 'ASIANPAINT.NS', 'BAJFINANCE.NS', 'MARUTI.NS'
];

export default function AiStrategy() {
  const [symbol, setSymbol] = useState('RELIANCE.NS');
  const [quantity, setQuantity] = useState(1);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [activeSession, setActiveSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const hasStrategy = Boolean(analysisResult?.strategy);

  const chartData = useMemo<ChartPoint[] | null>(() => {
    const p = analysisResult?.analysis?.nextDayPrediction;
    if (!p) return null;
    return [
      { name: 'Stop Loss', price: p.stopLoss, color: '#EF4444' },
      { name: 'Predicted Entry', price: p.entry, color: '#3B82F6' },
      { name: 'Target/Exit', price: p.target, color: '#10B981' }
    ];
  }, [analysisResult]);

  const activeExecutionStrategy = useMemo<StrategyPayload | null>(() => {
    let executionStrategy = analysisResult?.strategy ?? null;
    const p = analysisResult?.analysis?.nextDayPrediction;
    if (p) {
      executionStrategy = {
        ...(executionStrategy ?? {}),
        rules: {
          ...(executionStrategy?.rules ?? {}),
          entry: { whenPriceAtOrBelow: p.entry },
          stopLoss: p.stopLoss,
          takeProfit: p.target
        }
      };
    }
    return executionStrategy;
  }, [analysisResult]);

  const statusClass = useMemo(() => {
    if (!activeSession) return 'bg-[#1F2937] text-[#9CA3AF]';
    return activeSession.status === 'RUNNING'
      ? 'bg-[#064E3B] text-[#10B981]'
      : 'bg-[#7F1D1D] text-[#FCA5A5]';
  }, [activeSession]);

  const prependEvent = (evt: EventItem) => {
    setEvents((prev) => [evt, ...prev].slice(0, 60));
  };

  const loadSession = async () => {
    try {
      const res = await getAiTradeSessions();
      const payload = res?.data?.data ?? res?.data ?? [];
      const sessions: SessionPayload[] = Array.isArray(payload) ? payload : [];
      const savedId = typeof window !== 'undefined'
        ? window.localStorage.getItem(ACTIVE_SESSION_KEY)
        : null;
      const activeOrLatest = (savedId ? sessions.find((s) => s.id === savedId) : null)
        || sessions.find((s) => s.status === 'RUNNING')
        || sessions[sessions.length - 1];
      setActiveSession(activeOrLatest || null);

      if (activeOrLatest) {
        const feed: EventItem[] = [];
        if (activeOrLatest.lastPrice) {
          feed.push({
            type: 'sync',
            timestamp: new Date().toISOString(),
            payload: { symbol: activeOrLatest.symbol, tickPrice: activeOrLatest.lastPrice, status: activeOrLatest.status }
          });
        }
        activeOrLatest.tradeLog?.forEach((t: TradeLogEntry) => {
          feed.push({ type: t.type === 'BUY' || t.type === 'SELL' ? 'trade_executed' : t.type, timestamp: t.timestamp, payload: t });
        });
        feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setEvents(feed.slice(0, 50));
      }
    } catch {
      // no-op
    }
  };

  useEffect(() => {
    loadSession();
    // HTTP Polling alternative replacing WebSockets
    const interval = setInterval(loadSession, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeSession?.status === 'RUNNING') {
      window.localStorage.setItem(ACTIVE_SESSION_KEY, activeSession.id);
    } else {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  }, [activeSession]);

  const normalizedSymbol = () => {
    const s = symbol.trim().toUpperCase();
    if (!s) return '';
    return s.endsWith('.NS') ? s : `${s}.NS`;
  };

  const handleAnalyze = async () => {
    const s = normalizedSymbol();
    if (!s) {
      toast.error('Please enter a stock symbol.');
      return;
    }

    setLoading(true);
    try {
      const res = await analyzeAiStrategy(s, quantity);
      setAnalysisResult(res?.data || null);
      toast.success('AI analysis and strategy generated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate AI strategy.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    const s = normalizedSymbol();
    if (!s) {
      toast.error('Please enter a stock symbol.');
      return;
    }

    setLoading(true);
    try {
      const res = await startAiTradeSession({
        symbol: s,
        quantity,
        strategy: activeExecutionStrategy,
      });
      setActiveSession(res?.data?.data || res?.data || null);
      toast.success('AI auto trade started using graph predictions.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start AI trade.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!activeSession?.id) {
      toast.error('No active AI trade session found.');
      return;
    }

    setLoading(true);
    try {
      const res = await stopAiTradeSession(activeSession.id);
      setActiveSession(res?.data?.data || res?.data || null);
      toast.success('AI auto trade stopped.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop AI trade.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#3B82F6]/10 flex items-center justify-center">
            <Brain className="text-[#3B82F6]" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">AI Strategy Based</h2>
            <p className="text-xs text-[#6B7280]">Gemini pre-market analysis + Groq intraday strategy + auto paper execution</p>
          </div>
        </div>

        <span className={`text-xs px-3 py-1 rounded-full font-semibold ${statusClass}`}>
          {activeSession?.status || 'IDLE'}
        </span>
      </div>

      <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative md:col-span-2">
          <input
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value.toUpperCase());
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Symbol (e.g. RELIANCE or RELIANCE.NS)"
            className="w-full bg-[#0A0E17] border border-[#1F2937] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3B82F6] transition-colors"
          />
          {showSuggestions && COMMON_SYMBOLS.filter(s => s.toLowerCase().includes(symbol.toLowerCase()) && s !== symbol.toUpperCase()).length > 0 && (
            <ul className="absolute z-10 w-full mt-2 bg-[#111827] border border-[#3B82F6] rounded-lg shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)] max-h-48 overflow-y-auto">
              {COMMON_SYMBOLS
                .filter(s => s.toLowerCase().includes(symbol.toLowerCase()) && s !== symbol.toUpperCase())
                .map((sym) => (
                  <li
                    key={sym}
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent onBlur from firing before click
                      setSymbol(sym);
                      setShowSuggestions(false);
                    }}
                    className="px-3 py-2 text-sm text-[#9CA3AF] hover:bg-[#1F2937] hover:text-white cursor-pointer transition-colors"
                  >
                    {sym}
                  </li>
              ))}
            </ul>
          )}
        </div>
        <input
          type="number"
          value={quantity}
          min={1}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value || 1)))}
          className="bg-[#0A0E17] border border-[#1F2937] rounded-lg px-3 py-2 text-white text-sm"
        />
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="flex items-center justify-center gap-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <Sparkles size={16} />
          Analyze with AI
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4 flex flex-col">
          <h3 className="text-sm font-semibold text-white mb-2 flex items-center justify-between">
            <span>Next Day Auto-Strategy Graph</span>
            {chartData && analysisResult?.analysis?.source?.includes('fallback') && (
              <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-md">Fallback Used</span>
            )}
          </h3>
          
          <div className="bg-[#0A0E17] border border-[#1F2937] rounded-lg p-4 flex-1 min-h-[290px] flex flex-col relative">
            {!chartData ? (
              <div className="text-xs text-[#6B7280] m-auto">Run analysis to generate the visual tracking strategy.</div>
            ) : (
              <>
                <p className="text-xs text-[#9CA3AF] mb-4 text-center">
                  {analysisResult?.analysis?.nextDayPrediction?.rationale || 'AI predicted strategy levels.'}
                </p>
                <div className="flex-1 w-full relative min-h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
                      <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8}/>
                          <stop offset="50%" stopColor="#3B82F6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.8}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                      <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                      <YAxis type="number" stroke="#9CA3AF" tick={{ fontSize: 12 }} domain={['dataMin - Math.abs(dataMin*0.01)', 'dataMax + Math.abs(dataMax*0.01)']} tickFormatter={(v) => v.toFixed(2)} width={60} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#111827', border: '1px solid #3B82F6', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff' }}
                        labelStyle={{ color: '#9CA3AF' }}
                        formatter={(value) => {
                          const numeric = typeof value === 'number' ? value : Number(value);
                          const formatted = Number.isFinite(numeric) ? `₹${numeric.toFixed(2)}` : String(value ?? '');
                          return [formatted, 'Price'];
                        }}
                      />
                      <Area type="monotone" dataKey="price" stroke="none" fill="url(#colorPrice)" />
                      <Line type="monotone" dataKey="price" stroke="url(#colorPrice)" strokeWidth={3} dot={(props: any) => {
                          const colors = ['#EF4444', '#3B82F6', '#10B981'];
                          return <circle cx={props.cx} cy={props.cy} r={6} fill={colors[props.index]} stroke="#111827" strokeWidth={2} key={`dot-${props.index}`} />;
                      }} activeDot={{ r: 8 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-[#1F2937]">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={16} className="text-[#EF4444]" />
                    <div>
                      <div className="text-[10px] text-[#6B7280]">Stop Loss</div>
                      <div className="text-xs font-bold text-white">₹{chartData[0]?.price ?? 0}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-l border-[#1F2937] pl-3">
                    <TrendingUp size={16} className="text-[#3B82F6]" />
                    <div>
                      <div className="text-[10px] text-[#6B7280]">Entry</div>
                      <div className="text-xs font-bold text-white">₹{chartData[1]?.price ?? 0}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-l border-[#1F2937] pl-3">
                    <Target size={16} className="text-[#10B981]" />
                    <div>
                      <div className="text-[10px] text-[#6B7280]">Target</div>
                      <div className="text-xs font-bold text-white">₹{chartData[2]?.price ?? 0}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Groq Auto-Execution Rules (JSON)</h3>
          <pre className="text-xs text-[#9CA3AF] whitespace-pre-wrap bg-[#0A0E17] border border-[#1F2937] rounded-lg p-3 min-h-[240px] overflow-auto">
            {activeExecutionStrategy ? JSON.stringify(activeExecutionStrategy, null, 2) : 'Strategy JSON will appear here after analysis.'}
          </pre>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleStart}
              disabled={loading || !hasStrategy || activeSession?.status === 'RUNNING'}
              className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <Play size={16} />
              Start AI Trade
            </button>
            <button
              onClick={handleStop}
              disabled={loading || !activeSession || activeSession?.status !== 'RUNNING'}
              className="flex items-center gap-2 bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <Square size={16} />
              Stop AI Trade
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-2">Live Tick & Execution Feed (Socket.IO)</h3>
        <div className="bg-[#0A0E17] border border-[#1F2937] rounded-lg p-3 max-h-[300px] overflow-auto space-y-2">
          {events.length === 0 ? (
            <p className="text-xs text-[#6B7280]">No live events yet. Start an AI trade session to stream updates.</p>
          ) : (
            events.map((evt, idx) => (
              <div key={`${evt.timestamp}-${idx}`} className="text-xs text-[#9CA3AF] border-b border-[#1F2937] pb-2">
                <span className="text-[#60A5FA] font-semibold">{evt.type}</span>
                <span className="text-[#6B7280]">  {new Date(evt.timestamp).toLocaleTimeString()}</span>
                <pre className="whitespace-pre-wrap mt-1">{JSON.stringify(evt.payload, null, 2)}</pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
