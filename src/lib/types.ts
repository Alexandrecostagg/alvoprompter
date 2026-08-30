export interface Script {
  id?: number
  /** Identificador estável entre dispositivos (UUID). Usado pelo sync em nuvem. */
  key?: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  tags?: string[]
}

export type View =
  | 'library'
  | 'editor'
  | 'prompter'
  | 'video-editor'
  | 'control'
  | 'scheduling'
  | 'workspaces'
  | 'ai-twin'
  | 'video-page'
  | 'metrics'

export type SocialChannel = 'youtube' | 'instagram' | 'tiktok' | 'linkedin' | 'x' | 'whatsapp'

export type PostStatus = 'scheduled' | 'published' | 'cancelled' | 'failed'

export interface ScheduledPost {
  id?: number
  /** Identificador estável entre dispositivos (UUID). Usado pelo sync em nuvem. */
  key?: string
  title: string
  description: string
  channels: SocialChannel[]
  scheduledAt: number
  status: PostStatus
  mediaName?: string
  mediaType?: string
  mediaDataUrl?: string
  scriptTitle?: string
  tags?: string[]
  createdAt: number
  updatedAt: number
}

export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface WorkspaceMember {
  name: string
  email?: string
  role: TeamRole
}

export interface BrandKit {
  name: string
  logoDataUrl?: string
  primaryColor: string
  accentColor: string
  fontFamily?: string
}

export interface Workspace {
  id?: number
  /** Identificador estável entre dispositivos (UUID). Usado pelo sync em nuvem. */
  key?: string
  name: string
  /** Papel do dispositivo atual dentro do workspace. */
  myRole: TeamRole
  members: WorkspaceMember[]
  brandKit?: BrandKit
  createdAt: number
  updatedAt: number
}

export interface AvatarTwin {
  id?: number
  key?: string
  name: string
  imageDataUrl: string
  source: 'photo' | 'flux'
  createdAt: number
}

export interface VoiceSample {
  dataUrl: string
  duration: number
}

export interface VoiceProfile {
  id?: number
  key?: string
  name: string
  samples: VoiceSample[]
  lang: string
  createdAt: number
}

export type AiPanelTab = 'generate' | 'improve' | 'titles'

export type ScrollMode = 'voice' | 'fixed' | 'manual' | 'timed'

export type AspectGuideRatio = 'none' | '9:16' | '1:1' | '16:9'

export type BeautyPreset = 'none' | 'smooth' | 'classic' | 'glamour'

export interface PrompterSettings {
  mode: ScrollMode
  wpm: number
  targetMinutes: number
  fontSize: number
  lineHeight: number
  fontColor: string
  bgColor: string
  bgImage: string | null
  bgVideo: string | null
  fontFamily: string
  letterSpacing: number
  mirror: boolean
  rtl: boolean
  cameraOn: boolean
  cameraPosition: 'top' | 'bottom' | 'side' | 'fullscreen'
  beauty: BeautyPreset
  beautyIntensity: number
  aspectGuide: AspectGuideRatio
  eyeContactDot: boolean
  voiceLang: string
  voiceSensitivity: number
  openMic: boolean
  highlightWords: boolean
}

export const DEFAULT_SETTINGS: PrompterSettings = {
  // A rolagem fixa funciona em todos os navegadores e WebViews Android.
  // O modo por voz continua disponível como opção nos ajustes.
  mode: 'fixed',
  wpm: 150,
  targetMinutes: 3,
  fontSize: 48,
  lineHeight: 1.6,
  fontColor: '#ffffff',
  bgColor: '#000000',
  bgImage: null,
  bgVideo: null,
  fontFamily: 'system-ui, sans-serif',
  letterSpacing: 0,
  mirror: false,
  rtl: false,
  cameraOn: true,
  cameraPosition: 'bottom',
  beauty: 'none',
  beautyIntensity: 60,
  aspectGuide: 'none',
  eyeContactDot: false,
  voiceLang: 'pt-BR',
  voiceSensitivity: 0.6,
  openMic: false,
  highlightWords: true,
}

export type EngineState = 'idle' | 'running' | 'paused' | 'done'
