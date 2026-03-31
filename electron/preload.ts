import { contextBridge, ipcRenderer } from 'electron';
import type { KeelAPI } from '../src/shared/types';

const api: KeelAPI = {
  chat: (messages) => ipcRenderer.invoke('keel:chat', messages),

  chatStream: (messages) => ipcRenderer.invoke('keel:chat-stream', messages),

  onStreamChunk: (callback) => {
    ipcRenderer.on('keel:chat-stream-chunk', (_event, chunk) => callback(chunk));
  },

  onStreamDone: (callback) => {
    ipcRenderer.on('keel:chat-stream-done', () => callback());
  },

  onStreamError: (callback) => {
    ipcRenderer.on('keel:chat-stream-error', (_event, error) => callback(error));
  },

  removeStreamListeners: () => {
    ipcRenderer.removeAllListeners('keel:chat-stream-chunk');
    ipcRenderer.removeAllListeners('keel:chat-stream-done');
    ipcRenderer.removeAllListeners('keel:chat-stream-error');
  },

  getSettings: () => ipcRenderer.invoke('keel:get-settings'),

  saveSettings: (settings) => ipcRenderer.invoke('keel:save-settings', settings),

  ensureBrain: () => ipcRenderer.invoke('keel:ensure-brain'),

  capture: (input) => ipcRenderer.invoke('keel:capture', input),

  dailyBrief: () => ipcRenderer.invoke('keel:daily-brief'),

  eod: (chatHistory) => ipcRenderer.invoke('keel:eod', chatHistory),

  exportPdf: (markdownContent, title) => ipcRenderer.invoke('keel:export-pdf', markdownContent, title),

  resetProfile: () => ipcRenderer.invoke('keel:reset-profile'),

  saveChat: (sessionId, messages) => ipcRenderer.invoke('keel:save-chat', sessionId, messages),

  loadChat: (sessionId) => ipcRenderer.invoke('keel:load-chat', sessionId),

  getLatestSession: () => ipcRenderer.invoke('keel:get-latest-session'),

  listSessions: () => ipcRenderer.invoke('keel:list-sessions'),
};

contextBridge.exposeInMainWorld('keel', api);
