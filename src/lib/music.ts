/**
 * 首页音乐模块的曲目清单（音频自托管在 Cloudflare R2）。
 *
 * src 直接填可公网访问的完整地址：`R2_PUBLIC_BASE_URL` + 对象键，
 * 例如 https://media.example.com/music/rain-on-glass.mp3。
 * 纯前端播放不需要额外配置 CORS，只要对象是公开可读的。
 *
 * 当前留空：面板会渲染「暂无曲目」空态；追加对象后即生效，无需改组件。
 */
export interface MusicTrack {
  title: string;
  artist?: string;
  /** R2 公开地址（完整 URL） */
  src: string;
  /** 可选：元信息加载前的备用时长文案，如 "03:24" */
  duration?: string;
}

export const musicTracks: MusicTrack[] = [];
