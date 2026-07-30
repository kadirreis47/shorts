import { useState, useEffect, useCallback } from 'react';
import {
  Captions, Languages, Hash, Type as TypeIcon, Volume2, Lightbulb,
  Copy, Check, Loader2, Play, Square, Sparkles, Wand2,
} from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { classNames } from '@/lib/utils';
import { useI18n, type Lang } from '@/lib/i18n';

type ToolKey = 'subtitles' | 'translate' | 'hashtags' | 'titles' | 'voice' | 'ideas';

const LANGUAGES: { code: string; labelKey: string }[] = [
  { code: 'auto', labelKey: 'aitools.langAuto' },
  { code: 'en', labelKey: 'aitools.langEn' },
  { code: 'tr', labelKey: 'aitools.langTr' },
  { code: 'es', labelKey: 'aitools.langEs' },
  { code: 'fr', labelKey: 'aitools.langFr' },
  { code: 'de', labelKey: 'aitools.langDe' },
  { code: 'ja', labelKey: 'aitools.langJa' },
  { code: 'ar', labelKey: 'aitools.langAr' },
  { code: 'ru', labelKey: 'aitools.langRu' },
  { code: 'pt', labelKey: 'aitools.langPt' },
  { code: 'it', labelKey: 'aitools.langIt' },
  { code: 'zh', labelKey: 'aitools.langZh' },
  { code: 'hi', labelKey: 'aitools.langHi' },
  { code: 'ko', labelKey: 'aitools.langKo' },
  { code: 'nl', labelKey: 'aitools.langNl' },
];

const VOICE_LANG_MAP: Record<string, string> = {
  en: 'en', tr: 'tr', es: 'es', fr: 'fr', de: 'de', ja: 'ja', ar: 'ar', ru: 'ru', pt: 'pt', it: 'it', zh: 'zh', hi: 'hi', ko: 'ko', nl: 'nl',
};

const TOOLS: { key: ToolKey; icon: typeof Captions; labelKey: string; descKey: string; free: boolean }[] = [
  { key: 'subtitles', icon: Captions, labelKey: 'aitools.subtitleGen', descKey: 'aitools.subtitleGenDesc', free: true },
  { key: 'translate', icon: Languages, labelKey: 'aitools.translateSubs', descKey: 'aitools.translateSubsDesc', free: true },
  { key: 'hashtags', icon: Hash, labelKey: 'aitools.hashtagGen', descKey: 'aitools.hashtagGenDesc', free: true },
  { key: 'titles', icon: TypeIcon, labelKey: 'aitools.titleGen', descKey: 'aitools.titleGenDesc', free: true },
  { key: 'voice', icon: Volume2, labelKey: 'aitools.voiceClone', descKey: 'aitools.voiceCloneDesc', free: true },
  { key: 'ideas', icon: Lightbulb, labelKey: 'aitools.scriptIdeas', descKey: 'aitools.scriptIdeasDesc', free: true },
];

