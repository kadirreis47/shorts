import { useEffect, useState, useRef, useCallback } from 'react';
import { Image as ImageIcon, Type, Loader2, Download, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Video } from '@/lib/types';
import { Card, Button } from '@/components/ui';
import { classNames } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const TEMPLATES = [
  { key: 'bold', labelKey: 'thumbnail.bold', bg: '#0f172a', text: '#ffffff', accent: '#fbbf24' },
  { key: 'minimal', labelKey: 'thumbnail.minimal', bg: '#ffffff', text: '#0f172a', accent: '#3b82f6' },
  { key: 'emoji', labelKey: 'thumbnail.emoji', bg: '#7c3aed', text: '#ffffff', accent: '#fde047' },
  { key: 'gradient', labelKey: 'thumbnail.gradient', bg: '#gradient', text: '#ffffff', accent: '#fbbf24' },
];

export function ThumbnailGenerator() {
  const { t } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<string>('');
  const [template, setTemplate] = useState('bold');
  const [headline, setHeadline] = useState('');
  const [bgColor, setBgColor] = useState('#0f172a');
  const [textColor, setTextColor] = useState('#ffffff');
  const [accentColor, setAccentColor] = useState('#fbbf24');
  const [fontSize, setFontSize] = useState(48);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('videos').select('*').order('created_at', { ascending: false }).limit(50);
      setVideos(data ?? []);
    })();
  }, []);

  const drawThumbnail = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1280, H = 720;
    canvas.width = W;
    canvas.height = H;

    // Background
    if (bgColor === '#gradient') {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#7c3aed');
      grad.addColorStop(0.5, '#ec4899');
      grad.addColorStop(1, '#f59e0b');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = bgColor;
    }
    ctx.fillRect(0, 0, W, H);

    // Accent bar
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, H - 20, W, 20);

    // Accent strip at top
    ctx.fillStyle = accentColor;
    ctx.fillRect(60, 60, 8, 80);

    // Headline text
    ctx.fillStyle = textColor;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Word wrap
    const words = (headline || t('thumbnail.headlinePlaceholder')).toUpperCase().split(' ');
    const lines: string[] = [];
    let currentLine = '';
    const maxWidth = W - 160;
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize * 1.2;
    let y = 200;
    for (const line of lines) {
      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      ctx.fillText(line, 80, y);
      ctx.shadowColor = 'transparent';
      y += lineHeight;
    }

    // Channel watermark
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = accentColor;
    ctx.fillText('SHORTS', 80, H - 80);
    ctx.fillStyle = textColor;
    ctx.fillText('FLOW', 180, H - 80);
  }, [bgColor, textColor, accentColor, fontSize, headline, t]);

  useEffect(() => { drawThumbnail(); }, [drawThumbnail]);

  function applyTemplate(key: string) {
    const tpl = TEMPLATES.find((tp) => tp.key === key);
    if (tpl) {
      setTemplate(key);
      setBgColor(tpl.bg);
      setTextColor(tpl.text);
      setAccentColor(tpl.accent);
    }
  }

  async function handleSave() {
    if (!selectedVideo) return;
    setSaving(true);
    try {
      const canvas = canvasRef.current;
      const dataUrl = canvas?.toDataURL('image/png') ?? null;
      const { data } = await supabase.from('thumbnails').insert({
        video_id: selectedVideo,
        template,
        headline_text: headline,
        bg_color: bgColor,
        text_color: textColor,
        accent_color: accentColor,
        font_size: fontSize,
        generated_url: dataUrl,
      }).select().single();
      if (data) {
        await supabase.from('videos').update({ thumbnail_id: data.id }).eq('id', selectedVideo);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    setSaving(false);
  }

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `thumbnail-${selectedVideo || 'preview'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('thumbnail.title')}</h1>
        <p className="text-sm text-slate-500">{t('thumbnail.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Preview */}
        <Card className="p-5">
          <h3 className="mb-3 font-semibold text-slate-900">{t('thumbnail.preview')}</h3>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <canvas ref={canvasRef} className="w-full" style={{ aspectRatio: '16/9' }} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={handleDownload} disabled={!selectedVideo}>
              <Download size={16} /> Download
            </Button>
            <Button onClick={handleSave} disabled={saving || !selectedVideo}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : <ImageIcon size={16} />}
              {saving ? t('thumbnail.generating') : saved ? t('thumbnail.saved') : t('thumbnail.generate')}
            </Button>
          </div>
        </Card>

        {/* Controls */}
        <Card className="p-5">
          <div className="space-y-4">
            {/* Video selection */}
            <div>
              <label className="text-sm font-medium text-slate-700">{t('thumbnail.selectVideo')}</label>
              <select value={selectedVideo} onChange={(e) => setSelectedVideo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                <option value="">{t('thumbnail.noVideo')}</option>
                {videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
              </select>
            </div>

            {/* Template */}
            <div>
              <label className="text-sm font-medium text-slate-700">{t('thumbnail.template')}</label>
              <div className="mt-1 grid grid-cols-4 gap-2">
                {TEMPLATES.map((tpl) => (
                  <button key={tpl.key} onClick={() => applyTemplate(tpl.key)}
                    className={classNames('rounded-lg border p-2 text-center text-xs font-medium transition-colors',
                      template === tpl.key ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50')}>
                    {t(tpl.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Headline */}
            <div>
              <label className="text-sm font-medium text-slate-700">{t('thumbnail.headline')}</label>
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={t('thumbnail.headlinePlaceholder')}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>

            {/* Colors */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500">{t('thumbnail.bgColor')}</label>
                <input type="color" value={bgColor === '#gradient' ? '#7c3aed' : bgColor} onChange={(e) => setBgColor(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">{t('thumbnail.textColor')}</label>
                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">{t('thumbnail.accentColor')}</label>
                <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200" />
              </div>
            </div>

            {/* Font size */}
            <div>
              <label className="text-sm font-medium text-slate-700">{t('thumbnail.fontSize')}: {fontSize}px</label>
              <input type="range" min="28" max="80" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}
                className="mt-1 w-full accent-slate-900" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
