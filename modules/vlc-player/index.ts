// Re-export the native module. On web, it will be resolved to VlcPlayerModule.web.ts
// and on native platforms to VlcPlayerModule.ts
export { default } from './src/VlcPlayerModule';
export { default as VlcPlayerView } from './src/VlcPlayerView';
export * from './src/VlcPlayer.types';