export function AITools() {
  const { t } = useI18n();
  const [activeTool, setActiveTool] = useState<ToolKey>('subtitles');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fromLang, setFromLang] = useState('auto');
  const [toLang, setToLang] = useState('tr');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
      if (v.length > 0 && !selectedVoice) setSelectedVoice(v[0].name);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [selectedVoice]);

  const handleGenerate = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setOutput('');
    try {
      switch (activeTool) {
        case 'subtitles': {
          const lines = input.split(/[.!?]+/).filter(s => s.trim());
          const formatted = lines.map((line, i) => `${String(i + 1).padStart(2, '0')}:${String(Math.floor(i * 3)).padStart(2, '0')}:${String(Math.floor((i * 3 % 1) * 60)).padStart(2, '0')} --> ${String(Math.floor(i * 3) + 3).padStart(2, '0')}:00\n${line.trim()}`).join('\n\n');
          setOutput(formatted);
          break;
        }
        case 'translate': {
          if (fromLang === toLang || (fromLang === 'auto' && toLang === 'tr')) {
            setOutput(await freeTranslate(input, fromLang, toLang));
          } else {
            setOutput(await freeTranslate(input, fromLang, toLang));
          }
          break;
        }
        case 'hashtags': {
          const words = input.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const baseTags = words.slice(0, 5).map(w => '#' + w.replace(/[^a-z0-9]/g, ''));
          const generic = ['#shorts', '#youtube', '#viral', '#trending', '#fyp', '#foryou', '#shortvideo', '#ytshorts'];
          const all = [...new Set([...baseTags, ...generic])].slice(0, 20);
          setOutput(all.join(' '));
          break;
        }
        case 'titles': {
          const titles = [
            `${input.length > 50 ? input.slice(0, 50) + '...' : input} — You Won't Believe What Happened Next`,
            `The Truth About ${input.slice(0, 40)}`,
            `${input.slice(0, 30)}: What Nobody Tells You`,
            `This ${input.slice(0, 30)} Trick Changed Everything`,
            `Why ${input.slice(0, 35)} Is More Important Than You Think`,
            `${input.slice(0, 40)} — The Ultimate Guide`,
            `Stop Doing ${input.slice(0, 30)} Wrong (Here's Why)`,
            `The ${input.slice(0, 35)} Secret Nobody Talks About`,
          ];
          setOutput(titles.join('\n\n'));
          break;
        }
        case 'ideas': {
          const ideas = [
            `5 things about "${input}" that will blow your mind`,
            `The real reason ${input} matters more than you think`,
            `I tried ${input} for 30 days — here's what happened`,
            `Nobody talks about this ${input} secret`,
            `This is why ${input} is about to change everything`,
            `The biggest mistake people make with ${input}`,
            `3 ${input} hacks that actually work`,
            `What ${input} looks like in 2025`,
          ];
          setOutput(ideas.join('\n\n'));
          break;
        }
        case 'voice': {
          setOutput(t('aitools.noInput'));
          break;
        }
      }
    } catch {
      setOutput('Error generating. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [activeTool, input, fromLang, toLang, t]);

  async function freeTranslate(text: string, from: string, to: string): Promise<string> {
    const langPair = from === 'auto' ? to : `${from}|${to}`;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from === 'auto' ? 'auto' : from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Translation failed');
      const data = await res.json();
      const translated = (data[0] as string[][]).map(s => s[0]).join('');
      return translated || text;
    } catch {
      return `[Translation unavailable — ${langPair}]\n\n${text}`;
    }
  }

  function handleSpeak() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!input.trim()) return;
    const utterance = new SpeechSynthesisUtterance(input);
    const voice = voices.find(v => v.name === selectedVoice);
    if (voice) utterance.voice = voice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  function handleCopy() {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filteredVoices = activeTool === 'voice'
    ? voices.filter(v => {
        const langPrefix = VOICE_LANG_MAP[toLang] ?? 'en';
        return v.lang.toLowerCase().startsWith(langPrefix);
      })
    : voices;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('aitools.title')}</h1>
        <p className="text-sm text-slate-500">{t('aitools.subtitle')}</p>
      </div>

      {/* Tool Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.key}
              onClick={() => { setActiveTool(tool.key); setOutput(''); }}
              className={classNames(
                'flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all',
                activeTool === tool.key
                  ? 'border-slate-900 bg-slate-50 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <div className={classNames(
                'flex h-10 w-10 items-center justify-center rounded-lg',
                activeTool === tool.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
              )}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">{t(tool.labelKey)}</p>
              </div>
              {tool.free && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-600">{t('aitools.free')}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Tool */}
      <Card className="p-5">
        <div className="mb-4">
          <h3 className="font-semibold text-slate-900">{t(TOOLS.find(t => t.key === activeTool)!.labelKey)}</h3>
          <p className="text-sm text-slate-500">{t(TOOLS.find(t => t.key === activeTool)!.descKey)}</p>
        </div>

        <div className="space-y-4">
          {/* Language selectors for translate tool */}
          {activeTool === 'translate' && (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-500">{t('aitools.fromLang')}</label>
                <select value={fromLang} onChange={(e) => setFromLang(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{t(l.labelKey)}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-500">{t('aitools.toLang')}</label>
                <select value={toLang} onChange={(e) => setToLang(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                  {LANGUAGES.filter(l => l.code !== 'auto').map(l => <option key={l.code} value={l.code}>{t(l.labelKey)}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Voice selector for voice tool */}
          {activeTool === 'voice' && (
            <div>
              <label className="text-xs font-medium text-slate-500">{t('aitools.selectVoice')}</label>
              <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                {filteredVoices.length === 0 && <option value="">No voices available</option>}
                {filteredVoices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
              </select>
              <p className="mt-2 text-xs text-slate-400">
                {filteredVoices.length} voices available for this language
              </p>
            </div>
          )}

          {/* Input */}
          <div>
            <label className="text-xs font-medium text-slate-500">
              {activeTool === 'hashtags' || activeTool === 'titles' || activeTool === 'ideas' ? t('aitools.inputTopic') : t('aitools.inputText')}
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={5}
              placeholder={activeTool === 'hashtags' || activeTool === 'titles' || activeTool === 'ideas' ? t('aitools.inputTopicPlaceholder') : t('aitools.inputTextPlaceholder')}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {activeTool === 'voice' ? (
              <Button onClick={handleSpeak} disabled={!input.trim()}>
                {speaking ? <><Square size={16} /> {t('aitools.stop')}</> : <><Play size={16} /> {t('aitools.speak')}</>}
              </Button>
            ) : (
              <Button onClick={handleGenerate} disabled={!input.trim() || loading}>
                {loading ? <><Loader2 size={16} className="animate-spin" /> {t('aitools.generating')}</> : <><Sparkles size={16} /> {t('aitools.generate')}</>}
              </Button>
            )}
            <Button variant="secondary" onClick={() => { setInput(''); setOutput(''); }}>
              {t('aitools.clear')}
            </Button>
          </div>

          {/* Output */}
          {output && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-500">{t('aitools.result')}</label>
                <button onClick={handleCopy} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                  {copied ? <><Check size={12} /> {t('aitools.copied')}</> : <><Copy size={12} /> {t('aitools.copy')}</>}
                </button>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans">{output}</pre>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Info Banner */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Wand2 size={16} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">All tools are free — no API keys required</p>
            <p className="mt-0.5 text-xs text-slate-500">
              These tools run directly in your browser or use free public APIs. Translation uses Google Translate's free endpoint. Voice preview uses your browser's built-in speech synthesis. Hashtag, title, and idea generators use built-in algorithms.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
