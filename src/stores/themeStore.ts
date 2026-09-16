import { writable } from 'svelte/store';

export type ThemeId =
  | 'gruvbox-dark'
  | 'gruvbox-soft'
  | 'catppuccin'
  | 'tokyo'
  | 'intellij'
  | 'nord'
  | 'dracula'
  | 'one-dark'
  | 'solarized-dark'
  | 'github-dark'
  | 'gruvbox-light';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  zhName: string;
  description: string;
  category: 'dark' | 'soft' | 'light';
  previewColors: [string, string, string, string]; // [bg, surface, accent, text]
  graphColors?: {
    core: string;
    foundational: string;
    derivative: string;
    methodological: string;
  };
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    zhName: '經典暖墨 (預設)',
    description: '經典學術暖墨調，羊皮紙文字，消除冷光藍光刺激',
    category: 'dark',
    previewColors: ['#1d2021', '#282828', '#fe8019', '#ebdbb2'],
    graphColors: {
      core: '#fe8019',
      foundational: '#b8bb26',
      derivative: '#83a598',
      methodological: '#d3869b'
    }
  },
  {
    id: 'gruvbox-soft',
    name: 'Gruvbox Soft Dark',
    zhName: '柔和暖灰',
    description: '柔和暖灰低對比，溫潤紙墨感，適合超長篇深讀',
    category: 'soft',
    previewColors: ['#2a2726', '#32302f', '#fe8019', '#ebdbb2'],
    graphColors: {
      core: '#fe8019',
      foundational: '#b8bb26',
      derivative: '#83a598',
      methodological: '#d3869b'
    }
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin Mocha',
    zhName: '貓布奇諾',
    description: '極受開發者青睞的柔美色調，丁香紫與蜜桃暖意',
    category: 'dark',
    previewColors: ['#181825', '#1e1e2e', '#cba6f7', '#cdd6f4'],
    graphColors: {
      core: '#cba6f7',
      foundational: '#a6e3a1',
      derivative: '#89b4fa',
      methodological: '#f5c2e7'
    }
  },
  {
    id: 'tokyo',
    name: 'Tokyo Night',
    zhName: '東京之夜',
    description: '清冷霓虹深藍夜色，高對比度電氣藍與暖琥珀',
    category: 'dark',
    previewColors: ['#1a1b26', '#24283b', '#7aa2f7', '#c0caf5'],
    graphColors: {
      core: '#7aa2f7',
      foundational: '#9ece6a',
      derivative: '#7dcfff',
      methodological: '#bb9af7'
    }
  },
  {
    id: 'intellij',
    name: 'IntelliJ Dark',
    zhName: '達庫拉 (Darcula)',
    description: 'JetBrains IDE 經典深色調，專業工程與精確閱讀質感',
    category: 'dark',
    previewColors: ['#1e1f22', '#2b2d30', '#3574f0', '#dfe1e5'],
    graphColors: {
      core: '#3574f0',
      foundational: '#59a869',
      derivative: '#56a8f5',
      methodological: '#c77dbb'
    }
  },
  {
    id: 'nord',
    name: 'Nord',
    zhName: '極地雪夜',
    description: '北極冰霜與極光淡雅色彩，清澈專注的北歐冷靜風',
    category: 'dark',
    previewColors: ['#2e3440', '#3b4252', '#88c0d0', '#eceff4'],
    graphColors: {
      core: '#88c0d0',
      foundational: '#a3be8c',
      derivative: '#81a1c1',
      methodological: '#b48ead'
    }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    zhName: '吸血鬼暗調',
    description: '高反差經典黑夜調，亮粉與神秘深紫點綴',
    category: 'dark',
    previewColors: ['#21222c', '#282a36', '#bd93f9', '#f8f8f2'],
    graphColors: {
      core: '#bd93f9',
      foundational: '#50fa7b',
      derivative: '#8be9fd',
      methodological: '#ff79c6'
    }
  },
  {
    id: 'one-dark',
    name: 'One Dark Pro',
    zhName: '極客暗調',
    description: 'Atom / VS Code 雋永經典，平衡耐看的暗調工程色',
    category: 'dark',
    previewColors: ['#21252b', '#282c34', '#61afef', '#abb2bf'],
    graphColors: {
      core: '#61afef',
      foundational: '#98c379',
      derivative: '#56b6c2',
      methodological: '#c678dd'
    }
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    zhName: '日蝕深青',
    description: 'Ethan Schoonover 經典視網膜保護色，深青色系對比',
    category: 'dark',
    previewColors: ['#002b36', '#073642', '#268bd2', '#93a1a1'],
    graphColors: {
      core: '#268bd2',
      foundational: '#859900',
      derivative: '#2aa198',
      methodological: '#6c71c4'
    }
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    zhName: 'GitHub 深色',
    description: '現代 GitHub 介面深色系，舒適深灰搭配標誌性亮藍',
    category: 'dark',
    previewColors: ['#0d1117', '#161b22', '#2f81f7', '#e6edf3'],
    graphColors: {
      core: '#2f81f7',
      foundational: '#3fb950',
      derivative: '#58a6ff',
      methodological: '#bc8cff'
    }
  },
  {
    id: 'gruvbox-light',
    name: 'Gruvbox Light',
    zhName: '經典米白暖調',
    description: '日間學術明亮暖調，仿古籍羊皮紙印刷質感',
    category: 'light',
    previewColors: ['#fbf1c7', '#ebdbb2', '#af3a03', '#282828'],
    graphColors: {
      core: '#af3a03',
      foundational: '#79740e',
      derivative: '#076678',
      methodological: '#8f3f71'
    }
  }
];

function getInitialTheme(): ThemeId {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('mugen_theme') as ThemeId | null;
    if (saved && THEMES.some(t => t.id === saved)) {
      return saved;
    }
  }
  return 'gruvbox-dark';
}

export const currentTheme = writable<ThemeId>(getInitialTheme());

export function setTheme(themeId: ThemeId) {
  if (!THEMES.some(t => t.id === themeId)) return;
  currentTheme.set(themeId);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('mugen_theme', themeId);
      document.documentElement.setAttribute('data-theme', themeId);
      
      // If light theme, toggle dark class on html appropriately
      if (themeId === 'gruvbox-light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
      }
    } catch (e) {
      console.warn('Failed to persist theme to localStorage:', e);
    }
  }
}

export function getCurrentThemeMeta(themeId: ThemeId): ThemeMeta {
  return THEMES.find(t => t.id === themeId) || THEMES[0];
}
