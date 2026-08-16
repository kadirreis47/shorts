import type { CharacterProfile } from '@/lib/types';

export function reconcileCharacterProfileSelection(
  selectedProfileId: string,
  profiles: readonly CharacterProfile[],
): string {
  return selectedProfileId && profiles.some((profile) => profile.id === selectedProfileId)
    ? selectedProfileId
    : '';
}
