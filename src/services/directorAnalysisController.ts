import type { DirectorApplicationService } from './directorApplicationService';
import type { CreateMediaProjectInput, MediaEngine } from '@/core/media';
import { useMediaStore } from '@/store/mediaStore';

let directorService: DirectorApplicationService | null = null;
let mediaEngine: MediaEngine | null = null;

export interface ActiveDirectorProjectRequest {
  readonly projectId: string;
  readonly buildInput: Omit<CreateMediaProjectInput, 'projectId'>;
}

export function configureDirectorAnalysisController(
  service: DirectorApplicationService | null,
  engine: MediaEngine | null,
): void {
  directorService = service;
  mediaEngine = engine;
}

export async function analyzeActiveDirectorProject(signal?: AbortSignal, request?: ActiveDirectorProjectRequest) {
  if (!directorService) throw new Error('AI Director service henüz hazır değil.');
  if (request) {
    if (!request.projectId.trim()) throw new Error('AI Director analizi için geçerli bir aktif proje kimliği gerekli.');
    if (!request.buildInput.scenes.length) throw new Error('AI Director analizi için projeye en az bir sahne ekleyin.');
    if (!mediaEngine) throw new Error('Media Engine henüz hazır değil; uygulamayı yeniden başlatıp tekrar deneyin.');
    const result = await mediaEngine.buildProject({ ...request.buildInput, projectId: request.projectId });
    if (result.manifest.projectId !== request.projectId || result.project.id !== request.projectId) {
      throw new Error('Üretilen manifest aktif projeyle eşleşmiyor; projeyi yeniden açıp tekrar deneyin.');
    }
    useMediaStore.getState().setBuildResult(result.project, result.manifest, result.renderReady, result.assetResolution, result.validation);
  }
  const { project, manifest } = useMediaStore.getState();
  if (!project || !manifest) throw new Error('Analiz edilecek manifest yok. Studio’da sahneleri hazırlayıp “AI Director Analizi”ni çalıştırın.');
  if (project.id !== manifest.projectId) throw new Error('Aktif proje ile manifest eşleşmiyor; Studio’dan analizi yeniden başlatın.');
  return directorService.analyzeManifest(manifest, { signal });
}
