export type ExportAspect = 'original' | '9:16' | '4:5' | '1:1' | '16:9'
export const SOCIAL_DESTINATIONS = [
  { id: 'reels', label: 'Instagram Reels', aspect: '9:16', tip: 'Escolha Instagram no compartilhamento e continue em Reel. Confira a capa e a posição das legendas antes de publicar.' },
  { id: 'stories', label: 'Instagram Stories', aspect: '9:16', tip: 'Salve as partes no aparelho e abra Instagram → Seu story. Selecione os arquivos na ordem indicada e confira a prévia antes de publicar.' },
  { id: 'feed-portrait', label: 'Instagram Feed · retrato 4:5', aspect: '4:5', tip: 'Abra o Instagram e selecione o vídeo salvo. Confira o recorte na prévia da publicação.' },
  { id: 'tiktok', label: 'TikTok', aspect: '9:16', tip: 'Escolha TikTok no compartilhamento. Revise o texto, a capa e a privacidade no TikTok antes de publicar.' },
  { id: 'shorts', label: 'YouTube Shorts', aspect: '9:16', tip: 'Escolha YouTube no compartilhamento e revise o Short. Vídeos verticais ou quadrados de até 3 minutos podem ser Shorts.' },
  { id: 'youtube', label: 'YouTube · vídeo horizontal', aspect: '16:9', tip: 'Escolha YouTube no compartilhamento ou envie o arquivo pelo YouTube Studio. Confira título, capa e visibilidade.' },
  { id: 'feed', label: 'Instagram · feed quadrado', aspect: '1:1', tip: 'Abra o Instagram e selecione o vídeo salvo. Confira o enquadramento na prévia da publicação.' },
  { id: 'custom', label: 'Outro destino / formato personalizado', aspect: null, tip: 'Compartilhe pelo menu do aparelho ou baixe o arquivo e selecione-o na plataforma desejada.' },
] as const
export type SocialDestinationId = typeof SOCIAL_DESTINATIONS[number]['id']
export function socialDestination(id: string | undefined) {
  return SOCIAL_DESTINATIONS.find(d => d.id === id) ?? SOCIAL_DESTINATIONS.find(d => d.id === 'custom')!
}
export interface ExportFileInfo { width: number; height: number; duration: number; bytes: number; type: string }
export function exportWarnings(destination: SocialDestinationId, info: ExportFileInfo): string[] {
  const warnings: string[] = []
  if (!info.bytes || !info.width || !info.height || !Number.isFinite(info.duration) || info.duration <= 0) warnings.push('Não foi possível conferir este arquivo. Gere o vídeo novamente antes de compartilhar.')
  if (['reels', 'stories', 'feed-portrait', 'feed'].includes(destination) && !info.type.toLowerCase().startsWith('video/mp4')) warnings.push('Este aparelho gerou WebM. Para o Instagram, use um aparelho com exportação MP4 ou converta o arquivo antes de publicar. Mudar a extensão não converte o vídeo.')
  if (destination === 'shorts' && info.duration > 180) warnings.push('Este vídeo passa de 3 minutos. Reduza os trechos para publicar como Short ou escolha YouTube horizontal.')
  if (destination === 'shorts' && info.width > info.height) warnings.push('Para Shorts, use um vídeo vertical ou quadrado.')
  if (destination === 'tiktok' && info.duration > 180) warnings.push('Confira o limite de duração disponível na sua conta TikTok antes de publicar.')
  return warnings
}

/** Parts refer to the final edited timeline, including its intro/outro. */
export function storyRanges(duration: number, seconds = 60, encoderHeadroom = 0): { start: number; end: number }[] {
  if (!Number.isFinite(duration) || duration <= 0 || ![15, 30, 60].includes(seconds) || !Number.isFinite(encoderHeadroom) || encoderHeadroom < 0 || encoderHeadroom > 1) throw new Error('Duração inválida para dividir os Stories.')
  if (duration > 1800) throw new Error('Selecione até 30 minutos para gerar as partes de Stories.')
  const length = seconds - encoderHeadroom
  const count = Math.max(1, Math.ceil(duration / length))
  if (count > 30) throw new Error('Selecione um trecho menor para gerar até 30 partes por vez.')
  return Array.from({ length: count }, (_, index) => ({ start: index * length, end: Math.min(duration, (index + 1) * length) }))
}
export function storyFileName(index: number, count: number, type: string): string {
  return `alvoprompter-story-${String(index + 1).padStart(2, '0')}-de-${String(count).padStart(2, '0')}.${type.includes('mp4') ? 'mp4' : 'webm'}`
}
export function socialFileName(destination: SocialDestinationId, type: string, now = new Date()): string {
  const ext = type.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm'
  return `alvoprompter-${destination}-${now.toISOString().slice(0,19).replace(/[:T]/g,'-')}.${ext}`
}
