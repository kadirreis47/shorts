import type { ApplicationEventMap, EventBus } from '@/core/events';
import type { FFmpegCapabilities, GPUDeviceInfo } from './ffmpegTypes';
import type { RenderPreset } from './types';

export type HardwareBackend = 'cpu' | 'nvenc';

export interface HardwareSelection {
  backend: HardwareBackend;
  encoder: string;
  gpu: GPUDeviceInfo | null;
  reason: string;
  automatic: boolean;
}

export interface HardwareLease {
  selection: HardwareSelection;
  release(): void;
}

export interface HardwareScheduler {
  acquire(jobId: string, preset: RenderPreset, capabilities: FFmpegCapabilities, signal: AbortSignal): Promise<HardwareLease>;
  dispose(): void;
}

interface Waiter {
  jobId: string;
  preset: RenderPreset;
  capabilities: FFmpegCapabilities;
  signal: AbortSignal;
  resolve: (lease: HardwareLease) => void;
  reject: (error: Error) => void;
}

export function createHardwareScheduler(eventBus: EventBus<ApplicationEventMap>): HardwareScheduler {
  let activeGpuJobs = 0;
  let disposed = false;
  const waiters: Waiter[] = [];

  const scheduler: HardwareScheduler = {
    acquire(jobId, preset, capabilities, signal) {
      if (disposed) return Promise.reject(new Error('Hardware Scheduler kapatılmış.'));
      if (signal.aborted) return Promise.reject(abortError());

      const selection = selectHardware(preset, capabilities);
      const maxGpuJobs = calculateMaxGpuJobs(selection.gpu);

      if (selection.backend === 'cpu' || activeGpuJobs < maxGpuJobs) {
        return Promise.resolve(createLease(jobId, selection));
      }

      return new Promise<HardwareLease>((resolve, reject) => {
        const waiter: Waiter = { jobId, preset, capabilities, signal, resolve, reject };
        const abort = () => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(abortError());
        };
        signal.addEventListener('abort', abort, { once: true });
        waiters.push(waiter);
        void eventBus.emit('render:hardware-waiting', {
          jobId,
          backend: selection.backend,
          waitingJobs: waiters.length,
          reason: 'GPU eşzamanlı iş sınırı dolu',
        });
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      waiters.splice(0).forEach((waiter) => waiter.reject(new Error('Hardware Scheduler kapatıldı.')));
    },
  };

  function createLease(jobId: string, selection: HardwareSelection): HardwareLease {
    if (selection.backend === 'nvenc') activeGpuJobs += 1;
    let released = false;
    void eventBus.emit('render:hardware-selected', {
      jobId,
      backend: selection.backend,
      encoder: selection.encoder,
      gpuName: selection.gpu?.name ?? null,
      memoryFreeMiB: selection.gpu?.memoryFreeMiB ?? null,
      reason: selection.reason,
      automatic: selection.automatic,
    });
    return {
      selection,
      release() {
        if (released) return;
        released = true;
        if (selection.backend === 'nvenc') activeGpuJobs = Math.max(0, activeGpuJobs - 1);
        drain();
      },
    };
  }

  function drain(): void {
    if (disposed || waiters.length === 0) return;
    for (let index = 0; index < waiters.length; index += 1) {
      const waiter = waiters[index];
      if (waiter.signal.aborted) {
        waiters.splice(index, 1); index -= 1; waiter.reject(abortError()); continue;
      }
      const selection = selectHardware(waiter.preset, waiter.capabilities);
      if (selection.backend === 'nvenc' && activeGpuJobs >= calculateMaxGpuJobs(selection.gpu)) continue;
      waiters.splice(index, 1);
      waiter.resolve(createLease(waiter.jobId, selection));
      index -= 1;
    }
  }

  return scheduler;
}

export function selectHardware(preset: RenderPreset, capabilities: FFmpegCapabilities): HardwareSelection {
  const gpu = chooseGpu(capabilities.gpuDevices);
  const requestedEncoder = preset.videoCodec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc';
  const encoderAvailable = capabilities.hardwareEncoders.includes(requestedEncoder);
  const automatic = preset.hardwareAcceleration === 'auto';

  if (preset.hardwareAcceleration === 'disabled') return cpuSelection(preset, 'Donanım hızlandırma kapalı', false);

  const enoughMemory = gpu?.memoryFreeMiB == null || gpu.memoryFreeMiB >= minimumFreeMemoryMiB(preset);
  if (encoderAvailable && gpu && enoughMemory) {
    return {
      backend: 'nvenc',
      encoder: requestedEncoder,
      gpu,
      reason: automatic ? 'NVENC ve yeterli boş VRAM otomatik algılandı' : 'NVENC kullanıcı tarafından seçildi',
      automatic,
    };
  }
  if (!encoderAvailable) return cpuSelection(preset, `${requestedEncoder} bulunamadı; CPU fallback`, automatic);
  if (!enoughMemory) return cpuSelection(preset, 'Boş VRAM güvenli eşik altında; CPU fallback', automatic);
  return cpuSelection(preset, 'NVIDIA GPU algılanmadı; CPU seçildi', automatic);
}

export function withHardwareSelection(preset: RenderPreset, selection: HardwareSelection): RenderPreset {
  // An explicit planner encoder is authoritative. Hardware scheduling may
  // control admission, but it must never replace QSV/AMF/VideoToolbox/etc.
  if (preset.encoder) return { ...preset };
  return { ...preset, hardwareAcceleration: selection.backend === 'nvenc' ? 'nvenc' : 'disabled' };
}

function cpuSelection(preset: RenderPreset, reason: string, automatic: boolean): HardwareSelection {
  return {
    backend: 'cpu',
    encoder: preset.videoCodec === 'hevc' ? 'libx265' : preset.videoCodec === 'vp9' ? 'libvpx-vp9' : 'libx264',
    gpu: null,
    reason,
    automatic,
  };
}
function chooseGpu(devices: GPUDeviceInfo[]): GPUDeviceInfo | null {
  if (devices.length === 0) return null;
  return [...devices].sort((a,b)=>(b.memoryFreeMiB??0)-(a.memoryFreeMiB??0)||(a.utilizationPercent??100)-(b.utilizationPercent??100))[0];
}
function minimumFreeMemoryMiB(preset: RenderPreset): number {
  if (preset.quality === 'high') return 1200;
  if (preset.quality === 'draft') return 550;
  return 800;
}
function calculateMaxGpuJobs(gpu: GPUDeviceInfo | null): number {
  const total = gpu?.memoryTotalMiB ?? 0;
  if (total >= 12000) return 3;
  if (total >= 7000) return 2;
  return 1;
}
function abortError(): Error { const e=new Error('Render donanım kuyruğu beklemesi iptal edildi.'); e.name='AbortError'; return e; }
