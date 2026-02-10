
export interface Project {
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  media: MediaInfo;
  tracks: Track[];
  appLayout: AppLayout;
}

export interface MediaInfo {
  videoPath: string;
  audioPath?: string;
  durationMs: number;
}

export interface AppLayout {
  panels: Record<string, PanelState>;
}

export interface PanelState {
  docked: 'left' | 'right' | 'bottom' | null;
  visible: boolean;
  size?: number; // width or height depending on dock
}

export interface Track {
  id: string;
  name: string;
  order: number;
  visible: boolean;
  locked: boolean;
  transform: TrackTransform;
  defaultStyle: StyleProps;
  trackEffects: Effect[];
  height: number;
  cues: Cue[];
  animTracks: KeyframeTrack<any>[];
  excludeFromExport: boolean;
  magnetEnabled: boolean;
}

export interface TrackTransform {
  xNorm: number;
  yNorm: number;
  anchor: number; // 0-8 for 9-grid
  scale: number;
  rotation: number;
}

export interface EdgeEffectConfig {
  enabled: boolean;
  color: string;   // hex
  width: number;   // size or width
}

export interface StyleProps {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string; // hex
  alpha?: number; // 0-1
  outlineColor?: string;
  outlineWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  backgroundColor?: string;
  backgroundAlpha?: number;
  align?: 'left' | 'center' | 'right';
  italic?: boolean;
  underline?: boolean;
  lineThrough?: boolean;
  edgeType?: 'none' | 'outline' | 'shadow' | 'glow' | 'bevel'; // Legacy single, fallback
  edgeTypes?: ('outline' | 'shadow' | 'glow' | 'bevel')[]; // Legacy multiple
  edgeColor?: string; // Legacy fallback
  edgeEffects?: {
    outline?: EdgeEffectConfig;
    shadow?: EdgeEffectConfig;
    glow?: EdgeEffectConfig;
    bevel?: EdgeEffectConfig;
  };
}

export interface Cue {
  id: string;
  startMs: number;
  endMs: number;
  plainText: string;
  spans: Span[];
  styleOverride?: StyleProps;
  effects?: Effect[];
  posOverride?: Partial<TrackTransform>;
  animTracks: KeyframeTrack<any>[];
}

export interface Span {
  startChar: number;
  endChar: number;
  stylePatch: Partial<StyleProps>;
}

export interface Effect {
  id: string;
  type: string;
  params: Record<string, any>;
}

export interface KeyframeTrack<T> {
  paramPath: string;
  targetId: string; // trackId or cueId
  keyframes: Keyframe<T>[];
  enabled: boolean;
  defaultValue: T;
}

export interface Keyframe<T> {
  id: string;
  tMs: number;
  value: T;
  interp: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';
}
